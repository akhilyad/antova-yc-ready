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
from specclaw_ingest.pipeline import persist, run_ingest
from specclaw_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected
from specclaw_telemetry import telemetry_manager
from specclaw_workers import job_manager

TENDER_ID = "TENDER-2026-402"
NOT_INGESTED = "Tender not ingested yet — POST /api/jobs/ingest"
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
    # 64,800 of hidden adders: 50 kA, Cu busbar, IP54, SCADA, FAT, EXW
    assert voltswitch["total_adders"] == 64800.0
    assert voltswitch["true_evaluated_price"] == 482800.0
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
    assert vb_r2["total_adders"] == 30900.0
    r3 = engine.evaluate_vendor_financials(
        tender, sensitivity, ["PARAM-01", "PARAM-02", "PARAM-03", "PARAM-05", "PARAM-06"], "vendor-b")
    vb_r3 = next(r for r in r3 if r["vendor_id"] == "vendor-b")
    assert vb_r3["clawed_back_amount"] == 57400.0
    fee = round(vb_r3["clawed_back_amount"] * 0.15, 2)
    assert fee == 8610.0
    assert round(vb_r3["clawed_back_amount"] - fee, 2) == 48790.0


def test_fastapi_evaluate_api(client):
    response = client.post("/api/evaluate", json={
        "tender_id": TENDER_ID, "copper_multiplier": 1.2, "site_labor_rate": 75.0, "conceded_params": ["PARAM-01"],
        "vendor_id": "vendor-b",  # A2: by default concessions apply to the lowest true price (Nordwerk)
    })
    assert response.status_code == 200
    data = response.json()
    assert "financials" in data and "summary" in data
    assert data["tender_id"] == TENDER_ID
    assert data["summary"]["clawback_value_eur"] == 18500.0


def test_get_tender_returns_ingested_package(client):
    response = client.get("/api/tender", params={"tender_id": TENDER_ID})
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == TENDER_ID
    assert len(data["parameters"]) == 8


def test_pdf_export_api(client):
    response = client.post("/api/export-pdf", params={"tender_id": TENDER_ID}, json={
        "negotiation_round": 3,
        "conceded_params": ["PARAM-01", "PARAM-02", "PARAM-03", "PARAM-05", "PARAM-06"],
    })
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    assert len(response.content) > 2000


def test_static_and_root_endpoints(client):
    res_root = client.get("/")
    assert res_root.status_code == 200
    assert "SpecClaw" in res_root.text
    res_bundle = client.get("/specclaw_ui_bundle.js")
    assert res_bundle.status_code == 200
    assert "application/javascript" in res_bundle.headers["content-type"]
    assert "SpecClawApp" in res_bundle.text


def test_caching_layer_and_invalidation(client):
    body = {"tender_id": TENDER_ID, "copper_multiplier": 1.15, "site_labor_rate": 65.0, "conceded_params": ["PARAM-01"]}
    first = client.post("/api/evaluate", json=body)
    assert first.status_code == 200
    assert first.json()["cached"] is False
    second = client.post("/api/evaluate", json=body)
    assert second.json()["cached"] is True
    stats = client.get("/api/cache/stats").json()
    assert stats["hits"] > 0
    assert client.post("/api/cache/invalidate").status_code == 200


def test_database_audit_ledger_and_negotiation(client):
    turn = client.post("/api/negotiate/turn", params={"round_num": 2, "tender_id": TENDER_ID, "vendor_id": "vendor-b"})
    assert turn.status_code == 200
    data = turn.json()
    assert data["round"] == 2
    assert (data["vendor_id"], data["clawed_amount"]) == ("vendor-b", 33900.0)
    # Amendment A2: with no vendor named, the turn is with the lowest true evaluated price.
    default = client.post("/api/negotiate/turn", params={"round_num": 2, "tender_id": TENDER_ID}).json()
    assert (default["vendor_id"], default["clawed_amount"]) == ("vendor-a", 0.0)
    assert "audit_id" in data
    trail = client.get("/api/audit-trail", params={"tender_id": TENDER_ID})
    assert trail.status_code == 200
    assert len(trail.json()) > 0


