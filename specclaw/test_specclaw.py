"""
Automated Unit & Physics Test Suite for SpecClaw Deterministic Engine
Following TDD, Pint unit verification, and financial leveling audit standards.

The API serves tenders produced by the ingest pipeline; these tests ingest the
sample tender with the answer-key locator (offline) before exercising it.
"""

import time

import pint
import pytest
from fastapi.testclient import TestClient

import specclaw_engine as engine
from specclaw_api import app
from specclaw_auth import REVIEW_HEADER
from specclaw_db import SessionLocal, TenderRepository
from specclaw_ingest.extract import ReplayMiss
from specclaw_ingest.pipeline import run_ingest
from specclaw_service import persist
from specclaw_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected
from specclaw_workers import job_manager

TENDER_ID = "TENDER-2026-402"

REVIEW_HEADERS = {REVIEW_HEADER: "test-review-token"}  # token set in conftest.py


@pytest.fixture(scope="module")
def ingested():
    result = run_ingest(PACK, locator=AnswerKeyLocator(load_expected()))
    db = SessionLocal()
    try:
        persist(result, db)
    finally:
        db.close()
    return result


@pytest.fixture
def client(ingested):
    return TestClient(app, headers=REVIEW_HEADERS)


@pytest.fixture
def tender(ingested):
    db = SessionLocal()
    try:
        return TenderRepository(db).load_tender(TENDER_ID)
    finally:
        db.close()


