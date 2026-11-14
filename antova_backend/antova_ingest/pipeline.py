"""The ingest pipeline: manifest -> parse -> locate -> verify -> values -> precedence -> price.

run_ingest() never touches the database; antova_service.persist() writes its result
in one transaction.
"""

from __future__ import annotations

import hashlib
import os
from concurrent.futures import ThreadPoolExecutor
import re
import time
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from statistics import median
from typing import Callable

import anthropic

import antova_engine as engine
from antova_ingest import artifacts, codec, config, costs, extract, sweep
from antova_ingest.artifacts import STAGE_NAMES, StageArtifact
from antova_ingest.costs import ConfigError, Pricing, load_rate_table, price
from antova_ingest.extract import DocumentTooLarge, ExtractError, LocateInvalid, LocateOutcome, LocateRefused, Locator
from antova_ingest.ontology import PARAMETERS, PARAMS_BY_ID, SECTION_LABELS
from antova_ingest.parse import (
    citation_for_span,
    page_sentences,
    words_text,
    TENDER_ID_PATTERN,
    DocumentUnreadable,
    ManifestError,
    load_manifest,
    parse_document,
    verify_quote,
)
from antova_ingest.precedence import add_flag, merge_requirement, resolve
from antova_ingest.types import (
    Citation, Evidence, IngestResult, ParsedDocument, Resolution, SourceDocumentInfo, TenderManifest,
)
from antova_ingest.values import (
    detect_locale, normalize_numbers, parse_bay_count, parse_commissioning_lag, parse_field, read_price, plausible, rule_text,
    value_in_span,
)

STAGES = [
    ("Intake", 5), ("Parse", 20), ("Locate", 60), ("Verify citations", 70),
    ("Read values", 80), ("Resolve precedence", 85), ("Price", 90),
]
SAMPLES_DIR = Path(__file__).resolve().parents[1] / "samples"
_DEGRADES_BID = (DocumentTooLarge, LocateRefused, LocateInvalid)
# Documents located at once. Each is its own the model call (or calls), so this bounds both the
# wall-clock time of an ingest and how hard it presses on the API rate limits.
LOCATE_CONCURRENCY = 3


def locate_concurrency() -> int:
    """ANTOVA_LOCATE_CONCURRENCY, 1 to 8 (1 locates one document at a time); default LOCATE_CONCURRENCY."""
    try:
        value = int(os.environ.get("ANTOVA_LOCATE_CONCURRENCY") or LOCATE_CONCURRENCY)
    except ValueError:
        value = LOCATE_CONCURRENCY
    return min(max(value, 1), 8)


# A headline that deviates from the median of the other bids by more than this share gets a warning.
HEADLINE_PLAUSIBILITY_SHARE = 0.5


class IngestFailed(Exception):
    """The tender cannot be evaluated (bad manifest, unreadable MR, API failure...)."""


class UnknownTender(Exception):
    """No tender folder exists for this ID, or the ID is not well-formed."""


def tenders_root() -> Path:
    return Path(os.environ.get("ANTOVA_TENDERS_DIR") or SAMPLES_DIR)


def tender_dir_for(tender_id: str) -> Path:
    if not re.fullmatch(TENDER_ID_PATTERN, tender_id or ""):
        raise UnknownTender(f"invalid tender id {tender_id!r}")
    path = tenders_root() / tender_id
    if not (path / "manifest.json").is_file():
        raise UnknownTender(f"no tender folder for {tender_id}")
    return path


def _failed(exc: Exception) -> IngestFailed:
    return IngestFailed(f"{type(exc).__name__}: {exc}")


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else ""


def _bbox_text(citation: Citation | None) -> str:
    if citation is None:
        return ""
    x0, y0, x1, y1 = citation.bbox
    return f"Page {citation.page} ({SECTION_LABELS[citation.section]}), BBox [{x0:.1f}, {y0:.1f}, {x1:.1f}, {y1:.1f}]"


def _implausible_headlines(headlines: dict[str, float | None]) -> list[str]:
    """Warn when a bid's headline deviates by more than 50% from the median of the other bids' headlines.

    A misread price (a unit rate taken for the total, a dropped thousands group) is usually off
    by far more than that. The price is reported as read; only a person corrects it.
    """
    pool = {vendor_id: value for vendor_id, value in headlines.items() if value}
    flagged: dict[str, float] = {}  # vendor -> the median it was compared with

    def others_median(vendor_id: str) -> float:
        return median(v for other, v in pool.items() if other != vendor_id)

    def deviation(vendor_id: str) -> float:
        middle = others_median(vendor_id)
        return abs(pool[vendor_id] - middle) / middle

    def distance(vendor_id: str) -> float:
        """How many times above or below the others' median: the same for half and for double."""
        middle = others_median(vendor_id)
        return max(pool[vendor_id] / middle, middle / pool[vendor_id])

    # Take out the worst outlier first, so one misread price does not make the sound bids look
    # implausible. "Worst" is judged by ratio: a price a hundred times too low is further out
    # than one twice too high, though it can never be more than 100% below. Two bids that
    # disagree are both flagged: nothing says which one is wrong.
    while len(pool) >= 2:
        worst = max(pool, key=distance)
        if deviation(worst) <= HEADLINE_PLAUSIBILITY_SHARE:
            break
        if len(pool) == 2:
            flagged.update({vendor_id: others_median(vendor_id) for vendor_id in pool})
            break
        flagged[worst] = others_median(worst)
        del pool[worst]
    return [
        f"{vendor_id}: headline price EUR {headlines[vendor_id]:,.2f} is far from the median of the other bids "
        f"(EUR {flagged[vendor_id]:,.2f}); check the cited passage"
        for vendor_id in headlines if vendor_id in flagged
    ]


