"""The second synthetic pack, TENDER-2026-417, end to end with the answer-key locator.

It covers four bidders, a bid with no headline price, a bid file that cannot be opened,
a scanned page with no text, deviations the rate table cannot price, and running headers.
"""

import json
from pathlib import Path

import fitz
import pytest
from fastapi.testclient import TestClient

import specclaw_engine as engine
from samples import scenario, scenario_417
from samples.generate_sample_pack import PACKS, generate, pack_files
from specclaw_api import app
from specclaw_auth import REVIEW_HEADER
from specclaw_db import SessionLocal, TenderRepository
from specclaw_ingest import run as cli
from specclaw_ingest.parse import load_manifest, parse_document
from specclaw_ingest.pipeline import persist, run_ingest
from specclaw_ingest.tests.fakes import AnswerKeyLocator
from specclaw_ingest.verify import compare_to_answer_key

SAMPLES = Path(__file__).resolve().parents[2] / "samples"
# The concessions the answer key's clawback figures were computed with.
NEGOTIATION_ROUNDS = {
    1: [],
    2: ["PARAM-01", "PARAM-03", "PARAM-05"],
    3: ["PARAM-01", "PARAM-02", "PARAM-03", "PARAM-05", "PARAM-06"],
}
TENDER_ID = "TENDER-2026-417"
PACK = SAMPLES / TENDER_ID
MANUAL = engine.ComplianceStatus.MANUAL_INSPECTION_REQUIRED
REVIEW_HEADERS = {REVIEW_HEADER: "test-review-token"}  # token set in conftest.py


