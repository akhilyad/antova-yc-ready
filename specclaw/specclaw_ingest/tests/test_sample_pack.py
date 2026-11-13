"""The generated sample tender pack and its answer key."""

import json
from decimal import Decimal
from pathlib import Path

import fitz  # PyMuPDF

from samples.generate_sample_pack import generate

PACK = Path(__file__).resolve().parents[2] / "samples" / "TENDER-2026-402"
PDFS = [
    "MR-33kV-GIS-Rev4.pdf",
    "Bid_vendor-a_Nordwerk.pdf",
    "Bid_vendor-b_VoltSwitch.pdf",
    "Bid_vendor-c_Deltaport.pdf",
]
FILES = PDFS + ["manifest.json", "expected.json"]
BID_FILES = {
    "vendor-a": "Bid_vendor-a_Nordwerk.pdf",
    "vendor-b": "Bid_vendor-b_VoltSwitch.pdf",
    "vendor-c": "Bid_vendor-c_Deltaport.pdf",
}
NON_COMPLIANT = {
    ("vendor-b", "PARAM-01"): "CONFLICT_DOWNGRADE",
    ("vendor-b", "PARAM-02"): "DEVIATION_DOWNGRADE",
    ("vendor-b", "PARAM-03"): "DEVIATION_DOWNGRADE",
    ("vendor-b", "PARAM-04"): "CONFLICT_DOWNGRADE",
    ("vendor-b", "PARAM-05"): "OMITTED",
    ("vendor-b", "PARAM-06"): "DEVIATION_DOWNGRADE",
    ("vendor-c", "PARAM-01"): "DEVIATION_DOWNGRADE",
    ("vendor-c", "PARAM-04"): "DEVIATION_DOWNGRADE",
    ("vendor-c", "PARAM-05"): "DEVIATION_DOWNGRADE",
    ("vendor-c", "PARAM-06"): "DEVIATION_DOWNGRADE",
}


def _expected() -> dict:
    return json.loads((PACK / "expected.json").read_text(encoding="utf-8"))


def _page_text(filename: str, page: int) -> str:
    with fitz.open(PACK / filename) as doc:
        return " ".join(doc[page - 1].get_text().split())


def _flat(text: str) -> str:
    return " ".join(text.split())


def test_generation_is_byte_identical(tmp_path):
    first, second = tmp_path / "one", tmp_path / "two"
    generate(first)
    generate(second)
    for name in FILES:
        assert (first / name).read_bytes() == (second / name).read_bytes(), name


def test_committed_pack_matches_generator(tmp_path):
    generate(tmp_path)
    for name in FILES:
        assert (tmp_path / name).read_bytes() == (PACK / name).read_bytes(), name


def test_every_page_has_synthetic_footer():
    for name in PDFS:
        with fitz.open(PACK / name) as doc:
            for index, page in enumerate(doc, start=1):
                text = page.get_text()
                assert "SYNTHETIC SAMPLE — not a real offer" in text, (name, index)
                assert f"Page {index} of {doc.page_count}" in text, (name, index)


def test_page_counts():
    with fitz.open(PACK / "MR-33kV-GIS-Rev4.pdf") as doc:
        assert doc.page_count == 26
    for name in BID_FILES.values():
        with fitz.open(PACK / name) as doc:
            assert doc.page_count == 30, name


def test_answer_key_quotes_are_on_their_pages():
    expected = _expected()
    for param_id, req in expected["requirements"].items():
        page = _page_text("MR-33kV-GIS-Rev4.pdf", req["page"])
        for quote in req["quotes"]:
            assert _flat(quote) in page, (param_id, quote)
    for vendor_id, cells in expected["cells"].items():
        filename = BID_FILES[vendor_id]
        for param_id, cell in cells.items():
            assert _flat(cell["quote"]) in _page_text(filename, cell["page"]), (vendor_id, param_id)
            if cell["secondary_page"] is not None:
                candidates = expected["ideal_locate"][filename]["candidates"]
                secondary = [
                    c for c in candidates
                    if c["param_id"] == param_id and c["page"] == cell["secondary_page"]
                ]
                assert secondary, (vendor_id, param_id)
                assert _flat(secondary[0]["quote"]) in _page_text(filename, cell["secondary_page"])
    for vendor_id, filename in BID_FILES.items():
        headline = expected["ideal_locate"][filename]["headline_price"]
        assert _flat(headline["quote"]) in _page_text(filename, headline["page"]), vendor_id


def test_answer_key_money():
    vendors = _expected()["vendors"]
    assert vendors["vendor-a"]["total_adders"] == "0.00"
    assert vendors["vendor-b"]["total_adders"] == "64800.00"
    assert vendors["vendor-c"]["total_adders"] == "15000.00"
    assert vendors["vendor-a"]["true_evaluated_price"] == "452000.00"
    assert vendors["vendor-b"]["true_evaluated_price"] == "482800.00"
    assert vendors["vendor-c"]["true_evaluated_price"] == "454000.00"
    for vendor_id, cells in _expected()["cells"].items():
        total = sum(Decimal(cell["adder"]) for cell in cells.values())
        assert f"{total:.2f}" == vendors[vendor_id]["total_adders"], vendor_id
    # Amendment A2: the figures are what closing VoltSwitch's deviations recovers; Nordwerk negotiates.
    assert _expected()["clawback"] == {"vendor_id": "vendor-b", "round_2": "33900.00", "round_3": "57400.00"}
    assert _expected()["negotiating_vendor"] == "vendor-a"


def test_answer_key_statuses():
    cells = _expected()["cells"]
    seen = 0
    for vendor_id, by_param in cells.items():
        for param_id, cell in by_param.items():
            seen += 1
            assert cell["status"] == NON_COMPLIANT.get((vendor_id, param_id), "COMPLIANT"), (vendor_id, param_id)
    assert seen == 24


def test_ideal_locate_covers_cells():
    expected = _expected()
    for vendor_id, cells in expected["cells"].items():
        candidates = expected["ideal_locate"][BID_FILES[vendor_id]]["candidates"]
        located = {(c["param_id"], c["page"], c["quote"]) for c in candidates}
        for param_id, cell in cells.items():
            assert (param_id, cell["page"], cell["quote"]) in located, (vendor_id, param_id)
            if cell["secondary_page"] is not None:
                assert any(
                    p == param_id and page == cell["secondary_page"] for p, page, _ in located
                ), (vendor_id, param_id)


def test_manifest():
    manifest = json.loads((PACK / "manifest.json").read_text(encoding="utf-8"))
    roles = [d["role"] for d in manifest["documents"]]
    assert roles.count("mr_spec") == 1
    assert roles.count("vendor_bid") == 3
    assert manifest["engineering_estimates"] == {"busbar_cu_kg": 1480, "heavy_haul_loads": 2}
    assert manifest["tender_id"] == "TENDER-2026-402"
    assert manifest["synthetic"] is True
