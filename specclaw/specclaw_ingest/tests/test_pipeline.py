"""End-to-end ingest on the sample pack, using the answer-key locator."""

import dataclasses
import shutil
import copy
from decimal import Decimal
from pathlib import Path

import pytest

from specclaw_review import evidence_hash

import specclaw_engine as engine
from specclaw_db import SessionLocal, TenderRepository
from specclaw_ingest.extract import ClaudeLocator, ResponseStore
from specclaw_ingest.pipeline import (
    STAGES,
    IngestFailed,
    UnknownTender,
    persist,
    run_ingest,
    tender_dir_for,
)
from specclaw_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected

VOLTSWITCH = "Bid_vendor-b_VoltSwitch.pdf"
DELTAPORT = "Bid_vendor-c_Deltaport.pdf"


@pytest.fixture(scope="module")
def expected():
    return load_expected()


@pytest.fixture(scope="module")
def result(expected):
    return run_ingest(PACK, locator=AnswerKeyLocator(expected))


def _cells(tender):
    return {(vid, p.id): cell for p in tender.parameters for vid, cell in p.vendors.items()}


def _copy_pack(tmp_path: Path) -> Path:
    for item in PACK.iterdir():
        if item.is_file():
            shutil.copy(item, tmp_path / item.name)
    return tmp_path


def test_matches_answer_key(result, expected):
    cells = _cells(result.tender)
    assert len(cells) == 24
    for vendor_id, by_param in expected["cells"].items():
        for param_id, want in by_param.items():
            cell = cells[(vendor_id, param_id)]
            where = (vendor_id, param_id)
            assert cell.status.value == want["status"], where
            assert cell.citation["page"] == want["page"], where
            assert " ".join(want["quote"].split()) in " ".join(cell.snippet.split()), where
            secondary = cell.secondary_citation["page"] if cell.secondary_citation else None
            assert secondary == want["secondary_page"], where
            assert cell.cost_adder == float(want["adder"]), where
            offered = {c["field"]: c["offered"] for c in cell.checks}
            assert offered == want["values"], where
    for vendor in result.tender.vendors:
        assert vendor.headline_price == float(expected["vendors"][vendor.id]["headline_price"])
        assert vendor.name == expected["vendors"][vendor.id]["name"]
    for param in result.tender.parameters:
        assert param.requirement_citation["page"] == expected["requirements"][param.id]["page"]


def test_tender_fields(result):
    tender = result.tender
    assert tender.id == "TENDER-2026-402"
    assert tender.mr_doc == "MR-33kV-GIS-Rev4.pdf (26 pages)"
    assert tender.rate_table_version == "mv_gis_switchgear_v2"
    p01 = next(p for p in tender.parameters if p.id == "PARAM-01")
    assert p01.pint_rule == "Ik ≥ 50 kA AND t ≥ 3 s"
    badges = {v.id: v.badge for v in tender.vendors}
    # Amendment A2: Nordwerk has the lowest true evaluated price; VoltSwitch only looks cheapest.
    assert badges == {"vendor-a": "Lowest Evaluated Price", "vendor-b": "Apparent Low Bidder", "vendor-c": "Bidder"}
    cell = next(p for p in tender.parameters if p.id == "PARAM-01").vendors["vendor-b"]
    assert cell.bbox.startswith("Page 11 (Drawing), BBox [")
    assert cell.conflict_note.endswith("Drawing governs.")


def test_progress_stages(expected):
    seen = []
    run_ingest(PACK, locator=AnswerKeyLocator(expected), progress=lambda stage, pct: seen.append((stage, pct)))
    assert seen == STAGES


def test_stats(result):
    stats = result.stats
    assert stats["documents"] == 4
    assert stats["pages_parsed"] == 116
    assert stats["sld_sheets"] == 12
    assert stats["deviations_found"] == 10
    assert stats["exposed_risk_eur"] == 61650.0  # a lower bound: the dispatch warranty of PARAM-06 is unpriced
    assert stats["unpriced_items"] == [
        {"vendor_id": "vendor-b", "param_id": "PARAM-06", "classes": ["PARAM-06.warranty_basis_unresolved"]}]
    assert stats["api_cost_usd"] == 0.0
    assert stats["candidates_rejected"] == 0
    assert stats["candidates_accepted"] > 0
    assert stats["rate_table_effective_date"] == "2026-11-13"  # R26: the brief says "as of"
    assert result.warnings == []