@pytest.fixture(scope="module")
def expected():
    return json.loads((PACK / "expected.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def result(expected):
    return run_ingest(PACK, locator=AnswerKeyLocator(expected), expected_tender_id=TENDER_ID)


def _cells(tender):
    return {(vid, p.id): cell for p in tender.parameters for vid, cell in p.vendors.items()}


# --- the generated files ------------------------------------------------------------------------

@pytest.mark.parametrize("tender_id", sorted(PACKS))
def test_every_pack_is_byte_identical_and_committed(tmp_path, tender_id):
    pack = PACKS[tender_id]
    first, second = tmp_path / "one", tmp_path / "two"
    generate(first, pack)
    generate(second, pack)
    for name in pack_files(pack):
        assert (first / name).read_bytes() == (second / name).read_bytes(), name
        assert (first / name).read_bytes() == (SAMPLES / tender_id / name).read_bytes(), f"{name}: regenerate the pack"


def test_pack_registry():
    assert sorted(PACKS) == ["TENDER-2026-402", "TENDER-2026-417"]
    assert PACKS["TENDER-2026-402"] is scenario


def test_pages_are_marked_synthetic_except_the_scan(expected):
    scanned = expected["scanned_pages"]
    for name in pack_files(scenario_417):
        if not name.endswith(".pdf") or name in expected["unreadable_files"]:
            continue
        with fitz.open(PACK / name) as doc:
            assert "SYNTHETIC SAMPLE" in doc.metadata["subject"]
            for index, page in enumerate(doc, start=1):
                text = page.get_text()
                if index in scanned.get(name, []):
                    assert text.strip() == "", (name, index)
                else:
                    assert "SYNTHETIC SAMPLE — not a real offer" in text, (name, index)


def test_unreadable_bid_names_itself_synthetic(expected):
    (name,) = expected["unreadable_files"]
    assert b"SYNTHETIC SAMPLE" in (PACK / name).read_bytes()


def test_answer_key_quotes_are_on_their_pages(expected):
    def page_text(filename: str, page: int) -> str:
        with fitz.open(PACK / filename) as doc:
            return " ".join(doc[page - 1].get_text().split())

    files = {v.id: v.file for v in scenario_417.VENDORS}
    for vendor_id, cells in expected["cells"].items():
        for param_id, cell in cells.items():
            if cell["quote"] is not None:
                assert " ".join(cell["quote"].split()) in page_text(files[vendor_id], cell["page"]), (vendor_id, param_id)


def test_answer_key_money_adds_up(expected):
    """The key is literal; this checks its own arithmetic, by hand-stated rates."""
    cells, vendors = expected["cells"], expected["vendors"]
    for vendor_id, by_param in cells.items():
        total = sum(float(cell["adder"]) for cell in by_param.values())
        assert f"{total:.2f}" == vendors[vendor_id]["total_adders"], vendor_id
    lindqvist = cells["vendor-d"]
    assert float(lindqvist["PARAM-03"]["adder"]) == 7 * 400
    assert float(lindqvist["PARAM-04"]["adder"]) == 65 * 60 + 200
    assert float(lindqvist["PARAM-05"]["adder"]) == (3 - 1) * 1300
    # Rate table v2: 12 months from dispatch against 24 from commissioning, with no lag stated in the MR, so the
    # warranty shortfall ((24 - 12) x 175 = 2,100) is flagged and left unpriced; only the freight class is priced.
    assert float(lindqvist["PARAM-06"]["adder"]) == 1 * 2600 + 950
    assert lindqvist["PARAM-06"]["pricing_status"] == "UNPRICED" and lindqvist["PARAM-06"]["flags_include"] == ["from dispatch"]
    assert float(vendors["vendor-d"]["true_evaluated_price"]) == 372500 + 13050
    assert vendors["vendor-d"]["price_status"] == "UNPRICED_ITEMS"


# --- the pipeline on the pack -------------------------------------------------------------------

def test_matches_answer_key(result, expected):
    cells = _cells(result.tender)
    assert len(cells) == 4 * 8
    for vendor_id, by_param in expected["cells"].items():
        for param_id, want in by_param.items():
            cell, where = cells[(vendor_id, param_id)], (vendor_id, param_id)
            assert cell.status.value == want["status"], where
            assert (cell.citation["page"] if cell.citation else None) == want["page"], where
            if want["quote"] is not None:
                assert " ".join(want["quote"].split()) in " ".join(cell.snippet.split()), where
            assert {c["field"]: c["offered"] for c in cell.checks} == want["values"], where
            assert (cell.secondary_citation["page"] if cell.secondary_citation else None) == want["secondary_page"], where
            assert cell.cost_adder == float(want["adder"]), where
    for param in result.tender.parameters:
        assert param.requirement_citation["page"] == expected["requirements"][param.id]["page"]
        required = {spec["field"]: spec["required"] for spec in param.checks_spec}
        assert required == expected["requirements"][param.id]["values"], param.id
    assert compare_to_answer_key(result.tender, expected) == []


def test_vendors_and_badges(result, expected):
    for vendor in result.tender.vendors:
        want = expected["vendors"][vendor.id]
        assert vendor.name == want["name"]
        assert vendor.badge == want["badge"], vendor.id
        assert vendor.headline_price == (float(want["headline_price"]) if want["headline_price"] else None)
    assert engine.negotiating_vendor_id(result.tender) == expected["negotiating_vendor"]


def test_bid_without_a_headline_gets_no_true_price(result, expected):
    financials = {f["vendor_id"]: f for f in engine.mask_unknown_prices(
        engine.evaluate_vendor_financials(result.tender, engine.SensitivitySettings(), []))}
    for vendor_id, want in expected["vendors"].items():
        want_true = float(want["true_evaluated_price"]) if want["true_evaluated_price"] is not None else None
        assert financials[vendor_id]["true_evaluated_price"] == want_true, vendor_id
        assert financials[vendor_id]["total_adders"] == float(want["total_adders"]), vendor_id
    assert financials["vendor-b"]["price_status"] == "NO_HEADLINE"
    assert financials["vendor-a"]["price_status"] == "PRICED"
    assert financials["vendor-d"]["price_status"] == "UNPRICED_ITEMS"  # a lower bound: the dispatch warranty has no price


def test_unpriced_deviations_are_listed_never_zeroed_silently(result, expected):
    assert result.stats["unpriced_items"] == expected["unpriced"]
    cells = _cells(result.tender)
    for item in expected["unpriced"]:
        cell = cells[(item["vendor_id"], item["param_id"])]
        assert cell.pricing_status == "UNPRICED"
        # What the table could price is shown as lines, and the rest is named in `classes`; nothing is guessed.
        priced_part = float(expected["cells"][item["vendor_id"]][item["param_id"]]["adder"])
        assert cell.cost_adder == priced_part
        assert (cell.cost_lines == []) == (priced_part == 0.0)


def test_unreadable_bid_degrades_to_manual_inspection(result):
    cells = _cells(result.tender)
    assert {cells[("vendor-c", p.id)].status for p in result.tender.parameters} == {MANUAL}
    document = next(d for d in result.documents if d.vendor_id == "vendor-c")
    assert document.page_count == 0


def test_scanned_page_is_reported_and_its_values_need_inspection(result, expected):
    document = next(d for d in result.documents if d.vendor_id == "vendor-d")
    assert document.pages_without_text == [6]
    cells = _cells(result.tender)
    assert cells[("vendor-d", "PARAM-02")].status == MANUAL
    assert cells[("vendor-d", "PARAM-07")].status == MANUAL
    # The compliance table still declares the short-time rating, so that cell is read from page 3.
    assert cells[("vendor-d", "PARAM-01")].citation["section"] == "compliance_table"


def test_warnings_are_exactly_the_expected_ones(result, expected):
    assert len(result.warnings) == len(expected["warning_prefixes"]), result.warnings
    for warning, prefix in zip(result.warnings, expected["warning_prefixes"]):
        assert warning.startswith(prefix), warning


def test_warnings_do_not_leak_the_server_folder(result):
    assert not [w for w in result.warnings if str(SAMPLES.parent) in w or "\\" in w]


def test_stats(result, expected):
    for key, value in expected["stats"].items():
        assert result.stats[key] == value, key
    assert result.stats["candidates_rejected"] == 0
    assert result.stats["exposed_risk_eur"] == float(expected["vendors"]["vendor-d"]["total_adders"])
    assert result.stats["synthetic"] is True


def test_running_headers_do_not_change_the_sections():
    manifest = load_manifest(PACK)
    bid = parse_document(PACK, next(d for d in manifest.documents if d.vendor_id == "vendor-a"))
    sections = {p.number: p.section for p in bid.pages}
    assert sections[1] == "unlabeled"
    assert [sections[n] for n in (2, 3, 6, 11, 15, 18, 21, 24)] == [
        "cover_letter", "compliance_table", "datasheet", "drawing", "bom", "test_plan", "commercial", "general"]


def test_clawback_rounds(result, expected):
    for round_num, key in ((2, "round_2"), (3, "round_3")):
        # The key names the vendor whose deviations are closed; the lowest fully priced bid is Kestrel (vendor-a).
        financials = engine.evaluate_vendor_financials(
            result.tender, engine.SensitivitySettings(), NEGOTIATION_ROUNDS[round_num], expected["clawback"]["vendor_id"])
        lindqvist = next(f for f in financials if f["vendor_id"] == "vendor-d")
        assert lindqvist["clawed_back_amount"] == float(expected["clawback"][key])


def test_cli_summary_never_prints_a_price_for_a_bid_without_one(result):
    lines = {line.split()[0]: line for line in cli._summary(result) if line.startswith("  vendor-")}
    assert "true price not available" in lines["vendor-b"] and "headline not found" in lines["vendor-b"]
    assert "true price EUR 385,550.00 (lower bound: unpriced items)" in lines["vendor-d"]


# --- through the database and the API -----------------------------------------------------------

@pytest.fixture(scope="module")
def ingested(result):
    db = SessionLocal()
    try:
        persist(result, db)
        loaded = TenderRepository(db).load_tender(TENDER_ID)
    finally:
        db.close()
    return loaded


def test_persist_round_trip(ingested, result):
    assert ingested.model_dump() == result.tender.model_dump()


def test_review_evaluate_prices_match_the_answer_key(ingested, expected):
    with TestClient(app, headers=REVIEW_HEADERS) as client:
        evaluation = client.post(f"/api/review/tenders/{TENDER_ID}/evaluate", json={})
        assert evaluation.status_code == 200
        for f in evaluation.json()["financials"]:
            want = expected["vendors"][f["vendor_id"]]["true_evaluated_price"]
            assert f["true_evaluated_price"] == (float(want) if want is not None else None), f["vendor_id"]