def _cell(resolution: Resolution, pricing: Pricing) -> engine.ExtractedParameter:
    primary, secondary = resolution.primary, resolution.secondary
    return engine.ExtractedParameter(
        extracted_text=resolution.extracted_text,
        status=resolution.status,
        confidence=resolution.confidence,
        bbox=_bbox_text(primary),
        snippet=primary.quote if primary else "",
        conflict_note=resolution.conflict_note,
        cost_adder=float(pricing.adder),
        adder_formula=pricing.formula,
        cost_lines=pricing.lines,
        pricing_status=pricing.pricing_status,
        citation=primary.to_dict() if primary else None,
        secondary_citation=secondary.to_dict() if secondary else None,
        checks=[c.to_dict() for c in resolution.checks],
        rate_table_version=pricing.rate_table_version,
        flags=list(resolution.flags),
        evidence=resolution.evidence,
        segments=list(resolution.segments),
        field_citations={s["field"]: s["citation"] for s in resolution.segments},
        assembled_from=resolution.assembled_from,
    )


# --- Stages -------------------------------------------------------------------
#
# Each stage reads the bodies of the stages before it (plain JSON data, exactly as
# stored) and returns its own body. A stage never reads a file or calls the locator,
# except "parsed" (the PDFs) and "located" (the locator). That is what lets a run be
# replayed from any later stage out of the stage_artifacts table.

def _key(vendor_id: str, param_id: str) -> str:
    return f"{vendor_id}|{param_id}"


def _manifest(bodies: dict) -> TenderManifest:
    return TenderManifest.model_validate(bodies["parsed"]["manifest"])


def _documents(bodies: dict, manifest: TenderManifest) -> dict[str, ParsedDocument]:
    """The readable documents, rebuilt from the parsed artifact, with the locator's section labels."""
    by_file = {d["file"]: d for d in bodies["parsed"]["documents"]}
    docs = {}
    for entry in manifest.documents:
        data = by_file[entry.file]
        if data["unreadable"] is None:
            docs[entry.file] = codec.document_from_plain(data, entry)
    for file, sections in bodies.get("verified", {}).get("sections", {}).items():
        for page, section in zip(docs[file].pages, sections):
            page.section = section
    return docs


def _failed_vendors(bodies: dict, manifest: TenderManifest) -> set[str]:
    unreadable = {d["file"] for d in bodies["parsed"]["documents"] if d["unreadable"] is not None}
    failed = {e.vendor_id for e in manifest.documents if e.file in unreadable and e.vendor_id}
    return failed | set(bodies["located"]["failed_vendors"])


def stage_parsed(tender_dir: Path, manifest: TenderManifest) -> dict:
    documents: list[dict] = []
    warnings: list[str] = []
    for entry in manifest.documents:
        try:
            doc = parse_document(tender_dir, entry)
        except DocumentUnreadable as exc:
            if entry.role == "mr_spec":
                raise _failed(exc) from exc
            warnings.append(f"{entry.vendor_id}: {exc.reason}")
            documents.append({"file": entry.file, "sha256": _sha256(tender_dir / entry.file),
                              "unreadable": exc.reason, "pages": []})
            continue
        blank = [p.number for p in doc.pages if not p.has_text]
        warnings.extend(f"{entry.file}: page {n} has no text" for n in blank)
        if blank:
            # One line for the document as a whole: how much of it could not be read.
            warnings.append(
                f"{entry.file}: {len(blank)} of {len(doc.pages)} pages {'has' if len(blank) == 1 else 'have'} no text "
                f"layer (p.{_page_ranges(blank)}); evidence there cannot be read (OCR is not supported)")
        documents.append(codec.document_to_plain(doc))
    return {"manifest": manifest.model_dump(mode="json"), "documents": documents, "warnings": warnings}


