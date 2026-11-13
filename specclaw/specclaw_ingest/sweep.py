"""Recall sweep: a deterministic second look for evidence the locator did not cite.

The pipeline only checks passages the locator returns, so a missed passage is a
silent failure: a cover-letter "3 s" reads COMPLIANT while the datasheet says 1 s.
The sweep reads every sentence of every page and keeps those that name a parameter
(the ontology's sweep terms) and carry something value-shaped for one of its fields
(a number with the right unit, a material, an IP code...).

A sweep hit is never trusted the way a located passage is. In precedence it can
only make a cell worse or flagged (see precedence.resolve); a hit the field parsers
cannot read becomes a review flag.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from specclaw_ingest.ontology import PARAMETERS, ParameterDef
from specclaw_ingest.parse import MIN_QUOTE_WORDS, citation_for_span, normalize, page_sentences, words_text
from specclaw_ingest.types import Citation, FieldKind, ParsedDocument
from specclaw_ingest.values import NEGATIVE_CONTEXT, clauses

_NUMBER = r"\d(?:[\d.,]*\d)?"
# What a value of each kind looks like, loosely: enough to say "this sentence states one".
SIGNALS: dict[FieldKind, re.Pattern] = {
    "current": re.compile(_NUMBER + r"\s*k?A\b"),
    "duration": re.compile(_NUMBER + r"\s*(?:s|sec|secs|second|seconds)\b"),
    "voltage": re.compile(_NUMBER + r"\s*k?V\b"),
    "temperature": re.compile(_NUMBER + r"\s*°\s*[CF]\b|" + _NUMBER + r"\s*K\b"),
    "material": re.compile(r"copper|cu-etp|\bhdhc\b|alumin(?:i)?um|almgsi", re.IGNORECASE),
    "ip": re.compile(r"\bIP\s?\d[\dX]\b"),
    "iac": re.compile(r"\b(?:AFLR|AFL|AF)\b"),
    "protocol": re.compile(r"61850|modbus|rj45|rs485|\bPRP\b", re.IGNORECASE),
    "marshalling": re.compile(r"pre-?wired|factory wired|loose|field termination|customer (?:scada )?wiring|"
                              r"excluded|by others", re.IGNORECASE),
    "fat_days": re.compile(r"\d+\s*-?\s*days?\b|charged extra|excluded|not included|routine", re.IGNORECASE),
    "incoterm": re.compile(r"\b(?:EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b|ex[- ]works|delivered at place|"
                           r"delivered duty paid|free carrier", re.IGNORECASE),
    "months": re.compile(r"\d+\s*-?\s*months?\b", re.IGNORECASE),
}
_TERMS: dict[str, re.Pattern] = {
    p.id: re.compile("|".join(f"(?:{term})" for term in p.sweep_terms), re.IGNORECASE) for p in PARAMETERS
}


@dataclass(frozen=True)
class SweepHit:
    param_id: str
    citation: Citation


def _text_for(field_name: str, sentence: str) -> str:
    """The sentence without the clauses that describe a different rating than this field
    (an arc-test or peak current is not the short-time rating; a fault rating is not a busbar's
    continuous current). The same filter the field parser applies."""
    negative = NEGATIVE_CONTEXT.get(field_name)
    if negative is None:
        return sentence
    return ", ".join(c for c in clauses(sentence) if not negative.search(c))


def names_parameter(param: ParameterDef, sentence: str) -> bool:
    """A sentence names a parameter when, for one of its fields, the text left after that field's
    filter still carries a sweep term and something value-shaped."""
    for f in param.fields:
        text = _text_for(f.name, sentence)
        if _TERMS[param.id].search(text) and SIGNALS[f.kind].search(text):
            return True
    return False


def sweep_document(doc: ParsedDocument) -> list[SweepHit]:
    """Every sentence of the document that states something value-shaped about a parameter."""
    hits: list[SweepHit] = []
    for page in doc.pages:
        if not page.has_text:
            continue
        for first, last in page_sentences(page):
            if last - first + 1 < MIN_QUOTE_WORDS:
                continue
            citation = None
            sentence = words_text(page.words[first: last + 1])
            for param in PARAMETERS:
                if names_parameter(param, sentence):
                    citation = citation or citation_for_span(doc, page, first, last)
                    hits.append(SweepHit(param.id, citation))
    return hits


def _squash(text: str) -> str:
    """Text for comparing two passages: no case, no spaces and no hyphens, so a word the page
    wraps as "switch-" / "gear" equals the "switchgear" a locator quoted."""
    return "".join(normalize(text).split()).replace("-", "")


def already_cited(hit: SweepHit, cited: list[tuple[str, Citation]]) -> bool:
    """True when a located passage for the same parameter on the same page covers this sentence."""
    mine = _squash(hit.citation.quote)
    for param_id, citation in cited:
        if param_id != hit.param_id or citation.page != hit.citation.page:
            continue
        theirs = _squash(citation.quote)
        if mine in theirs or theirs in mine:
            return True
    return False


def covers(hits: list[dict], param_id: str, page: int, quote: str) -> bool:
    """Whether a list of stored hits ({"param_id", "page", "quote"}) includes this passage."""
    want = _squash(quote)
    return any(h["param_id"] == param_id and h["page"] == page
               and (_squash(h["quote"]) in want or want in _squash(h["quote"])) for h in hits)
