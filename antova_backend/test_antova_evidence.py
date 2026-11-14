"""Evidence crops: find a cited quote, keep file reads inside the tender folder, render it to PNG."""

import os

import fitz
import pytest

from antova_evidence import EvidenceNotFound, citation_for, crop_text, document_path, render_crop
from antova_ingest.parse import load_manifest
from antova_ingest.pipeline import run_ingest
from antova_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected

TENDER_ID = "TENDER-2026-402"
KNOWN = {d.file for d in load_manifest(PACK).documents}
OXBLOOD = (0x9E, 0x2B, 0x1F)


@pytest.fixture(scope="module")
def tender():
    return run_ingest(PACK, locator=AnswerKeyLocator(load_expected())).tender


def _text(tender, param_id, source, which="primary"):
    citation = citation_for(tender, param_id, source, which)
    path = document_path(TENDER_ID, citation["filename"], KNOWN)
    return " ".join(crop_text(path, citation["page"], citation["bbox"]).split())


def _blank_pdf(path, width=400, height=300):
    doc = fitz.open()
    doc.new_page(width=width, height=height)
    doc.save(path)
    doc.close()
    return path


def _png(data):
    assert data.startswith(b"\x89PNG")
    return fitz.Pixmap(data)


@pytest.fixture
def tenders_dir(tmp_path, monkeypatch):
    """A throwaway tenders root holding TENDER-2026-999 with one PDF, and a PDF just outside it."""
    folder = tmp_path / "tenders" / "TENDER-2026-999"
    folder.mkdir(parents=True)
    (folder / "manifest.json").write_text("{}", encoding="utf-8")
    _blank_pdf(folder / "bid.pdf")
    _blank_pdf(tmp_path / "tenders" / "secret.pdf")
    monkeypatch.setenv("ANTOVA_TENDERS_DIR", str(tmp_path / "tenders"))
    return folder


# --- the cited text --------------------------------------------------------------------------

def test_vendor_primary_citation_text(tender):
    assert "NOTE 7" in _text(tender, "PARAM-01", "vendor-b")


def test_secondary_citation_is_cover_letter(tender):
    assert "50 kA / 3 s" in _text(tender, "PARAM-01", "vendor-b", "secondary")


def test_mr_citation(tender):
    assert "50 kA RMS" in _text(tender, "PARAM-01", "mr")


def test_missing_secondary_raises(tender):
    with pytest.raises(EvidenceNotFound):
        citation_for(tender, "PARAM-02", "vendor-b", "secondary")


def test_mr_has_no_secondary(tender):
    with pytest.raises(EvidenceNotFound):
        citation_for(tender, "PARAM-01", "mr", "secondary")


@pytest.mark.parametrize("param_id, source, which", [
    ("PARAM-99", "vendor-b", "primary"),
    ("PARAM-01", "vendor-z", "primary"),
    ("PARAM-01", "vendor-b", "tertiary"),
    ("PARAM-01", "mr", "tertiary"),
])
def test_unknown_lookup_raises(tender, param_id, source, which):
    with pytest.raises(EvidenceNotFound):
        citation_for(tender, param_id, source, which)


def test_crop_page_out_of_range():
    path = document_path(TENDER_ID, "MR-33kV-GIS-Rev4.pdf", KNOWN)
    for page in (0, 27):
        with pytest.raises(EvidenceNotFound):
            crop_text(path, page, (0.0, 0.0, 100.0, 100.0))


# --- path containment ------------------------------------------------------------------------

def test_document_path_resolves_inside_pack():
    assert document_path(TENDER_ID, "MR-33kV-GIS-Rev4.pdf", KNOWN) == (PACK / "MR-33kV-GIS-Rev4.pdf").resolve()


def test_unknown_filename_rejected():
    with pytest.raises(EvidenceNotFound):
        document_path(TENDER_ID, "manifest.json", KNOWN)


def test_path_traversal_rejected():
    with pytest.raises(EvidenceNotFound):
        document_path(TENDER_ID, "../manifest.json", KNOWN | {"../manifest.json"})


def test_traversal_to_existing_file_rejected(tenders_dir):
    """Even a known name is refused when it resolves to a real file outside the tender folder."""
    with pytest.raises(EvidenceNotFound):
        document_path("TENDER-2026-999", "../secret.pdf", {"../secret.pdf"})


def test_absolute_filename_rejected(tenders_dir):
    absolute = str(tenders_dir / "bid.pdf")
    with pytest.raises(EvidenceNotFound):
        document_path("TENDER-2026-999", absolute, {absolute})