def stage_located(bodies: dict, locator: Locator) -> dict:
    """Locate every readable document, up to locate_concurrency() at a time.

    Results are taken in manifest order, so the artifact does not depend on which call finished
    first. A failure that fails the ingest cancels the calls not yet started; the ones already
    running finish, and their answers are saved for the next run.
    """
    manifest = _manifest(bodies)
    docs = _documents(bodies, manifest)
    jobs = [(entry, docs[entry.file]) for entry in manifest.documents if entry.file in docs]
    outcomes: dict[str, dict] = {}
    failed: list[str] = []
    warnings: list[str] = []
    with ThreadPoolExecutor(max_workers=max(1, min(locate_concurrency(), len(jobs)))) as pool:
        futures = [pool.submit(locator.locate, doc) for _, doc in jobs]
        try:
            for (entry, _doc), future in zip(jobs, futures):
                try:
                    outcome = future.result()
                except _DEGRADES_BID as exc:
                    if entry.role == "mr_spec":
                        raise _failed(exc) from exc
                    failed.append(entry.vendor_id)
                    warnings.append(f"{entry.vendor_id}: {exc}")
                    continue
                except (ExtractError, anthropic.APIError) as exc:
                    raise _failed(exc) from exc
                asked = getattr(locator, "model", extract.MODEL)
                if outcome.model and outcome.model != asked:
                    warnings.append(f"{entry.file}: answered by fallback model {outcome.model}, not {asked}")
                record = {
                    "response": outcome.response.model_dump(mode="json"),
                    "input_tokens": outcome.input_tokens, "output_tokens": outcome.output_tokens,
                    "from_store": outcome.from_store, "model": outcome.model,
                }
                prices = getattr(locator, "prices", None)
                if prices is not None:  # a model priced differently from the model: its own rates, in the artifact
                    record["prices"] = [str(prices[0]), str(prices[1])]
                windows = getattr(outcome, "windows", None)
                if windows:
                    record["windows"] = [list(w) for w in windows]
                    spans = ", ".join(f"p.{a}-{b}" for a, b in windows)
                    warnings.append(f"{entry.file}: too long for one call; located in {len(windows)} "
                                    f"overlapping page windows ({spans})")
                outcomes[entry.file] = record
        except BaseException:
            for future in futures:
                future.cancel()
            raise
    ingest_mode = getattr(locator, "ingest_mode_label", None) or (
        "replay" if outcomes and all(o["from_store"] for o in outcomes.values()) else "live")
    return {"outcomes": outcomes, "failed_vendors": failed, "warnings": warnings, "ingest_mode": ingest_mode}


def _responses(bodies: dict) -> dict[str, extract.LocateResponse]:
    return {file: extract.LocateResponse.model_validate(o["response"])
            for file, o in bodies["located"]["outcomes"].items()}


def stage_verified(bodies: dict) -> dict:
    manifest = _manifest(bodies)
    docs = _documents(bodies, manifest)
    responses = _responses(bodies)
    for file, response in responses.items():
        labels = {ps.page: ps.section for ps in response.page_sections}
        for page in docs[file].pages:
            if page.section == "unlabeled":
                page.section = labels.get(page.number, "general")

    locales = {file: detect_locale(p.text for p in doc.pages) for file, doc in docs.items()}

    def anchored(file: str, param_id: str, citation: Citation) -> Citation:
        """Number in span: a quote that states no value itself (the carve-out half of a note) is
        widened to its whole paragraph when the value is there, so what is cited is what is read."""
        if read_values(param_id, citation, locales[file])[0]:
            return citation
        whole = verify_quote(docs[file], citation.page, citation.paragraph)
        if whole is not None and read_values(param_id, whole, locales[file])[0]:
            return whole
        return citation

    accepted = rejected = 0
    citations: dict[str, list[dict]] = {}
    for file, response in responses.items():
        rows = []
        for candidate in response.candidates:
            citation = (verify_quote(docs[file], candidate.page, candidate.quote)
                        if candidate.param_id in PARAMS_BY_ID else None)
            if citation is None:
                rejected += 1
                continue
            accepted += 1
            citation = anchored(file, candidate.param_id, citation)
            rows.append({"param_id": candidate.param_id, "citation": citation.to_dict(), "source": "locator"})
        citations[file] = rows

    def ref(file: str, quote_ref) -> dict | None:
        citation = verify_quote(docs[file], quote_ref.page, quote_ref.quote) if quote_ref is not None else None
        return codec.citation_to_plain(citation)

    mr_file = next(d.file for d in manifest.documents if d.role == "mr_spec")
    bay_count = [c for c in (ref(mr_file, fact) for fact in responses[mr_file].tender_facts
                             if fact.fact == "bay_count") if c is not None] if mr_file in responses else []
    # The MR's own statement of how long after delivery (or dispatch) commissioning happens, if it
    # makes one. Read deterministically from the MR text; it is the only basis for converting a warranty.
    commissioning_lag = None
    for page in docs[mr_file].pages if mr_file in docs else []:
        for first, last in page_sentences(page):
            if commissioning_lag is None and parse_commissioning_lag(words_text(page.words[first: last + 1])):
                commissioning_lag = citation_for_span(docs[mr_file], page, first, last).to_dict()
    headline: dict[str, dict | None] = {}
    cover: dict[str, dict | None] = {}
    for entry in manifest.documents:
        if entry.role == "vendor_bid" and entry.file in responses:
            headline[entry.vendor_id] = ref(entry.file, responses[entry.file].headline_price)
            cover[entry.vendor_id] = ref(entry.file, responses[entry.file].cover_claim)

    # Recall sweep: every sentence that states something value-shaped about a parameter. A bid's
    # hits the locator did not cite join the candidates with source "sweep".
    roles = {d.file: d.role for d in manifest.documents}
    sweep_hits: dict[str, list[dict]] = {}
    located = refound = new = 0
    for file in responses:
        hits = sweep.sweep_document(docs[file])
        sweep_hits[file] = [{"param_id": h.param_id, "page": h.citation.page, "quote": h.citation.quote} for h in hits]
        cited = [(row["param_id"], Citation.from_dict(row["citation"])) for row in citations[file]]
        located += len(cited)
        refound += sum(sweep.covers(sweep_hits[file], param_id, c.page, c.quote) for param_id, c in cited)
        if roles[file] != "vendor_bid":
            continue  # MR requirements come from located passages only; a missing one is already a warning
        for hit in hits:
            if not sweep.already_cited(hit, cited):
                citations[file].append({"param_id": hit.param_id, "citation": hit.citation.to_dict(), "source": "sweep"})
                cited.append((hit.param_id, hit.citation))
                new += 1
    return {
        "sections": {file: [p.section for p in doc.pages] for file, doc in docs.items()},
        "citations": citations, "accepted": accepted, "rejected": rejected,
        "bay_count": bay_count, "headline": headline, "cover": cover, "warnings": [],
        "sweep_hits": sweep_hits, "locales": locales, "commissioning_lag": commissioning_lag,
        "sweep": {"hits": sum(len(h) for h in sweep_hits.values()), "new": new, "located": located, "refound": refound},
        "not_stated": {file: {ns.param_id: ns.pages_searched for ns in response.not_stated}
                       for file, response in responses.items()},
    }