def test_rejected_candidate_counted(expected):
    ideal = expected["ideal_locate"][VOLTSWITCH]["candidates"]
    bogus = {"param_id": "PARAM-02", "page": 6, "quote": "copper busbars rated 4000 A continuous"}
    locator = AnswerKeyLocator(expected, {VOLTSWITCH: {"candidates": ideal + [bogus]}})
    assert run_ingest(PACK, locator=locator).stats["candidates_rejected"] == 1


def test_fragment_candidate_keeps_conflict(expected):
    """Final review I3: a carve-out fragment of NOTE 7 must not make VoltSwitch PARAM-01 compliant."""
    candidates = [c for c in expected["ideal_locate"][VOLTSWITCH]["candidates"]
                  if not (c["param_id"] == "PARAM-01" and c["page"] == 11)]
    candidates.append({"param_id": "PARAM-01", "page": 11, "quote": "50kA high-duty upgrade"})
    run = run_ingest(PACK, locator=AnswerKeyLocator(expected, {VOLTSWITCH: {"candidates": candidates}}))
    cell = _cells(run.tender)[("vendor-b", "PARAM-01")]
    assert cell.status == engine.ComplianceStatus.CONFLICT_DOWNGRADE
    assert cell.cost_adder == 18500.0
    financials = {f["vendor_id"]: f for f in engine.evaluate_vendor_financials(run.tender, engine.SensitivitySettings(), [])}
    assert financials["vendor-b"]["true_evaluated_price"] == 479650.0  # a lower bound under v2 (warranty unpriced)


def test_manifest_id_must_match_requested_tender(tmp_path, expected):
    """Final review I4: a copied folder whose manifest still names TENDER-2026-402 must not overwrite it."""
    folder = tmp_path / "TENDER-2026-403"
    folder.mkdir()
    _copy_pack(folder)
    with pytest.raises(IngestFailed, match="TENDER-2026-402"):
        run_ingest(folder, locator=AnswerKeyLocator(expected), expected_tender_id="TENDER-2026-403")


def test_stats_name_the_tender(result):
    assert result.stats["tender_id"] == "TENDER-2026-402"


def test_unreadable_mr_fails(tmp_path, expected):
    folder = _copy_pack(tmp_path)
    (folder / "MR-33kV-GIS-Rev4.pdf").write_bytes(b"not a pdf" * 50)
    with pytest.raises(IngestFailed):
        run_ingest(folder, locator=AnswerKeyLocator(expected))


def test_unreadable_bid_degrades(tmp_path, expected, result):
    folder = _copy_pack(tmp_path)
    (folder / DELTAPORT).write_bytes(b"not a pdf" * 50)
    degraded = run_ingest(folder, locator=AnswerKeyLocator(expected))
    cells = _cells(degraded.tender)
    assert {cells[("vendor-c", f"PARAM-0{i}")].status for i in range(1, 9)} == {engine.ComplianceStatus.MANUAL_INSPECTION_REQUIRED}
    assert any("vendor-c" in w for w in degraded.warnings)
    original = _cells(result.tender)
    for i in range(1, 9):
        key = ("vendor-b", f"PARAM-0{i}")
        assert cells[key].status == original[key].status


def test_missing_headline(expected):
    locator = AnswerKeyLocator(expected, {VOLTSWITCH: {"headline_price": None}})
    run = run_ingest(PACK, locator=locator)
    voltswitch = next(v for v in run.tender.vendors if v.id == "vendor-b")
    assert voltswitch.headline_price is None  # unknown is null, never 0
    assert voltswitch.headline_status == "NOT_FOUND"
    assert voltswitch.badge == "Price not found"
    assert "vendor-b: headline price not found" in run.warnings
    assert engine.negotiating_vendor_id(run.tender) == "vendor-a"  # A2: lowest true price among priced bids
    assert engine.apparent_low_bidder_id(run.tender) == "vendor-c"


def test_replay_miss_fails(tmp_path):
    locator = ClaudeLocator(ResponseStore(tmp_path / "empty"), "replay")
    with pytest.raises(IngestFailed, match="ReplayMiss"):
        run_ingest(PACK, locator=locator)


def test_persist_round_trip(result):
    db = SessionLocal()
    try:
        persist(result, db)
        loaded = TenderRepository(db).load_tender("TENDER-2026-402")
    finally:
        db.close()
    assert loaded.model_dump() == result.tender.model_dump()


