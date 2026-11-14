"""Score the Claude locator against the answer key: what it found, missed and made up.

    python -m specclaw_ingest.locator_eval [--json] [TENDER_DIR ...]
    python -m specclaw_ingest.locator_eval --live --spend [TENDER_DIR ...]

The mutation eval (specclaw_ingest.eval) runs the deterministic stages with the answer-key
locator, so it says nothing about Claude. This scores the locate stage itself, from the
answers saved in each tender's claude_responses/ folder (free, offline), from whichever model
is configured (Claude, or Experiential Labs; see specclaw_ingest.chat_locator). With --live --spend it
first records an answer for every document that has none, which calls the paid API.

Per document: candidates returned, how many verify (the quote is on its page word for word),
how many match an answer-key candidate (same parameter, and both quotes resolve to the same
sentence on the same page), recall against the answer key, and whether the headline price and
cover claim were found. Per parameter: recall over every bid. Per tender: the full pipeline run
on those answers, compared with the answer key cell by cell.
"""

from __future__ import annotations

import argparse
import json
import sys
from decimal import Decimal
from pathlib import Path

import anthropic

from specclaw_ingest import extract, verify
from specclaw_ingest.extract import ClaudeLocator, ExtractError, LocateOutcome, Locator, ResponseStore
from specclaw_ingest.ontology import PARAMETERS
from specclaw_ingest.parse import DocumentUnreadable, load_manifest, parse_document, verify_quote
from specclaw_ingest.pipeline import SAMPLES_DIR, IngestFailed, run_ingest

DEFAULT_PACKS = ("TENDER-2026-402", "TENDER-2026-417")


class _Remembering:
    """Locates each document once, so scoring and the pipeline run share one (possibly paid) answer."""

    def __init__(self, locator: Locator):
        self.locator = locator
        self.answers: dict[str, LocateOutcome | Exception] = {}

    def locate(self, doc):
        file = doc.entry.file
        if file not in self.answers:
            try:
                self.answers[file] = self.locator.locate(doc)
            except Exception as exc:  # remembered and raised again, for the pipeline to judge
                self.answers[file] = exc
        answer = self.answers[file]
        if isinstance(answer, Exception):
            raise answer
        return answer


def _where(doc, page: int, quote: str):
    """The (page, sentence) a quote resolves to on its document, or None when it is not there verbatim."""
    citation = verify_quote(doc, page, quote)
    return None if citation is None else (citation.page, citation.quote)


def score_document(doc, ideal: dict, outcome: LocateOutcome, prices: tuple | None = None) -> dict:
    response = outcome.response
    wanted = {(c["param_id"], where) for c in ideal["candidates"]
              if (where := _where(doc, c["page"], c["quote"])) is not None}
    found: set = set()
    verified = rejected = 0
    for c in response.candidates:
        where = _where(doc, c.page, c.quote)
        if where is None:
            rejected += 1
            continue
        verified += 1
        found.add((c.param_id, where))
    matched = found & wanted

    def same(ref, want) -> bool | None:
        if want is None:
            return None if ref is None else False
        if ref is None:
            return False
        return _where(doc, ref.page, ref.quote) == _where(doc, want["page"], want["quote"])

    answered = {c.param_id for c in response.candidates} | {n.param_id for n in response.not_stated}
    return {
        "file": doc.entry.file,
        "returned": len(response.candidates), "verified": verified, "rejected": rejected,
        "expected": len(wanted), "matched": len(matched), "extra": len(found - wanted),
        "recall": len(matched) / len(wanted) if wanted else None,
        "headline_ok": same(response.headline_price, ideal.get("headline_price")),
        "cover_ok": same(response.cover_claim, ideal.get("cover_claim")),
        # The locator must give every parameter a candidate or a not_stated entry.
        "silent_params": sorted(p.id for p in PARAMETERS if p.id not in answered),
        "windows": len(outcome.windows) if outcome.windows else 1,
        "cost_usd": str(extract.api_cost_usd(outcome.input_tokens, outcome.output_tokens, *(prices or ()))),
        "per_param": {pid: (len({m for m in matched if m[0] == pid}), len({w for w in wanted if w[0] == pid}))
                      for pid in sorted({w[0] for w in wanted})},
    }


def _cell_accuracy(tender, expected: dict) -> tuple[int, int, int]:
    cells = {(vid, p.id): cell for p in tender.parameters for vid, cell in p.vendors.items()}
    total = status_ok = pricing_ok = 0
    for vendor_id, by_param in expected["cells"].items():
        for param_id, want in by_param.items():
            total += 1
            cell = cells.get((vendor_id, param_id))
            if cell is None:
                continue
            status_ok += cell.status.value == want["status"]
            pricing_ok += (round(cell.cost_adder, 2) == float(want["adder"])
                           and want.get("pricing_status") in (None, cell.pricing_status))
    return total, status_ok, pricing_ok


