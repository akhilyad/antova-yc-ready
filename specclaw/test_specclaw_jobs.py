"""Ingest jobs are stored in the database: they survive a restart, restarts fail what was in flight,
and a tender never has two jobs queued at once."""

import asyncio
import time

import pytest
from fastapi.testclient import TestClient

from specclaw_api import app
from specclaw_auth import REVIEW_HEADER
from specclaw_db import SessionLocal, TenderRepository
from specclaw_ingest.tests.fakes import AnswerKeyLocator, load_expected
from specclaw_workers import INTERRUPTED, JobQueueManager, job_manager

TENDER_ID = "TENDER-2026-402"
HEADERS = {REVIEW_HEADER: "test-review-token"}  # token set in conftest.py


def _repo_call(fn):
    db = SessionLocal()
    try:
        return fn(TenderRepository(db))
    finally:
        db.close()


def _wait(client, job_id, timeout=60.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status = client.get(f"/api/jobs/{job_id}", headers=HEADERS).json()
        if status["status"] in ("COMPLETED", "FAILED"):
            return status
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not finish")


def test_a_finished_job_is_readable_by_a_new_manager(monkeypatch):
    monkeypatch.setattr(job_manager, "locator_factory", lambda d, m: AnswerKeyLocator(load_expected()))
    with TestClient(app, headers=HEADERS) as client:
        job_id = client.post("/api/jobs/ingest", json={"tender_id": TENDER_ID, "mode": "replay"}).json()["job_id"]
        done = _wait(client, job_id)
    assert done["status"] == "COMPLETED", done
    # A manager that never saw the job (a restarted process) reads the same answer from the database.
    again = JobQueueManager().get_job_status(job_id)
    assert again.status.value == "COMPLETED"
    assert again.progress_pct == 100
    assert again.result["deviations_found"] == done["result"]["deviations_found"]
    assert again.completed_at is not None


def test_start_fails_jobs_that_were_in_flight():
    _repo_call(lambda r: r.create_job("job-pending1", TENDER_ID, "replay"))
    _repo_call(lambda r: r.create_job("job-running1", TENDER_ID, "replay"))
    _repo_call(lambda r: r.update_job("job-running1", status="PROCESSING", progress_pct=40, stage="Locate"))
    _repo_call(lambda r: r.create_job("job-done0001", TENDER_ID, "replay"))
    _repo_call(lambda r: r.update_job("job-done0001", status="COMPLETED", progress_pct=100, finished=True))

    async def boot():
        manager = JobQueueManager()
        manager.start()
        await manager.stop()

    asyncio.run(boot())

    manager = JobQueueManager()
    for job_id in ("job-pending1", "job-running1"):
        status = manager.get_job_status(job_id)
        assert status.status.value == "FAILED"
        assert status.error == INTERRUPTED
        assert status.completed_at is not None
    assert manager.get_job_status("job-running1").progress_pct == 40  # how far it got is kept
    assert manager.get_job_status("job-done0001").status.value == "COMPLETED"


def test_a_tender_with_a_job_in_flight_gets_that_job_back():
    manager = JobQueueManager()  # no worker running: the first job stays queued
    first = manager.enqueue_ingest_job(TENDER_ID, "replay")
    assert manager.enqueue_ingest_job(TENDER_ID, "auto") == first
    assert manager.get_job_status(first).status.value == "PENDING"


def test_enqueue_after_the_job_finished_makes_a_new_job(monkeypatch):
    monkeypatch.setattr(job_manager, "locator_factory", lambda d, m: AnswerKeyLocator(load_expected()))
    with TestClient(app, headers=HEADERS) as client:
        first = client.post("/api/jobs/ingest", json={"tender_id": TENDER_ID, "mode": "replay"}).json()["job_id"]
        assert _wait(client, first)["status"] == "COMPLETED"
        second = client.post("/api/jobs/ingest", json={"tender_id": TENDER_ID, "mode": "replay"}).json()["job_id"]
        assert second != first
        assert _wait(client, second)["status"] == "COMPLETED"


def test_unknown_job_is_none():
    assert JobQueueManager().get_job_status("job-nope0000") is None


def test_unknown_tender_creates_no_job():
    from specclaw_ingest.pipeline import UnknownTender

    with pytest.raises(UnknownTender):
        JobQueueManager().enqueue_ingest_job("TENDER-NOPE", "replay")
