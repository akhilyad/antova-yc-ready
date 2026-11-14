"""Plain-JSON forms of the pipeline's objects, used by the stage artifacts.

Every `*_to_plain` result is made of dicts, lists, strings, numbers, booleans
and None only; the matching `*_from_plain` rebuilds an equal object.
"""

from __future__ import annotations

from dataclasses import asdict, fields
from decimal import Decimal
from typing import Any

import pint

from antova_engine import ComplianceStatus, CostLine
from antova_ingest.costs import Pricing
from antova_ingest.types import (
    CheckResult,
    Citation,
    DocumentEntry,
    Evidence,
    FieldValue,
    PageText,
    ParsedDocument,
    Resolution,
    Word,
)
from antova_ingest.values import IPCode, Q_, PINT_UNITS


def value_to_plain(value: FieldValue) -> dict:
    data: dict[str, Any] = {"kind": value.kind, "display": value.display}
    raw = value.value
    if isinstance(raw, pint.Quantity):
        data["quantity"] = [raw.magnitude, value.display.split(" ", 1)[1]]
    elif isinstance(raw, IPCode):
        data["ip"] = [raw.solid, raw.liquid]
    else:
        data["value"] = raw
    for name in ("qualifier",):
        if getattr(value, name, None) is not None:
            data[name] = getattr(value, name)
    return data


def value_from_plain(data: dict) -> FieldValue:
    if "quantity" in data:
        magnitude, unit = data["quantity"]
        raw: Any = Q_(magnitude, PINT_UNITS[unit])
    elif "ip" in data:
        raw = IPCode(*data["ip"])
    else:
        raw = data["value"]
    extra = {name: data[name] for name in ("qualifier",) if name in data}
    return FieldValue(data["kind"], raw, data["display"], **extra)


def values_to_plain(values: dict[str, FieldValue]) -> dict:
    return {name: value_to_plain(v) for name, v in values.items()}


def values_from_plain(data: dict) -> dict[str, FieldValue]:
    return {name: value_from_plain(v) for name, v in data.items()}


def citation_to_plain(citation: Citation | None) -> dict | None:
    return citation.to_dict() if citation is not None else None


def citation_from_plain(data: dict | None) -> Citation | None:
    return Citation.from_dict(data) if data is not None else None


def document_to_plain(doc: ParsedDocument) -> dict:
    return {
        "file": doc.entry.file,
        "sha256": doc.sha256,
        "unreadable": None,
        "pages": [
            {"number": p.number, "text": p.text, "section": p.section, "has_text": p.has_text,
             "no_text_layer": not p.has_text,  # a scan: nothing on this page can be read
             "width": p.width, "height": p.height,
             "words": [[w.x0, w.y0, w.x1, w.y1, w.text, w.block, w.line] for w in p.words]}
            for p in doc.pages
        ],
    }


def document_from_plain(data: dict, entry: DocumentEntry) -> ParsedDocument:
    pages = [
        PageText(p["number"], p["text"], [Word(*w) for w in p["words"]], section=p["section"],
                 has_text=p["has_text"], width=p.get("width", 0.0), height=p.get("height", 0.0))
        for p in data["pages"]
    ]
    return ParsedDocument(entry=entry, sha256=data["sha256"], pages=pages)


def evidence_to_plain(evidence: Evidence) -> dict:
    data = {"param_id": evidence.param_id, "citation": evidence.citation.to_dict(),
            "values": values_to_plain(evidence.values)}
    for f in fields(Evidence):
        if f.name not in data:
            data[f.name] = getattr(evidence, f.name)
    return data


def evidence_from_plain(data: dict) -> Evidence:
    extra = {f.name: data[f.name] for f in fields(Evidence)
             if f.name not in ("param_id", "citation", "values") and f.name in data}
    return Evidence(data["param_id"], Citation.from_dict(data["citation"]), values_from_plain(data["values"]), **extra)


_RESOLUTION_CODED = ("status", "governing", "checks", "primary", "secondary")


def resolution_to_plain(r: Resolution) -> dict:
    data = {
        "status": r.status.value,
        "governing": {name: {"value": value_to_plain(v), "citation": c.to_dict()}
                      for name, (v, c) in r.governing.items()},
        "checks": [c.to_dict() for c in r.checks],
        "primary": citation_to_plain(r.primary),
        "secondary": citation_to_plain(r.secondary),
    }
    for f in fields(Resolution):
        if f.name not in _RESOLUTION_CODED:
            data[f.name] = getattr(r, f.name)
    return data


def resolution_from_plain(data: dict) -> Resolution:
    plain = {f.name: data[f.name] for f in fields(Resolution) if f.name not in _RESOLUTION_CODED and f.name in data}
    return Resolution(
        status=ComplianceStatus(data["status"]),
        governing={name: (value_from_plain(g["value"]), Citation.from_dict(g["citation"]))
                   for name, g in data["governing"].items()},
        checks=[CheckResult(**c) for c in data["checks"]],
        primary=citation_from_plain(data["primary"]),
        secondary=citation_from_plain(data["secondary"]),
        **plain,
    )


def pricing_to_plain(p: Pricing) -> dict:
    data = asdict(p)
    data["lines"] = [line.model_dump(mode="json") for line in p.lines]
    data["adder"] = str(p.adder)
    return data


def pricing_from_plain(data: dict) -> Pricing:
    values = dict(data)
    values["lines"] = [CostLine(**line) for line in data["lines"]]
    values["adder"] = Decimal(data["adder"])
    return Pricing(**values)