def score_pack(tender_dir: Path, locator: Locator) -> dict:
    """Score every document of one tender, then run the pipeline on the same answers."""
    tender_dir = Path(tender_dir)
    expected = json.loads((tender_dir / "expected.json").read_text(encoding="utf-8"))
    remembering = _Remembering(locator)
    documents, missing = [], []
    for entry in load_manifest(tender_dir).documents:
        try:
            doc = parse_document(tender_dir, entry)
        except DocumentUnreadable:
            continue  # nothing to locate; the pipeline reports it
        ideal = expected["ideal_locate"].get(entry.file)
        try:
            outcome = remembering.locate(doc)
        except (ExtractError, anthropic.APIError) as exc:
            first_line = (str(exc).splitlines() or [""])[0][:300]
            missing.append({"file": entry.file, "reason": f"{type(exc).__name__}: {first_line}"})
            continue
        if ideal is not None:
            documents.append(score_document(doc, ideal, outcome, getattr(locator, "prices", None)))
    run: dict = {"ran": False}
    if not missing:
        try:
            result = run_ingest(tender_dir, locator=remembering)
            total, status_ok, pricing_ok = _cell_accuracy(result.tender, expected)
            mismatches = verify.compare_to_answer_key(result.tender, expected, result)
            run = {"ran": True, "cells": total, "status_ok": status_ok, "pricing_ok": pricing_ok,
                   "mismatches": mismatches}
        except IngestFailed as exc:
            run = {"ran": False, "error": str(exc)}
    per_param: dict[str, list[int]] = {}
    for d in documents:
        for pid, (hit, want) in d["per_param"].items():
            per_param.setdefault(pid, [0, 0])
            per_param[pid][0] += hit
            per_param[pid][1] += want
    return {"tender": tender_dir.name, "locator": getattr(locator, "model", "?"), "documents": documents, "missing": missing,
            "per_param": {pid: {"matched": h, "expected": w} for pid, (h, w) in sorted(per_param.items())},
            "cost_usd": str(sum((Decimal(d["cost_usd"]) for d in documents), Decimal("0"))),
            "pipeline": run}


def stored_locator(tender_dir: Path, live: bool) -> ClaudeLocator:
    """The tender's saved answers; with `live`, a paid call for any document without one."""
    return extract.make_locator(Path(tender_dir), "auto" if live else "replay")


def _pct(value) -> str:
    return "n/a" if value is None else f"{value:.0%}"


def format_report(packs: list[dict]) -> str:
    lines = []
    for pack in packs:
        lines.append(f"## {pack['tender']}  (locator model: {pack['locator']})")
        for m in pack["missing"]:
            lines.append(f"- not scored: {m['file']}: {m['reason']}")
        if pack["documents"]:
            lines.append("| document | returned | verified | rejected | matched | expected | recall | extra |"
                         " headline | cover | silent | windows |")
            lines.append("|" + "---|" * 12)
            for d in pack["documents"]:
                lines.append(
                    f"| {d['file']} | {d['returned']} | {d['verified']} | {d['rejected']} | {d['matched']} | "
                    f"{d['expected']} | {_pct(d['recall'])} | {d['extra']} | {d['headline_ok']} | {d['cover_ok']} | "
                    f"{', '.join(d['silent_params']) or '-'} | {d['windows']} |")
            lines.append("")
            lines.append("| parameter | matched | expected | recall |")
            lines.append("|---|---|---|---|")
            for pid, row in pack["per_param"].items():
                recall = row["matched"] / row["expected"] if row["expected"] else None
                lines.append(f"| {pid} | {row['matched']} | {row['expected']} | {_pct(recall)} |")
        run = pack["pipeline"]
        if run.get("ran"):
            cells = run["cells"] or 1
            lines.append(f"\nPipeline on these answers: status {run['status_ok']}/{run['cells']} "
                         f"({run['status_ok'] / cells:.0%}), pricing {run['pricing_ok']}/{run['cells']} "
                         f"({run['pricing_ok'] / cells:.0%}), {len(run['mismatches'])} answer-key differences.")
            lines.extend(f"- {m}" for m in run["mismatches"])
        elif run.get("error"):
            lines.append(f"\nPipeline failed: {run['error']}")
        else:
            lines.append("\nPipeline not run: some documents have no answer to score.")
        lines.append(f"Recorded cost of these answers: ${pack['cost_usd']}\n")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m specclaw_ingest.locator_eval", description=__doc__.splitlines()[0])
    parser.add_argument("tenders", nargs="*", help="tender folders (default: the sample packs)")
    parser.add_argument("--json", action="store_true", help="print the scores as JSON")
    parser.add_argument("--live", action="store_true", help="record an answer for documents that have none (paid)")
    parser.add_argument("--spend", action="store_true", help="confirm --live may call the paid Claude API")
    args = parser.parse_args(argv)
    if args.live and not args.spend:
        print("--live calls the paid Claude API for every document without a saved answer. "
              "Add --spend to confirm.", file=sys.stderr)
        return 2
    folders = [Path(t) for t in args.tenders] or [SAMPLES_DIR / name for name in DEFAULT_PACKS]
    packs = [score_pack(folder, stored_locator(folder, args.live)) for folder in folders]
    print(json.dumps(packs, indent=2, default=str) if args.json else format_report(packs))
    complete = all(p["pipeline"].get("ran") for p in packs)
    return 0 if complete else 1


if __name__ == "__main__":
    raise SystemExit(main())