def _wait_for_job(client, job_id, timeout=30.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status = client.get(f"/api/jobs/{job_id}").json()
        if status["status"] in ("COMPLETED", "FAILED"):
            return status
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not finish")


def test_pint_physical_normalization():
    """Verify SI unit equivalence across prefixes (e.g. kA vs A)."""
    ureg = pint.UnitRegistry()
    assert ureg("50.0 kA") == ureg("50000 A")
    assert ureg("31.5 kA") < ureg("50.0 kA")


def test_financial_leveling_initial_baseline(tender):
    """Headline vs true risk-adjusted cost, from the ingested documents."""
    results = {r["vendor_id"]: r for r in engine.evaluate_vendor_financials(
        tender, engine.SensitivitySettings(copper_multiplier=1.0, site_labor_rate=60.0), [])}
    voltswitch, nordwerk = results["vendor-b"], results["vendor-a"]
    assert voltswitch["headline_price"] == 418000.0
    assert nordwerk["headline_price"] == 452000.0
    # 61,650 of priced hidden adders: 50 kA, Cu busbar, IP54, SCADA, FAT, EXW. Rate table v2 flags the
    # warranty measured from dispatch and leaves it unpriced, so this is a lower bound, not a final price.
    assert voltswitch["total_adders"] == 61650.0
    assert voltswitch["true_evaluated_price"] == 479650.0
    assert voltswitch["price_status"] == "UNPRICED_ITEMS"
    assert nordwerk["total_adders"] == 0.0
    assert nordwerk["true_evaluated_price"] == 452000.0
    assert voltswitch["true_evaluated_price"] > nordwerk["true_evaluated_price"]


def test_multi_round_clawback_concessions(tender):
    """Clawback progression and 15% performance fee."""
    sensitivity = engine.SensitivitySettings(copper_multiplier=1.0, site_labor_rate=60.0)
    # Amendment A2: concessions are closed with a named vendor here (VoltSwitch); by default they
    # would apply to the lowest true evaluated price, Nordwerk, which has nothing to close.
    r2 = engine.evaluate_vendor_financials(tender, sensitivity, ["PARAM-01", "PARAM-03", "PARAM-05"], "vendor-b")
    vb_r2 = next(r for r in r2 if r["vendor_id"] == "vendor-b")
    assert vb_r2["clawed_back_amount"] == 33900.0
    assert vb_r2["total_adders"] == 27750.0
    r3 = engine.evaluate_vendor_financials(
        tender, sensitivity, ["PARAM-01", "PARAM-02", "PARAM-03", "PARAM-05", "PARAM-06"], "vendor-b")
    vb_r3 = next(r for r in r3 if r["vendor_id"] == "vendor-b")
    # PARAM-06 recovers its priced EXW-to-DDP class (6,150); the unpriced warranty shortfall adds nothing.
    assert vb_r3["clawed_back_amount"] == 54250.0
    fee = round(vb_r3["clawed_back_amount"] * 0.15, 2)
    assert fee == 8137.5
    assert round(vb_r3["clawed_back_amount"] - fee, 2) == 46112.5














def test_background_queue_workers(ingested, monkeypatch):
    monkeypatch.setattr(job_manager, "locator_factory", lambda d, m: AnswerKeyLocator(load_expected()))
    with TestClient(app, headers=REVIEW_HEADERS) as client:
        response = client.post("/api/jobs/ingest", json={"tender_id": TENDER_ID, "mode": "replay"})
        assert response.status_code == 200
        status = _wait_for_job(client, response.json()["job_id"])
    assert status["status"] == "COMPLETED", status
    assert status["progress_pct"] == 100
    assert status["result"]["deviations_found"] == 10
    assert status["result"]["exposed_risk_eur"] == 61650.0  # a lower bound: the dispatch warranty is unpriced
    assert status["result"]["pages_parsed"] == 116
    assert status["result"]["overrides_cleared"] == []


def test_ingest_accepts_legacy_ui_body(client):
    response = client.post("/api/jobs/ingest", json={
        "tender_id": TENDER_ID, "document_count": 4, "ocr_mode": "vector_hybrid",
    })
    assert response.status_code == 200
    assert response.json()["status"] == "QUEUED"


class _FailingLocator:
    def locate(self, doc):
        raise ReplayMiss(doc.entry.file, "missing-key")


def test_job_failure_reports_error(ingested, monkeypatch):
    monkeypatch.setattr(job_manager, "locator_factory", lambda d, m: _FailingLocator())
    with TestClient(app, headers=REVIEW_HEADERS) as client:
        response = client.post("/api/jobs/ingest", json={"tender_id": TENDER_ID, "mode": "replay"})
        status = _wait_for_job(client, response.json()["job_id"])
    assert status["status"] == "FAILED"
    assert status["error"].startswith("IngestFailed")
    assert "missing-key" in status["error"]


def test_job_rejects_folder_with_mismatched_manifest(ingested, monkeypatch, tmp_path):
    """Final review I4: ingesting TENDER-2026-403 must not silently replace TENDER-2026-402."""
    import shutil

    folder = tmp_path / "TENDER-2026-403"
    shutil.copytree(PACK, folder, ignore=shutil.ignore_patterns("runs", "claude_responses"))
    monkeypatch.setenv("SPECCLAW_TENDERS_DIR", str(tmp_path))
    monkeypatch.setattr(job_manager, "locator_factory", lambda d, m: AnswerKeyLocator(load_expected()))
    with TestClient(app, headers=REVIEW_HEADERS) as client:
        response = client.post("/api/jobs/ingest", json={"tender_id": "TENDER-2026-403", "mode": "replay"})
        status = _wait_for_job(client, response.json()["job_id"])
    assert status["status"] == "FAILED"
    assert "TENDER-2026-402" in status["error"]


def test_unknown_tender_404(client):
    response = client.get("/api/review/tenders/TENDER-NOPE")
    assert response.status_code == 404


def test_bad_tender_id(client):
    assert client.post("/api/jobs/ingest", json={"tender_id": "../secrets"}).status_code == 422
    assert client.post("/api/jobs/ingest", json={"tender_id": "TENDER-NOPE"}).status_code == 404






# --- the public telemetry socket carries no tender data -----------------------------------------



def _payloads(sent, event_type):
    return [payload for kind, payload in sent if kind == event_type]