def _page_ranges(pages: list[int]) -> str:
    """[1, 2, 3, 7] -> "1-3, 7"."""
    ranges: list[list[int]] = []
    for page in sorted(set(pages)):
        if ranges and page == ranges[-1][1] + 1:
            ranges[-1][1] = page
        else:
            ranges.append([page, page])
    return ", ".join(str(a) if a == b else f"{a}-{b}" for a, b in ranges)


_NUMERIC_KINDS = frozenset({"current", "duration", "voltage", "temperature", "fat_days", "months"})


def read_values(param_id: str, citation: Citation, locale: str) -> tuple[dict, list[dict]]:
    """The typed values a cited span states for a parameter, and notes on anything not believed.

    Values are read from the span's own text and nowhere else. A number that could be read two
    ways (no locale evidence in the document), a value outside the field's plausible range and
    a value whose number is not in the span are left out, each with a note saying why.
    """
    text, ambiguous = normalize_numbers(citation.quote, locale)
    values: dict = {}
    notes: list[dict] = []
    where = f"p.{citation.page}"
    for f in PARAMS_BY_ID[param_id].fields:
        value = parse_field(f.kind, text, f.name)
        if value is None:
            continue
        if not value_in_span(value, text):
            notes.append({"code": "VALUE_NOT_IN_SPAN",
                          "message": f"{f.label} {value.display} is not stated in the cited passage on {where}; value not read"})
            continue
        if not plausible(f, value):
            low, high = f.plausible
            notes.append({"code": "IMPLAUSIBLE_VALUE",
                          "message": f"{f.label} {value.display} on {where} is outside the plausible range "
                                     f"{low} to {high}; value not read"})
            continue
        values[f.name] = value
    unread = [f for f in PARAMS_BY_ID[param_id].fields if f.kind in _NUMERIC_KINDS and f.name not in values]
    if ambiguous and unread:
        notes.append({"code": "AMBIGUOUS_NUMBER",
                      "message": f"ambiguous number {', '.join(repr(t) for t in ambiguous)} on {where}: nothing in the "
                                 f"document shows whether the separator marks decimals or thousands; value not read"})
    return values, notes


