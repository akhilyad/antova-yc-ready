"""Evidence crops: the cited quote behind a value, rendered as a PNG cut from its source PDF.

Pure module (no HTTP, no database). Public routes reach it through an unguessable
share ID, so document_path() only ever returns a file the tender knows by name that
resolves (symlinks and `..` included) inside that tender's own folder.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path, PurePath
from typing import Any, Literal

import fitz

from antova_ingest.pipeline import UnknownTender, tender_dir_for

PADDING_PT = 24.0
ZOOM = 2.0
MAX_WIDTH_PX = 1600
OUTLINE_PT = 1.5
OXBLOOD = (0x9E / 255, 0x2B / 255, 0x1F / 255)  # #9E2B1F


class EvidenceNotFound(Exception):
    """No citation, document or page answers the request."""


def citation_for(tender, param_id: str, source: str, which: Literal["primary", "secondary"]) -> dict[str, Any]:
    """The citation dict for one parameter: source "mr" is the buyer's requirement, otherwise a vendor ID."""
    if which not in ("primary", "secondary"):
        raise EvidenceNotFound(f"unknown citation kind {which!r}")
    param = next((p for p in tender.parameters if p.id == param_id), None)
    if param is None:
        raise EvidenceNotFound(f"unknown parameter {param_id!r}")
    if source == "mr":
        citation = param.requirement_citation if which == "primary" else None
    else:
        cell = param.vendors.get(source)
        if cell is None:
            raise EvidenceNotFound(f"unknown source {source!r} for {param_id}")
        citation = cell.citation if which == "primary" else cell.secondary_citation
    if not citation:
        raise EvidenceNotFound(f"no {which} citation for {source} {param_id}")
    return citation


def document_path(tender_id: str, filename: str, known_filenames: set[str]) -> Path:
    """The tender's own copy of `filename`, refusing unknown names and anything outside its folder."""
    if filename not in known_filenames or PurePath(filename).anchor:
        raise EvidenceNotFound(f"unknown document {filename!r}")
    try:
        root = tender_dir_for(tender_id).resolve()
    except UnknownTender as exc:
        raise EvidenceNotFound(str(exc)) from exc
    path = (root / filename).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise EvidenceNotFound(f"document {filename!r} not found for {tender_id}")
    return path


def _page(doc: fitz.Document, page: int) -> fitz.Page:
    if not 1 <= page <= doc.page_count:
        raise EvidenceNotFound(f"page {page} outside 1..{doc.page_count}")
    return doc[page - 1]


def crop_text(path, page: int, bbox) -> str:
    """The text inside `bbox` on 1-based `page`: a sanity check that a citation points at its quote."""
    with fitz.open(path) as doc:
        return _page(doc, page).get_text("text", clip=fitz.Rect(bbox))


def render_crop(path: Path, page: int, bbox: tuple[float, float, float, float]) -> bytes:
    """PNG of `bbox` plus 24 pt of context (clamped to the page), outlined in oxblood.

    Cached per file modification time, so a PDF replaced by a re-ingest is rendered afresh.
    """
    path = Path(path)
    return _render_crop_cached(str(path), path.stat().st_mtime_ns, int(page), tuple(float(v) for v in bbox))


@lru_cache(maxsize=128)
def _render_crop_cached(path: str, mtime_ns: int, page: int, bbox: tuple[float, float, float, float]) -> bytes:
    with fitz.open(path) as doc:
        pdf_page = _page(doc, page)
        target = fitz.Rect(bbox)
        clip = fitz.Rect(target.x0 - PADDING_PT, target.y0 - PADDING_PT,
                         target.x1 + PADDING_PT, target.y1 + PADDING_PT) & pdf_page.rect
        if clip.is_empty:
            raise EvidenceNotFound(f"bbox {bbox} lies outside page {page}")
        # MuPDF rounds the pixel box outwards (up to 1 px extra), hence the - 1.
        zoom = min(ZOOM, (MAX_WIDTH_PX - 1) / clip.width)
        pdf_page.draw_rect(target, color=OXBLOOD, width=OUTLINE_PT)
        pixmap = pdf_page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip, alpha=False)
        return pixmap.tobytes("png")