class _StoredLocator:
    """Serves the answer key as if every response came from the replay store."""

    def __init__(self, expected: dict):
        self.inner = AnswerKeyLocator(expected)

    def locate(self, doc):
        return dataclasses.replace(self.inner.locate(doc), from_store=True)


def test_stats_record_answer_key_mode(result):
    assert result.stats["ingest_mode"] == "answer_key"


def test_stats_record_replay_mode(expected):
    assert run_ingest(PACK, locator=_StoredLocator(expected)).stats["ingest_mode"] == "replay"


def test_stage_log_has_seven_ordered_entries(result):
    log = result.stats["stage_log"]
    assert [entry["stage"] for entry in log] == [s for s, _ in STAGES]
    assert [entry["pct"] for entry in log] == [p for _, p in STAGES]
    times = [entry["t_ms"] for entry in log]
    assert all(isinstance(t, int) for t in times)
    assert times == sorted(times)


def test_synthetic_flag_from_manifest(result):
    assert result.stats["synthetic"] is True


def test_persist_stores_meta(result):
    db = SessionLocal()
    try:
        persist(result, db)
        meta = TenderRepository(db).get_meta("TENDER-2026-402")
    finally:
        db.close()
    assert meta.ingest_mode == "answer_key"
    assert meta.synthetic is True
    assert "stage_log" not in meta.ingest_stats
    assert meta.ingest_stats["ingest_mode"] == "answer_key"
    assert [entry["stage"] for entry in meta.stage_log] == [s for s, _ in STAGES]


def _override(repo, result, param_id="PARAM-01", vendor_id="vendor-b", note="Quoted retrofit", hashed=True):
    cell = next(p.vendors[vendor_id] for p in result.tender.parameters if p.id == param_id)
    repo.put_override(result.tender.id, param_id, vendor_id, Decimal("12000.00"), note,
                      evidence_hash(cell) if hashed else None)


def test_persist_keeps_an_override_whose_cell_is_unchanged(result):
    db = SessionLocal()
    try:
        repo = TenderRepository(db)
        persist(result, db)
        _override(repo, result)
        cleared = persist(result, db)
        remaining = repo.get_overrides("TENDER-2026-402")
    finally:
        db.close()
    assert cleared == []
    assert list(remaining) == [("PARAM-01", "vendor-b")]
    assert remaining[("PARAM-01", "vendor-b")].adder_eur == Decimal("12000.00")


def test_persist_clears_an_override_whose_cell_changed(result):
    db = SessionLocal()
    try:
        repo = TenderRepository(db)
        persist(result, db)
        _override(repo, result)
        changed = result.model_copy(deep=True) if hasattr(result, "model_copy") else copy.deepcopy(result)
        cell = next(p.vendors["vendor-b"] for p in changed.tender.parameters if p.id == "PARAM-01")
        cell.extracted_text += " (revised)"
        cleared = persist(changed, db)
        remaining = repo.get_overrides("TENDER-2026-402")
        persist(result, db)  # leave the shared test database as it was
    finally:
        db.close()
    assert cleared == [{"param_id": "PARAM-01", "vendor_id": "vendor-b", "adder_eur": "12000.00", "note": "Quoted retrofit"}]
    assert remaining == {}


def test_persist_clears_an_override_without_a_recorded_hash(result):
    db = SessionLocal()
    try:
        repo = TenderRepository(db)
        persist(result, db)
        _override(repo, result, hashed=False)  # entered before the hash existed: it cannot be shown to apply
        cleared = persist(result, db)
        remaining = repo.get_overrides("TENDER-2026-402")
    finally:
        db.close()
    assert [(o["param_id"], o["vendor_id"]) for o in cleared] == [("PARAM-01", "vendor-b")]
    assert remaining == {}


def test_persist_clears_an_override_whose_cell_is_gone(result):
    db = SessionLocal()
    try:
        repo = TenderRepository(db)
        persist(result, db)
        _override(repo, result)
        smaller = copy.deepcopy(result)
        next(p for p in smaller.tender.parameters if p.id == "PARAM-01").vendors.pop("vendor-b")
        cleared = persist(smaller, db)
        persist(result, db)
    finally:
        db.close()
    assert [(o["param_id"], o["vendor_id"]) for o in cleared] == [("PARAM-01", "vendor-b")]


def test_tender_dir_for():
    assert tender_dir_for("TENDER-2026-402") == PACK
    for bad in ("../x", "TENDER-NOPE"):
        with pytest.raises(UnknownTender):
            tender_dir_for(bad)
