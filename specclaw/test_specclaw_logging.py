"""The service logs what it did and who did it, and never the free text a reviewer typed."""

import logging

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

import specclaw_api
from specclaw_api import app
from specclaw_auth import REVIEW_HEADER
from specclaw_db import SessionLocal
from specclaw_ingest.extract import ReplayMiss
from specclaw_ingest.pipeline import run_ingest
from specclaw_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected
from specclaw_service import persist
from specclaw_workers import job_manager

TENDER_ID = "TENDER-2026-402"
REVIEW = f"/api/review/tenders/{TENDER_ID}"
HEADERS = {REVIEW_HEADER: "test-review-token"}  # token set in conftest.py
SECRET_NOTE = "unique-note-text-that-must-not-be-logged"


@pytest.fixture
def draft():
    result = run_ingest(PACK, locator=AnswerKeyLocator(load_expected()))
    db = SessionLocal()
    try:
        persist(result, db)
        for table in ("cell_reviews", "adder_overrides"):
            db.execute(text(f"DELETE FROM {table} WHERE tender_id = :id"), {"id": TENDER_ID})
        db.commit()
    finally:
        db.close()
    yield
    db = SessionLocal()
    try:
        persist(result, db)
        for table in ("cell_reviews", "adder_overrides"):
            db.execute(text(f"DELETE FROM {table} WHERE tender_id = :id"), {"id": TENDER_ID})
        db.commit()
    finally:
        db.close()


def test_review_actions_are_logged_with_the_reviewer_and_without_the_note(draft, caplog):
    client = TestClient(app, headers=HEADERS)
    with caplog.at_level(logging.INFO, logger="specclaw_review_api"):
        client.put(f"{REVIEW}/reviews/PARAM-06/vendor-b", json={"action": "approve", "note": SECRET_NOTE})
        client.put(f"{REVIEW}/overrides/PARAM-06/vendor-b", json={"adder_eur": "9300.00", "note": SECRET_NOTE})
        client.delete(f"{REVIEW}/overrides/PARAM-06/vendor-b")
        client.put(f"{REVIEW}/overrides/PARAM-06/vendor-b", json={"adder_eur": "9300.00", "note": SECRET_NOTE})
        assert client.post(f"{REVIEW}/verify").status_code == 200
        client.post(f"{REVIEW}/withdraw")
    lines = [r.getMessage() for r in caplog.records]
    for fragment in ("review recorded", "override set", "override deleted", "brief verified", "brief withdrawn"):
        assert any(fragment in line and "by=founder" in line and TENDER_ID in line for line in lines), fragment
    assert not any(SECRET_NOTE in line for line in lines)


def test_a_failed_ingest_is_a_warning_with_the_reason(draft, monkeypatch, caplog):
    class Missing:
        def locate(self, doc):
            raise ReplayMiss(doc.entry.file, "missing-key")

    monkeypatch.setattr(job_manager, "locator_factory", lambda d, m: Missing())
    import time

    with caplog.at_level(logging.INFO, logger="specclaw_workers"):
        with TestClient(app, headers=HEADERS) as client:
            job = client.post("/api/jobs/ingest", json={"tender_id": TENDER_ID, "mode": "replay"}).json()["job_id"]
            deadline = time.monotonic() + 30
            while client.get(f"/api/jobs/{job}").json()["status"] not in ("COMPLETED", "FAILED"):
                assert time.monotonic() < deadline
                time.sleep(0.05)
    records = [r for r in caplog.records if job in r.getMessage()]
    assert any("started" in r.getMessage() for r in records)
    failed = next(r for r in records if "failed" in r.getMessage())
    assert failed.levelno == logging.WARNING and "missing-key" in failed.getMessage()
    assert not any(r.exc_info for r in records)  # an outcome about the documents, not a crash


def test_an_unexpected_crash_is_logged_with_its_traceback(draft, monkeypatch, caplog):
    def boom(d, m):
        raise RuntimeError("worker bug")

    monkeypatch.setattr(job_manager, "locator_factory", boom)
    import time

    with caplog.at_level(logging.INFO, logger="specclaw_workers"):
        with TestClient(app, headers=HEADERS) as client:
            job = client.post("/api/jobs/ingest", json={"tender_id": TENDER_ID, "mode": "replay"}).json()["job_id"]
            deadline = time.monotonic() + 30
            while client.get(f"/api/jobs/{job}").json()["status"] not in ("COMPLETED", "FAILED"):
                assert time.monotonic() < deadline
                time.sleep(0.05)
    crashed = next(r for r in caplog.records if "crashed" in r.getMessage())
    assert crashed.levelno == logging.ERROR and crashed.exc_info is not None


def test_configure_logging_respects_an_existing_setup_and_the_level(monkeypatch):
    root = logging.getLogger()
    saved_handlers, saved_level = list(root.handlers), root.level
    try:
        root.handlers = [logging.NullHandler()]
        specclaw_api.configure_logging()
        assert root.level == saved_level  # a host that configured logging keeps it
        root.handlers = []
        monkeypatch.setenv("SPECCLAW_LOG_LEVEL", "debug")
        specclaw_api.configure_logging()
        assert root.level == logging.DEBUG
        root.handlers = []
        monkeypatch.setenv("SPECCLAW_LOG_LEVEL", "loud")
        specclaw_api.configure_logging()
        assert root.level == logging.INFO  # an unknown level falls back to INFO
    finally:
        root.handlers, root.level = saved_handlers, saved_level