def stage_resolved(bodies: dict) -> dict:
    manifest = _manifest(bodies)
    verified = bodies["verified"]
    warnings: list[str] = []
    mr_entry = next(d for d in manifest.documents if d.role == "mr_spec")
    bids = [d for d in manifest.documents if d.role == "vendor_bid"]

    vendor_of = {d.file: d.vendor_id for d in bids}
    locales = verified["locales"]
    flags: dict[str, list[dict]] = {}
    evidence: dict[str, list[Evidence]] = {}
    for file, rows in verified["citations"].items():
        items = []
        for row in rows:
            citation = Citation.from_dict(row["citation"])
            # Values come from the cited span's own text (the verified stage has already widened
            # a fragment to the paragraph that holds its value).
            values, notes = read_values(row["param_id"], citation, locales[file])
            for note in notes:
                if file in vendor_of:
                    add_flag(flags.setdefault(_key(vendor_of[file], row["param_id"]), []), note["code"], note["message"])
                else:
                    warnings.append(f"{file} {row['param_id']}: {note['message']}")
            if values:
                items.append(Evidence(row["param_id"], citation, values, source=row["source"]))
            elif row["source"] == "sweep" and not notes:
                # A sweep hit the parsers cannot read (a carve-out, a value in words) is left for a person.
                add_flag(flags.setdefault(_key(vendor_of[file], row["param_id"]), []), "SWEEP_UNPARSED",
                         f"possible evidence on p.{citation.page} not reviewed "
                         f"({SECTION_LABELS[citation.section]}: \"{citation.quote}\")")
        evidence[file] = items

    lag = None
    if verified["commissioning_lag"] is not None:
        months, start = parse_commissioning_lag(verified["commissioning_lag"]["quote"])
        lag = {"months": months, "from": start, "citation": verified["commissioning_lag"]}

    bay_count = None
    for data in verified["bay_count"]:
        bay_count = parse_bay_count(data["quote"])
        if bay_count is not None:
            break

    # Headline prices. An unknown price is null with a status saying why, never 0. The currency is
    # read from the passage, never assumed; a foreign price is converted only with a dated FX rate.
    table = load_rate_table(manifest.rate_table)
    headlines: dict[str, dict] = {}
    covers: dict[str, str] = {}
    for entry in bids:
        vendor_id = entry.vendor_id
        head = {"amount": None, "status": "NOT_FOUND", "currency": None, "original": None,
                "fx_rate": None, "fx_date": None, "citation": None}
        if vendor_id in verified["headline"]:
            citation = verified["headline"][vendor_id]
            read = read_price(citation["quote"]) if citation else None
            if read is None:
                warnings.append(f"{vendor_id}: headline price not found")
            else:
                head.update(citation=citation, currency=read.currency, original=str(read.amount))
                if read.per_unit:
                    warnings.append(f"{vendor_id}: headline price is worded \"{read.per_unit}\"; it may be a unit "
                                    f"rate, not the total. Check the cited passage")
                converted = costs.convert(read.amount, read.currency, table) if read.currency else None
                if read.currency is None:
                    head["status"] = "CURRENCY_UNKNOWN"
                    warnings.append(f"{vendor_id}: headline price {read.amount:,} names no currency; not evaluated "
                                    f"(a currency is never assumed)")
                elif converted is None:
                    head["status"] = "FX_MISSING"
                    warnings.append(f"{vendor_id}: headline price is in {read.currency} and rate table "
                                    f"{table.version} has no dated FX rate to {table.currency}; not evaluated")
                else:
                    head.update(amount=float(converted["amount"]), status="PRICED")
                    if converted["rate"] is not None:
                        head.update(fx_rate=str(converted["rate"]), fx_date=converted["date"])
                        warnings.append(f"{vendor_id}: headline price {read.currency} {read.amount:,} converted to "
                                        f"{table.currency} at {converted['rate']} (rate dated {converted['date']})")
            cover = verified["cover"][vendor_id]
            covers[vendor_id] = cover["quote"] if cover else ""
        headlines[vendor_id] = head
    warnings.extend(_implausible_headlines({vid: h["amount"] for vid, h in headlines.items()}))

    mr_evidence = evidence.get(mr_entry.file, [])
    requirements: dict[str, dict] = {}
    requirement_citations: dict[str, list[dict]] = {}
    for param in PARAMETERS:
        mine = sorted((e for e in mr_evidence if e.param_id == param.id), key=lambda e: e.citation.page)
        merged = merge_requirement(param, mine)
        if any(f.name not in merged for f in param.fields):
            warnings.append(f"{param.id}: requirement not found in MR")
            continue
        requirements[param.id] = codec.values_to_plain(merged)
        requirement_citations[param.id] = [e.citation.to_dict() for e in mine]
    if not requirements:
        raise IngestFailed("No requirements found in MR spec")

    return {
        "evidence": {file: [codec.evidence_to_plain(e) for e in items] for file, items in evidence.items()},
        "requirements": requirements, "requirement_citations": requirement_citations,
        "bay_count": bay_count, "headlines": headlines, "covers": covers, "warnings": warnings,
        "flags": flags, "locales": locales, "commissioning_lag": lag,
    }


def _requirements(bodies: dict) -> dict[str, dict]:
    """param_id -> {field: FieldValue}, in ontology order."""
    stored = bodies["resolved"]["requirements"]
    return {p.id: codec.values_from_plain(stored[p.id]) for p in PARAMETERS if p.id in stored}


