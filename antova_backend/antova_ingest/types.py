"""Shared data types for the ingestion pipeline."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, fields
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel

from antova_engine import ComplianceStatus, Criticality, TenderPackage  # noqa: F401

Section = Literal[
    "mr_spec", "cover_letter", "compliance_table", "datasheet", "drawing",
    "bom", "test_plan", "commercial", "general", "unlabeled",
]
FieldKind = Literal[
    "current", "duration", "voltage", "temperature", "material", "ip", "iac",
    "protocol", "marshalling", "fat_days", "incoterm", "months",
]


class DocumentEntry(BaseModel):
    file: str
    role: Literal["mr_spec", "vendor_bid"]
    vendor_id: str | None = None
    vendor_name: str | None = None
    country: str | None = None


class TenderManifest(BaseModel):
    tender_id: str
    title: str
    client: str
    equipment_class: str
    rate_table: str
    documents: list[DocumentEntry]
    engineering_estimates: dict[str, Decimal]
    synthetic: bool = False


@dataclass(frozen=True)
class Word:
    x0: float
    y0: float
    x1: float
    y1: float
    text: str
    block: int = 0  # PyMuPDF text block: one paragraph or table row
    line: int = 0  # line number inside the block


@dataclass
class PageText:
    number: int
    text: str
    words: list[Word]
    section: Section = "unlabeled"
    has_text: bool = True
    width: float = 0.0  # page size in PDF points; 0 when unknown (a page built from text alone)
    height: float = 0.0


@dataclass
class ParsedDocument:
    entry: DocumentEntry
    sha256: str
    pages: list[PageText]


@dataclass(frozen=True)
class Citation:
    """Where evidence sits. `quote` is the page's own full sentence (or table row)
    containing the matched text; `paragraph` is the whole text block around it."""

    filename: str
    page: int
    bbox: tuple[float, float, float, float]
    quote: str
    section: Section
    paragraph: str = ""
    # How the quote was found: "exact", or "dehyphenated" when it only matched with a
    # line-end hyphen removed ("switch-" + "gear" for "switchgear").
    match: str = "exact"
    # One box per text line of the quote (a sentence that wraps is not one rectangle).
    # For drawing the highlight only; `bbox` is their outer box.
    rects: tuple[tuple[float, float, float, float], ...] = ()

    def to_dict(self) -> dict:
        data = asdict(self)
        data["bbox"] = list(self.bbox)
        data["rects"] = [list(r) for r in self.rects]
        return data

    @classmethod
    def from_dict(cls, data: dict) -> "Citation":
        known = {f.name for f in fields(cls)}
        values = {k: v for k, v in data.items() if k in known}
        values["bbox"] = tuple(values["bbox"])
        values["rects"] = tuple(tuple(r) for r in values.get("rects", ()))
        return cls(**values)


@dataclass(frozen=True)
class FieldValue:
    kind: FieldKind
    value: Any
    display: str
    # What the value is measured from, where that matters (a warranty's start point).
    qualifier: str | None = None


@dataclass
class Evidence:
    param_id: str
    citation: Citation
    values: dict[str, FieldValue]
    # "locator": a passage the locator returned. "sweep": found by the recall sweep (sweep.py),
    # which may only make a cell worse or flagged, never compliant.
    source: str = "locator"


@dataclass
class CheckResult:
    field: str
    operator: str
    required: str
    offered: str
    offered_canonical: str
    passed: bool
    citation_ref: str
    # Where each side measures from, for a warranty: dispatch, delivery, commissioning or unspecified.
    required_basis: str | None = None
    offered_basis: str | None = None
    # False when the two sides start from different points and nothing in the MR says how far apart.
    comparable: bool = True
    # The offered months restated on the required basis, when the MR's own duration allowed it.
    offered_equivalent: int | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Resolution:
    param_id: str
    vendor_id: str
    status: ComplianceStatus
    governing: dict[str, tuple[FieldValue, Citation]]
    checks: list[CheckResult]
    primary: Citation | None
    secondary: Citation | None
    conflict_note: str | None
    extracted_text: str
    confidence: float
    # Things a person must look at: [{"code": ..., "message": ...}]
    flags: list[dict] = field(default_factory=list)
    # For a COMPLIANT cell: "documentary" or "claim_only" (cover letter or compliance table only).
    evidence: str | None = None
    # One entry per value shown in extracted_text: {"field", "label", "text", "citation"}.
    segments: list[dict] = field(default_factory=list)
    # "assembled from p.11 and p.3" when the values shown come from more than one page.
    assembled_from: str | None = None


@dataclass
class SourceDocumentInfo:
    filename: str
    role: str
    vendor_id: str | None
    sha256: str
    page_count: int
    pages_without_text: list[int] = field(default_factory=list)


@dataclass
class IngestResult:
    tender: TenderPackage
    documents: list[SourceDocumentInfo]
    stats: dict
    warnings: list[str]
    # stage name -> StageArtifact (antova_ingest.artifacts), in stage order
    artifacts: dict = field(default_factory=dict)
    # {"fingerprint": sha256, "parts": {...}} (antova_ingest.artifacts.run_fingerprint)
    fingerprint: dict = field(default_factory=dict)