def test_background_queue_workers(ingested, monkeypatch):
    monkeypatch.setattr(job_manager, "locator_factory", lambda d, m: AnswerKeyLocator(load_expected()))
    with TestClient(app, headers=REVIEW_HEADERS) as client:
        response = client.post("/api/jobs/ingest", json={"tender_id": TENDER_ID, "mode": "replay"})
        assert response.status_code == 200
        status = _wait_for_job(client, response.json()["job_id"])
    assert status["status"] == "COMPLETED", status
    assert status["progress_pct"] == 100
    assert status["result"]["deviations_found"] == 10
    assert status["result"]["exposed_risk_eur"] == 64800.0
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
    response = client.get("/api/tender", params={"tender_id": "TENDER-NOPE"})
    assert response.status_code == 404
    assert response.json()["detail"] == NOT_INGESTED
    response = client.post("/api/evaluate", json={"tender_id": "TENDER-NOPE"})
    assert response.status_code == 404
    assert response.json()["detail"] == NOT_INGESTED


def test_bad_tender_id(client):
    assert client.post("/api/jobs/ingest", json={"tender_id": "../secrets"}).status_code == 422
    assert client.post("/api/jobs/ingest", json={"tender_id": "TENDER-NOPE"}).status_code == 404


def test_reingest_invalidates_cache(client, ingested):
    body = {"tender_id": TENDER_ID, "copper_multiplier": 1.33, "conceded_params": []}
    assert client.post("/api/evaluate", json=body).json()["cached"] is False
    assert client.post("/api/evaluate", json=body).json()["cached"] is True
    db = SessionLocal()
    try:
        persist(ingested, db)
    finally:
        db.close()
    assert client.post("/api/evaluate", json=body).json()["cached"] is False


def test_websocket_telemetry_hub(client):
    with client.websocket_connect("/ws/telemetry") as ws:
        assert ws.receive_json()["event_type"] == "CONNECTION_ESTABLISHED"
        ws.send_text('{"type": "ping"}')
        assert ws.receive_json()["event_type"] == "PONG"


# --- the public telemetry socket carries no tender data -----------------------------------------

@pytest.fixture
def broadcasts(monkeypatch):
    """Record every telemetry broadcast instead of sending it."""
    sent = []

    async def record(event_type, payload):
        sent.append((event_type, payload))
        return 0

    monkeypatch.setattr(telemetry_manager, "broadcast", record)
    return sent


def _payloads(sent, event_type):
    return [payload for kind, payload in sent if kind == event_type]


def test_leveling_broadcast_has_no_tender_data(client, broadcasts):
    body = {"tender_id": TENDER_ID, "copper_multiplier": 1.77, "conceded_params": []}
    assert client.post("/api/evaluate", json=body).status_code == 200
    [payload] = _payloads(broadcasts, "LEVELING_EVALUATED")
    assert "tender_id" not in payload
    assert set(payload) == {"evaluation_ms"}


def test_negotiation_broadcast_has_no_tender_data(client, broadcasts):
    assert client.post("/api/negotiate/turn", params={"round_num": 3, "tender_id": TENDER_ID}).status_code == 200
    [payload] = _payloads(broadcasts, "NEGOTIATION_ROUND_ADVANCED")
    assert "tender_id" not in payload
    assert payload == {"round": 3, "conceded_count": 5}


def test_job_completed_broadcast_has_no_tender_data(ingested, monkeypatch, broadcasts):
    monkeypatch.setattr(job_manager, "locator_factory", lambda d, m: AnswerKeyLocator(load_expected()))
    with TestClient(app, headers=REVIEW_HEADERS) as client:
        job_id = client.post("/api/jobs/ingest", json={"tender_id": TENDER_ID, "mode": "replay"}).json()["job_id"]
        assert _wait_for_job(client, job_id)["status"] == "COMPLETED"
        deadline = time.monotonic() + 5.0
        while not _payloads(broadcasts, "JOB_COMPLETED") and time.monotonic() < deadline:
            time.sleep(0.01)
    [payload] = _payloads(broadcasts, "JOB_COMPLETED")
    assert "tender_id" not in payload
    assert payload == {"job_id": job_id, "status": "COMPLETED"}


def test_job_failed_broadcast_has_no_error_text(ingested, monkeypatch, broadcasts):
    """Final review F1: job.error can carry folder IDs, bid filenames and paths; it stays behind the token."""
    monkeypatch.setattr(job_manager, "locator_factory", lambda d, m: _FailingLocator())
    with TestClient(app, headers=REVIEW_HEADERS) as client:
        job_id = client.post("/api/jobs/ingest", json={"tender_id": TENDER_ID, "mode": "replay"}).json()["job_id"]
        status = _wait_for_job(client, job_id)
        deadline = time.monotonic() + 5.0
        while not _payloads(broadcasts, "JOB_FAILED") and time.monotonic() < deadline:
            time.sleep(0.01)
    assert status["status"] == "FAILED"
    assert "missing-key" in status["error"]
    [payload] = _payloads(broadcasts, "JOB_FAILED")
    assert payload == {"job_id": job_id, "status": "FAILED"}