def stage_checked(bodies: dict) -> dict:
    manifest = _manifest(bodies)
    failed = _failed_vendors(bodies, manifest)
    requirements = _requirements(bodies)
    stored = bodies["resolved"]["evidence"]
    lag = bodies["resolved"]["commissioning_lag"]
    warranty_policy = load_rate_table(manifest.rate_table).policies["warranty_basis"]
    resolutions: dict[str, dict] = {}
    for entry in manifest.documents:
        if entry.role != "vendor_bid":
            continue
        vendor_evidence = ([] if entry.vendor_id in failed
                           else [codec.evidence_from_plain(e) for e in stored.get(entry.file, [])])
        blank_pages = [p["number"] for d in bodies["parsed"]["documents"] if d["file"] == entry.file
                       for p in d["pages"] if not p["has_text"]]
        accepted_params = {e["param_id"] for e in stored.get(entry.file, []) if e["source"] == "locator"}
        not_stated = bodies["verified"]["not_stated"].get(entry.file, {})
        located_params = {row["param_id"] for row in bodies["verified"]["citations"].get(entry.file, [])
                          if row["source"] == "locator"}
        for param_id, requirement in requirements.items():
            resolution = resolve(PARAMS_BY_ID[param_id], requirement, vendor_evidence, entry.vendor_id,
                                 lag=lag, warranty_policy=warranty_policy)
            key = _key(entry.vendor_id, param_id)
            for extra in bodies["resolved"]["flags"].get(key, []):
                add_flag(resolution.flags, extra["code"], extra["message"])
            if blank_pages and entry.vendor_id not in failed and param_id not in accepted_params:
                # Nothing accepted for this parameter, and part of the bid is a scan: the evidence
                # may be on a page that could not be read.
                add_flag(resolution.flags, "NO_TEXT_LAYER",
                         f"p.{_page_ranges(blank_pages)} of {entry.file} has no text layer; evidence for this "
                         f"parameter may be there and could not be read")
            if entry.vendor_id not in failed and param_id not in located_params:
                # The locator returned no passage for this parameter. Say whether it reported that
                # (NOT_STATED, with the pages it searched) or simply said nothing.
                if param_id in not_stated:
                    add_flag(resolution.flags, "NOT_STATED",
                             f"the locator reports this parameter is not stated in {entry.file} "
                             f"(pages {_page_ranges(not_stated[param_id])} searched)")
                else:
                    add_flag(resolution.flags, "LOCATOR_SILENT",
                             f"the locator returned neither a passage nor NOT_STATED for this parameter in {entry.file}")
            resolutions[key] = codec.resolution_to_plain(resolution)
    return {"resolutions": resolutions, "warnings": []}


def stage_priced(bodies: dict) -> dict:
    manifest = _manifest(bodies)
    warnings: list[str] = []
    table = load_rate_table(manifest.rate_table)
    quantities = {f"estimate.{k}": Decimal(v) for k, v in manifest.engineering_estimates.items()}
    bay_count = bodies["resolved"]["bay_count"]
    if bay_count is not None:
        quantities["tender.bay_count"] = Decimal(bay_count)
    else:
        warnings.append("bay count not found in MR spec; per-bay costs are unpriced")
    requirements = _requirements(bodies)
    pricings = {}
    for key, data in bodies["checked"]["resolutions"].items():
        param_id = key.split("|", 1)[1]
        pricing = price(PARAMS_BY_ID[param_id], requirements[param_id], codec.resolution_from_plain(data),
                        table, quantities)
        pricings[key] = codec.pricing_to_plain(pricing)
    return {
        "pricings": pricings, "warnings": warnings,
        "rate_table": {"version": table.version, "effective_date": table.effective_date, "currency": table.currency},
    }


