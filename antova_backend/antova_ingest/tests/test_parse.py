"""Manifest loading, PDF parsing, section tagging and quote verification."""

import json
import shutil
from decimal import Decimal
from pathlib import Path

import fitz
import pytest

from samples import scenario
from antova_ingest.parse import (
    DocumentUnreadable,
    ManifestError,
    load_manifest,
    parse_document,
    parse_pdf,
    verify_quote,
)
from antova_ingest.types import DocumentEntry

PACK = Path(__file__).resolve().parents[2] / "samples" / "TENDER-2026-402"
NOTE_7 = scenario._EV_BY_KEY["b.p01"].text
BOM_44 = scenario._EV_BY_KEY["b.p04"].text


def _doc(vendor_id: str):
    manifest = load_manifest(PACK)
    entry = next(d for d in manifest.documents if d.vendor_id == vendor_id)
    return parse_document(PACK, entry)


@pytest.fixture(scope="module")
def voltswitch():
    return _doc("vendor-b")


def test_load_sample_manifest():
    manifest = load_manifest(PACK)
    assert manifest.tender_id == "TENDER-2026-402"
    assert len(manifest.documents) == 4
    assert manifest.engineering_estimates == {"busbar_cu_kg": Decimal("1480"), "heavy_haul_loads": Decimal("2")}


def _broken(tmp_path: Path, mutate) -> Path:
    for name in ("manifest.json", *[d["file"] for d in scenario.manifest()["documents"]]):
        shutil.copy(PACK / name, tmp_path / name)
    data = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
    mutate(data, tmp_path)
    (tmp_path / "manifest.json").write_text(json.dumps(data), encoding="utf-8")
    return tmp_path


def _missing_file(data, folder):
    (folder / data["documents"][1]["file"]).unlink()


def _two_mr(data, folder):
    data["documents"][1] = {"file": data["documents"][1]["file"], "role": "mr_spec"}


def _no_bids(data, folder):
    data["documents"] = data["documents"][:1]


def _bad_id(data, folder):
    data["tender_id"] = "../x"


def _bid_without_vendor(data, folder):
    del data["documents"][2]["vendor_id"]


@pytest.mark.parametrize("mutate", [_missing_file, _two_mr, _no_bids, _bad_id, _bid_without_vendor])
def test_manifest_errors(tmp_path, mutate):
    with pytest.raises(ManifestError):
        load_manifest(_broken(tmp_path, mutate))


def test_sections_voltswitch(voltswitch):
    sections = {p.number: p.section for p in voltswitch.pages}
    assert sections[1] == "unlabeled"
    assert sections[2] == "cover_letter"
    assert sections[4] == "compliance_table"
    assert sections[11] == "drawing"
    assert sections[15] == "bom"
    assert sections[18] == "test_plan"
    assert sections[21] == "commercial"
    assert sections[23] == "general"


def test_sections_deltaport_schedule():
    assert _doc("vendor-c").pages[2].section == "compliance_table"


def test_mr_pages_are_mr_spec():
    manifest = load_manifest(PACK)
    mr = parse_document(PACK, next(d for d in manifest.documents if d.role == "mr_spec"))
    assert len(mr.pages) == 26
    assert {p.section for p in mr.pages} == {"mr_spec"}


def test_blank_page_has_no_text(tmp_path):
    doc = fitz.open()
    doc.new_page()
    page = doc.new_page()
    page.insert_text((72, 72), "This page carries enough ordinary text to count as text.")
    path = tmp_path / "blank.pdf"
    doc.save(path)
    assert [p.has_text for p in parse_pdf(path)] == [False, True]


def test_encrypted_pdf_unreadable(tmp_path):
    doc = fitz.open()
    doc.new_page().insert_text((72, 72), "Secret offer text that cannot be read.")
    path = tmp_path / "locked.pdf"
    doc.save(path, encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="x", owner_pw="y")
    with pytest.raises(DocumentUnreadable):
        parse_pdf(path)


def test_corrupt_pdf_unreadable(tmp_path):
    path = tmp_path / "junk.pdf"
    path.write_bytes(b"this is not a pdf at all" * 20)
    with pytest.raises(DocumentUnreadable):
        parse_pdf(path)


def test_verify_exact(voltswitch):
    citation = verify_quote(voltswitch, 11, NOTE_7)
    assert citation is not None
    assert citation.page == 11
    assert citation.section == "drawing"
    assert citation.filename == "Bid_vendor-b_VoltSwitch.pdf"
    x0, y0, x1, y1 = citation.bbox
    assert 0 <= x0 < x1 <= 595.3 and 0 <= y0 < y1 <= 841.9


def test_verify_spacing_variant(voltswitch):
    assert verify_quote(voltswitch, 11, "Standard switchgear bay rated 31.5 kA 1 s") is not None


def test_verify_dash_and_quote_variants(voltswitch):
    citation = verify_quote(voltswitch, 3, "IEC 61850 Ed.2 with PRP redundancy — Complied")
    assert citation is not None and citation.page == 3


def test_verify_off_by_one(voltswitch):
    citation = verify_quote(voltswitch, 12, NOTE_7)
    assert citation is not None and citation.page == 11


def test_verify_too_far(voltswitch):
    assert verify_quote(voltswitch, 14, NOTE_7) is None


@pytest.mark.parametrize("page", [0, -1, 99])
def test_verify_page_out_of_range(voltswitch, page):
    assert verify_quote(voltswitch, page, NOTE_7) is None


def test_verify_short_quote(voltswitch):
    assert verify_quote(voltswitch, 11, "31.5kA 1s") is None


def test_verify_absent_quote(voltswitch):
    assert verify_quote(voltswitch, 11, "Standard switchgear bay rated 50 kA for 3 s") is None


def test_verify_multiline_bbox(voltswitch):
    citation = verify_quote(voltswitch, 15, BOM_44)
    assert citation is not None
    assert citation.bbox[3] - citation.bbox[1] > 14


def test_verify_expands_fragment_to_sentence(voltswitch):
    """Final review I3: the citation carries the whole sentence from the page, not the model's fragment."""
    citation = verify_quote(voltswitch, 11, "Standard switchgear bay rated 31.5kA")
    assert citation is not None
    assert citation.quote == "NOTE 7: Standard switchgear bay rated 31.5kA 1s."
    assert citation.paragraph == NOTE_7


def test_verify_carve_out_fragment_keeps_its_sentence(voltswitch):
    citation = verify_quote(voltswitch, 11, "50kA high-duty upgrade")
    assert citation is not None
    assert citation.quote == "50kA high-duty upgrade excluded from base price."


def test_verify_table_row_expands_to_row(voltswitch):
    citation = verify_quote(voltswitch, 3, "IEC 61850 Ed.2 with PRP")
    assert citation is not None
    assert citation.quote == "IEC 61850 Ed.2 with PRP redundancy - Complied"


def test_verify_uses_page_text_not_quote_text(voltswitch):
    citation = verify_quote(voltswitch, 7, "standard indoor enclosure ip42 with ventilation louvres")
    assert citation is not None
    assert "IP42" in citation.quote
    assert citation.quote.endswith("(front and lateral only).")


def test_verify_rejects_match_starting_mid_word(voltswitch):
    """Final review M2: '0 °C' must not match inside '40 °C'."""
    assert verify_quote(voltswitch, 7, "0 °C without derating.") is None


def test_document_entry_role_is_typed():
    assert DocumentEntry(file="x.pdf", role="mr_spec").vendor_id is None