def test_symlink_out_of_tender_rejected(tenders_dir):
    link = tenders_dir / "link.pdf"
    try:
        os.symlink(tenders_dir.parent / "secret.pdf", link)
    except OSError:
        pytest.skip("symlinks need extra privileges on this machine")
    with pytest.raises(EvidenceNotFound):
        document_path("TENDER-2026-999", "link.pdf", {"link.pdf"})


def test_missing_file_rejected(tenders_dir):
    with pytest.raises(EvidenceNotFound):
        document_path("TENDER-2026-999", "gone.pdf", {"gone.pdf"})


def test_unknown_tender_rejected(tenders_dir):
    for tender_id in ("TENDER-2026-404", "../TENDER-2026-999"):
        with pytest.raises(EvidenceNotFound):
            document_path(tender_id, "bid.pdf", {"bid.pdf"})


def test_document_path_honours_tenders_dir(tenders_dir):
    assert document_path("TENDER-2026-999", "bid.pdf", {"bid.pdf"}) == (tenders_dir / "bid.pdf").resolve()


# --- rendering -------------------------------------------------------------------------------

def test_render_crop_is_png(tender):
    citation = citation_for(tender, "PARAM-01", "vendor-b", "primary")
    path = document_path(TENDER_ID, citation["filename"], KNOWN)
    pix = _png(render_crop(path, citation["page"], tuple(citation["bbox"])))
    assert 0 < pix.width <= 1600


def test_render_crop_pads_24pt_at_zoom_2(tmp_path):
    pix = _png(render_crop(_blank_pdf(tmp_path / "a.pdf"), 1, (100.0, 100.0, 200.0, 150.0)))
    assert (pix.width, pix.height) == (2 * 148, 2 * 98)


def test_render_crop_clamps_padding_to_page(tmp_path):
    pix = _png(render_crop(_blank_pdf(tmp_path / "a.pdf"), 1, (0.0, 0.0, 50.0, 50.0)))
    assert (pix.width, pix.height) == (2 * 74, 2 * 74)


def test_render_crop_outlines_bbox_in_oxblood(tmp_path):
    pix = _png(render_crop(_blank_pdf(tmp_path / "a.pdf"), 1, (100.0, 100.0, 200.0, 150.0)))
    # The clip starts at (76, 76); the left edge x=100 and the middle y=125 sit at 2 px per pt.
    assert pix.pixel(2 * (100 - 76), 2 * (125 - 76))[:3] == OXBLOOD
    assert pix.pixel(2 * (150 - 76), 2 * (125 - 76))[:3] == (255, 255, 255)


def test_render_crop_caps_width(tmp_path):
    path = _blank_pdf(tmp_path / "wide.pdf", width=3000, height=200)
    pix = _png(render_crop(path, 1, (100.0, 50.0, 2900.0, 100.0)))
    assert 1590 <= pix.width <= 1600


def test_render_crop_off_page_bbox_raises(tmp_path):
    with pytest.raises(EvidenceNotFound):
        render_crop(_blank_pdf(tmp_path / "a.pdf"), 1, (900.0, 900.0, 950.0, 950.0))


def test_render_crop_page_out_of_range(tmp_path):
    with pytest.raises(EvidenceNotFound):
        render_crop(_blank_pdf(tmp_path / "a.pdf"), 2, (10.0, 10.0, 20.0, 20.0))


def test_render_crop_is_cached_for_list_and_tuple_bbox(tmp_path):
    path = _blank_pdf(tmp_path / "a.pdf")
    first = render_crop(path, 1, [10, 10, 60, 60])
    assert render_crop(path, 1, (10.0, 10.0, 60.0, 60.0)) is first


def test_render_crop_rerenders_after_file_changes(tmp_path):
    """The cache is keyed on the file's mtime, so a re-ingested PDF is never served from a stale crop."""
    path = _blank_pdf(tmp_path / "a.pdf")
    bbox = (100.0, 100.0, 200.0, 150.0)
    first = render_crop(path, 1, bbox)
    doc = fitz.open()
    page = doc.new_page(width=400, height=300)
    page.draw_rect(page.rect, color=(0, 0, 0), fill=(0, 0, 0))
    doc.save(path)
    doc.close()
    later = path.stat().st_mtime_ns + 5_000_000_000
    os.utime(path, ns=(later, later))
    assert render_crop(path, 1, bbox) != first