def stage_leveled(bodies: dict) -> dict:
    """The tender package and the run's statistics: everything the API serves, minus timings."""
    manifest = _manifest(bodies)
    parsed, located, verified, resolved = (bodies[s] for s in ("parsed", "located", "verified", "resolved"))
    mr_entry = next(d for d in manifest.documents if d.role == "mr_spec")
    bids = [d for d in manifest.documents if d.role == "vendor_bid"]
    requirements = _requirements(bodies)
    resolutions = {k: codec.resolution_from_plain(v) for k, v in bodies["checked"]["resolutions"].items()}
    pricings = {k: codec.pricing_from_plain(v) for k, v in bodies["priced"]["pricings"].items()}
    table = bodies["priced"]["rate_table"]
    warnings = [w for stage in STAGE_NAMES[:-1] for w in bodies[stage]["warnings"]]

    input_tokens = sum(o["input_tokens"] for o in located["outcomes"].values())
    output_tokens = sum(o["output_tokens"] for o in located["outcomes"].values())
    cost = sum((
        extract.api_cost_usd(o["input_tokens"], o["output_tokens"], *(Decimal(p) for p in o.get("prices", ())))
        for o in located["outcomes"].values()), Decimal("0"))
    page_counts = {d["file"]: len(d["pages"]) for d in parsed["documents"]}
    vendors = [
        engine.Vendor(
            id=e.vendor_id, name=e.vendor_name or e.vendor_id, country=e.country or "",
            headline_price=resolved["headlines"][e.vendor_id]["amount"],
            doc_name=f"{e.file} ({page_counts[e.file]} pages)",
            cover_claim=resolved["covers"].get(e.vendor_id, ""), badge="Bidder",
            headline_citation=resolved["headlines"][e.vendor_id]["citation"],
            headline_status=resolved["headlines"][e.vendor_id]["status"],
            currency=resolved["headlines"][e.vendor_id]["currency"],
            headline_original=resolved["headlines"][e.vendor_id]["original"],
            fx_rate=resolved["headlines"][e.vendor_id]["fx_rate"],
            fx_date=resolved["headlines"][e.vendor_id]["fx_date"],
        )
        for e in bids
    ]
    parameters = []
    for param_id, requirement in requirements.items():
        param = PARAMS_BY_ID[param_id]
        mine = resolved["requirement_citations"][param_id]
        quotes = list(dict.fromkeys(c["quote"] for c in mine))
        parameters.append(engine.EngineeringParameter(
            id=param.id, category=param.category, name=param.name,
            mr_requirement=" ".join(quotes), pint_rule=rule_text(param, requirement),
            criticality=param.criticality,
            vendors={e.vendor_id: _cell(resolutions[_key(e.vendor_id, param_id)], pricings[_key(e.vendor_id, param_id)])
                     for e in bids},
            requirement_citation=mine[0],
            checks_spec=[{"field": f.name, "operator": f.operator, "label": f.label,
                          "required": requirement[f.name].display} for f in param.fields],
        ))
    tender = engine.TenderPackage(
        id=manifest.tender_id, title=manifest.title, client=manifest.client,
        mr_doc=f"{mr_entry.file} ({page_counts[mr_entry.file]} pages)",
        pages_parsed=sum(page_counts.values()), latency_sec=0, compute_cogs=float(cost),
        vendors=vendors, parameters=parameters,
        equipment_class=manifest.equipment_class, rate_table_version=table["version"],
    )

    # Amendment A2: negotiate with the lowest true evaluated price, not the lowest headline.
    choice = engine.negotiating_choice(tender)
    apparent_low = choice["lowest_headline"]
    for v in tender.vendors:
        statuses = [p.vendors[v.id].status for p in tender.parameters]
        if not v.headline_price:
            v.badge = "Price not found"
        elif v.id == choice["vendor_id"]:
            v.badge = "Lowest Evaluated Price"
        elif v.id == apparent_low:
            v.badge = "Apparent Low Bidder"
        elif all(s == engine.ComplianceStatus.COMPLIANT for s in statuses):
            v.badge = "Compliant Baseline"

    # The risk hidden in the cheapest-looking bid: the adders of the lowest headline.
    financials = engine.evaluate_vendor_financials(tender, engine.SensitivitySettings(), [])
    exposed = next((f["total_adders"] for f in financials if f["vendor_id"] == apparent_low), 0.0)
    stats = {
        "tender_id": tender.id,
        "documents": len(manifest.documents),
        "pages_parsed": tender.pages_parsed,
        "sld_sheets": sum(sections.count("drawing") for sections in verified["sections"].values()),
        "candidates_accepted": verified["accepted"],
        "candidates_rejected": verified["rejected"],
        "sweep_hits": verified["sweep"]["hits"],
        "sweep_new_candidates": verified["sweep"]["new"],
        # Share of the located passages the sweep finds again on its own (1.0 when none were located).
        "sweep_recall": (round(verified["sweep"]["refound"] / verified["sweep"]["located"], 4)
                         if verified["sweep"]["located"] else 1.0),
        "flags_raised": sum(len(r.flags) for r in resolutions.values()),
        "locales": verified["locales"],  # per document: en, eu, mixed or unknown
        "no_text_pages": {d["file"]: [p["number"] for p in d["pages"] if not p["has_text"]]
                          for d in parsed["documents"] if any(not p["has_text"] for p in d["pages"])},
        "rules_evaluated": sum(len(r.checks) for r in resolutions.values()),
        "deviations_found": sum(1 for r in resolutions.values() if r.status != engine.ComplianceStatus.COMPLIANT),
        "exposed_risk_eur": exposed,
        "negotiating_vendor": choice,
        "unpriced_items": [
            {"vendor_id": key.split("|", 1)[0], "param_id": key.split("|", 1)[1], "classes": p.unpriced_classes}
            for key, p in pricings.items() if p.pricing_status == "UNPRICED"
        ],
        "warnings": list(warnings),
        "rate_table_effective_date": table["effective_date"],  # the brief's "as of" for its prices (R26)
        "api_cost_usd": float(cost),
        "cogs_usd": float(cost),
        "ingest_mode": located["ingest_mode"],
        "synthetic": manifest.synthetic,
    }
    return {"tender": tender.model_dump(mode="json"), "stats": stats, "warnings": []}


_STAGE_FUNCTIONS: dict[str, Callable[[dict], dict]] = {
    "verified": stage_verified, "resolved": stage_resolved, "checked": stage_checked,
    "priced": stage_priced, "leveled": stage_leveled,
}
# The progress label reported when each stage finishes (the leveled stage has none).
_STAGE_PROGRESS = dict(zip(STAGE_NAMES, STAGES[1:]))


