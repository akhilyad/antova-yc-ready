"""Verify is atomic: it publishes the run the reviewer saw, and only if nothing blocks it right now."""


import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from specclaw_api import app
from specclaw_auth import REVIEW_HEADER
from specclaw_db import SessionLocal, TenderRepository
from specclaw_ingest.pipeline import persist, run_ingest
from specclaw_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected

TENDER_ID = "TENDER-2026-402"
REVIEW = f"/api/review/tenders/{TENDER_ID}"
HEADERS = {REVIEW_HEADER: "test-review-token"}  # token set in conftest.py


@pytest.fixture(scope="module")
def ingested():
    return run_ingest(PACK, locator=AnswerKeyLocator(load_expected()))


def _reset(ingested):
    db = SessionLocal()
    try:
        persist(ingested, db)
        for table in ("cell_reviews", "adder_overrides"):
            db.execute(text(f"DELETE FROM {table} WHERE tender_id = :id"), {"id": TENDER_ID})
        db.commit()
    finally:
        db.close()


@pytest.fixture
def client(ingested):
    """A draft whose only blockers are resolved, so verify would succeed. Left clean afterwards."""
    _reset(ingested)
    c = TestClient(app, headers=HEADERS)
    assert c.put(f"{REVIEW}/reviews/PARAM-06/vendor-b", json={"action": "approve", "note": "checked"}).status_code == 200
    assert c.put(f"{REVIEW}/overrides/PARAM-06/vendor-b", json={"adder_eur": "9300.00", "note": "priced"}).status_code == 204
    yield c
    _reset(ingested)


def _meta():
    db = SessionLocal()
    try:
        return TenderRepository(db).get_meta(TENDER_ID)
    finally:
        db.close()


def _run_id(client):
    return client.get(REVIEW).json()["ingest_stats"]["run_id"]


def test_verify_with_the_run_the_reviewer_saw_records_it(client):
    seen = _run_id(client)
    response = client.post(f"{REVIEW}/verify", json={"run_id": seen})
    assert response.status_code == 200, response.text
    meta = _meta()
    assert (meta.status, meta.verified_run_id, meta.verified_by) == ("VERIFIED", seen, "founder")


def test_verify_without_a_body_still_works(client):
    assert client.post(f"{REVIEW}/verify").status_code == 200
    assert _meta().verified_run_id == _run_id(client)  # the run is taken from the server, not the client


def test_verify_refuses_a_run_the_reviewer_did_not_see(client):
    response = client.post(f"{REVIEW}/verify", json={"run_id": "0" * 32})
    assert response.status_code == 409
    assert response.json()["code"] == "run_changed"
    meta = _meta()
    assert (meta.status, meta.verified_by, meta.verified_run_id) == ("DRAFT", None, None)


def test_a_reingest_between_the_read_and_the_write_is_refused(client, ingested, monkeypatch):
    real = TenderRepository.claim_verification

    def reingest_then_claim(self, *args, **kwargs):
        other = SessionLocal()
        try:
            persist(ingested, other)  # a second ingest lands after verify read the tender
        finally:
            other.close()
        return real(self, *args, **kwargs)

    monkeypatch.setattr(TenderRepository, "claim_verification", reingest_then_claim)
    response = client.post(f"{REVIEW}/verify", json={"run_id": _run_id(client)})
    assert response.status_code == 409
    assert response.json()["code"] == "run_changed"
    assert _meta().status == "DRAFT"


def test_a_blocker_that_appears_after_the_first_check_is_caught_and_rolled_back(client, monkeypatch):
    real = TenderRepository.claim_verification

    def delete_override_then_claim(self, *args, **kwargs):
        other = SessionLocal()
        try:
            other.execute(text("DELETE FROM adder_overrides WHERE tender_id = :id"), {"id": TENDER_ID})
            other.commit()  # the warranty gap is unpriced again
        finally:
            other.close()
        return real(self, *args, **kwargs)

    monkeypatch.setattr(TenderRepository, "claim_verification", delete_override_then_claim)
    response = client.post(f"{REVIEW}/verify", json={"run_id": _run_id(client)})
    assert response.status_code == 409
    assert response.json()["detail"] == "Open items remain"
    assert [(i["kind"], i["param_id"]) for i in response.json()["open_items"]] == [("unpriced", "PARAM-06")]
    meta = _meta()
    assert (meta.status, meta.verified_by) == ("DRAFT", None)  # the claim was rolled back


def test_an_unchanged_brief_is_not_blocked_by_the_claim_itself(client):
    """Verify, withdraw, verify again: the second claim sees a tender that is unchanged."""
    assert client.post(f"{REVIEW}/verify", json={"run_id": _run_id(client)}).status_code == 200
    assert client.post(f"{REVIEW}/withdraw").status_code == 200
    assert _meta().verified_run_id is None
    assert client.post(f"{REVIEW}/verify", json={"run_id": _run_id(client)}).status_code == 200


def test_a_malformed_run_id_is_a_validation_error(client):
    assert client.post(f"{REVIEW}/verify", json={"run_id": "x" * 65}).status_code == 422
    assert _meta().status == "DRAFT"