def _finish(arts: dict[str, StageArtifact], fingerprint: dict, started: float, stage_log: list[dict]) -> IngestResult:
    """Build the result from a full set of artifacts; timings and run IDs are added here, outside the artifacts."""
    bodies = {stage: artifact.load() for stage, artifact in arts.items()}
    leveled = bodies["leveled"]
    duration = time.perf_counter() - started
    tender = engine.TenderPackage.model_validate(leveled["tender"])
    tender.latency_sec = round(duration)
    documents = []
    entries = {d.file: d for d in _manifest(bodies).documents}
    for data in bodies["parsed"]["documents"]:
        entry = entries[data["file"]]
        blank = [p["number"] for p in data["pages"] if not p["has_text"]]
        documents.append(SourceDocumentInfo(entry.file, entry.role, entry.vendor_id, data["sha256"],
                                            len(data["pages"]), blank))
    stats = dict(leveled["stats"])
    stats["duration_s"] = round(duration, 2)
    stats["run_fingerprint"] = fingerprint.get("fingerprint", "")
    stats["run_id"] = artifacts.run_id(stats["run_fingerprint"], {s: a.sha256 for s, a in arts.items()})
    stats["stage_log"] = stage_log
    return IngestResult(tender=tender, documents=documents, stats=stats, warnings=list(stats["warnings"]),
                        artifacts=dict(arts), fingerprint=fingerprint)


def _run_stages(arts: dict[str, StageArtifact], start: str, report: Callable[[str, int], None]) -> None:
    """Run `start` and every stage after it, each from the stored JSON of the stages before."""
    for stage in STAGE_NAMES[STAGE_NAMES.index(start):]:
        bodies = {name: arts[name].load() for name in STAGE_NAMES[:STAGE_NAMES.index(stage)]}
        arts[stage] = artifacts.make_artifact(stage, _STAGE_FUNCTIONS[stage](bodies))
        if stage in _STAGE_PROGRESS:
            report(*_STAGE_PROGRESS[stage])


def rerun_from(stage: str, stored: dict[str, StageArtifact], fingerprint: dict | None = None,
               progress: Callable[[str, int], None] | None = None) -> IngestResult:
    """Rerun `stage` and everything after it from stored artifacts. No file is read, no locator is called.

    `stored` needs every stage before `stage`. "parsed" and "located" cannot be rerun this way:
    they read the PDFs and call the locator, which is what run_ingest is for.
    """
    if stage not in _STAGE_FUNCTIONS:
        raise ValueError(f"cannot rerun from {stage!r}; choose one of {', '.join(_STAGE_FUNCTIONS)}")
    before = STAGE_NAMES[:STAGE_NAMES.index(stage)]
    missing = [name for name in before if name not in stored]
    if missing:
        raise ValueError(f"missing stored artifacts: {', '.join(missing)}")
    started = time.perf_counter()
    stage_log: list[dict] = []

    def report(label: str, pct: int) -> None:
        stage_log.append({"stage": label, "pct": pct, "t_ms": int((time.perf_counter() - started) * 1000)})
        if progress:
            progress(label, pct)

    arts = {name: stored[name] for name in before}
    try:
        config.ensure_valid()
        _run_stages(arts, stage, report)
    except ConfigError as exc:
        raise _failed(exc) from exc
    return _finish(arts, fingerprint or {}, started, stage_log)


def run_ingest(tender_dir: Path, mode: str = "auto", progress: Callable[[str, int], None] | None = None,
               locator: Locator | None = None, expected_tender_id: str | None = None) -> IngestResult:
    started = time.perf_counter()
    notify = progress or (lambda stage, pct: None)
    stage_log: list[dict] = []

    def report(stage: str, pct: int) -> None:
        stage_log.append({"stage": stage, "pct": pct, "t_ms": int((time.perf_counter() - started) * 1000)})
        notify(stage, pct)

    tender_dir = Path(tender_dir)
    try:
        config.ensure_valid()  # an ontology or rate-table gap stops the run here, not mid-ingest
        manifest = load_manifest(tender_dir)
    except (ManifestError, ConfigError) as exc:
        raise _failed(exc) from exc
    if expected_tender_id is not None and manifest.tender_id != expected_tender_id:
        # A copied folder with an unedited manifest would otherwise overwrite another tender.
        raise IngestFailed(
            f"Manifest in {tender_dir.name} names tender {manifest.tender_id!r}, "
            f"but {expected_tender_id!r} was requested"
        )
    if locator is None:
        locator = extract.make_locator(tender_dir, mode)
    locator_mode = getattr(locator, "ingest_mode_label", None) or getattr(locator, "mode", None) or mode
    fingerprint = artifacts.run_fingerprint(tender_dir, str(locator_mode))
    report(*STAGES[0])

    arts: dict[str, StageArtifact] = {}
    arts["parsed"] = artifacts.make_artifact("parsed", stage_parsed(tender_dir, manifest))
    report(*STAGES[1])
    arts["located"] = artifacts.make_artifact("located", stage_located({"parsed": arts["parsed"].load()}, locator))
    report(*STAGES[2])
    try:
        _run_stages(arts, "verified", report)
    except ConfigError as exc:
        raise _failed(exc) from exc
    return _finish(arts, fingerprint, started, stage_log)
