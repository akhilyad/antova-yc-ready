"""Named review tokens: the server decides who a request is from, and stamps that on what they do."""

import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from specclaw_api import app
from specclaw_auth import REVIEW_HEADER, ReviewerConfigError, _configured
from specclaw_db import SessionLocal, TenderRepository
from specclaw_ingest.pipeline import persist, run_ingest
from specclaw_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected

TENDER_ID = "TENDER-2026-402"
REVIEW = f"/api/review/tenders/{TENDER_ID}"
SHARED = "test-review-token"  # set in conftest.py
ADA, GRACE = "ada-secret-token", "grace-secret-token"
REVIEWERS = {"ada": {"name": "Ada Lovelace", "token": ADA}, "grace": {"name": "Grace Hopper", "token": GRACE}}


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
def fresh(ingested):
    """The sample tender saved afresh, with no reviews or overrides from other tests, and left clean."""
    _reset(ingested)
    yield
    _reset(ingested)


@pytest.fixture
def named(monkeypatch):
    monkeypatch.setenv("ANTOVA_REVIEWERS", json.dumps(REVIEWERS))


def _as(token):
    return TestClient(app, headers={REVIEW_HEADER: token})


def _db(fn):
    db = SessionLocal()
    try:
        return fn(TenderRepository(db), db)
    finally:
        db.close()


def _resolve_warranty(client, **review_extra):
    approved = client.put(f"{REVIEW}/reviews/PARAM-06/vendor-b", json={
        "action": "approve", "note": "warranty start date checked against the bid", **review_extra})
    assert approved.status_code == 200, approved.text
    priced = client.put(f"{REVIEW}/overrides/PARAM-06/vendor-b", json={"adder_eur": "9300.00", "note": "founder price"})
    assert priced.status_code == 204
    return approved.json()


# --- who a token belongs to --------------------------------------------------------------------

def test_the_shared_token_is_the_founder(fresh):
    review = _resolve_warranty(_as(SHARED))
    assert review["reviewer"] == "founder"


def test_each_named_token_is_its_own_reviewer(fresh, named):
    assert _resolve_warranty(_as(ADA))["reviewer"] == "ada"
    other = _as(GRACE).put(f"{REVIEW}/reviews/PARAM-06/vendor-b", json={"action": "reject", "note": "second look"})
    assert other.json()["reviewer"] == "grace"
    assert _as(SHARED).get(f"{REVIEW}/reviews").status_code == 200  # the shared token still works beside them


def test_an_unknown_token_is_refused_even_with_named_reviewers_configured(named):
    assert _as("nobody-secret").get("/api/review/tenders").status_code == 401
    assert _as("").get("/api/review/tenders").status_code == 401


def test_named_tokens_alone_are_enough(fresh, named, monkeypatch):
    monkeypatch.delenv("ANTOVA_REVIEW_TOKEN")
    assert _as(ADA).get("/api/review/tenders").status_code == 200
    assert _as(SHARED).get("/api/review/tenders").status_code == 401


# --- the client cannot choose who it is --------------------------------------------------------

def test_a_reviewer_name_in_the_body_is_ignored(fresh, named):
    review = _resolve_warranty(_as(ADA), reviewer="grace")  # Ada's token, signed as Grace
    assert review["reviewer"] == "ada"
    rows = _db(lambda repo, db: repo.list_reviews(TENDER_ID))
    assert [r["reviewer"] for r in rows] == ["ada"]


def test_the_body_needs_no_reviewer_name(fresh):
    response = _as(SHARED).put(f"{REVIEW}/reviews/PARAM-06/vendor-b", json={"action": "approve", "note": "ok"})
    assert response.status_code == 200


# --- what gets stamped -------------------------------------------------------------------------

def test_override_and_verify_record_the_reviewer(fresh, named):
    client = _as(ADA)
    _resolve_warranty(client)
    assert _db(lambda repo, db: db.execute(text("SELECT set_by FROM adder_overrides")).scalar()) == "ada"
    verified = _as(GRACE).post(f"{REVIEW}/verify")
    assert verified.status_code == 200, verified.text
    assert _db(lambda repo, db: repo.get_meta(TENDER_ID).verified_by) == "grace"
    assert client.post(f"{REVIEW}/withdraw").status_code == 200
    assert _db(lambda repo, db: repo.get_meta(TENDER_ID).verified_by) is None


def test_a_reingest_clears_who_verified(fresh, ingested):
    _resolve_warranty(_as(SHARED))
    assert _as(SHARED).post(f"{REVIEW}/verify").status_code == 200
    db = SessionLocal()
    try:
        persist(ingested, db)
        assert TenderRepository(db).get_meta(TENDER_ID).verified_by is None
    finally:
        db.close()


# --- configuration that cannot be trusted fails closed -----------------------------------------

@pytest.mark.parametrize("value", [
    "not json",
    "[]",
    json.dumps({"ada": {"name": "Ada"}}),  # no token
    json.dumps({"ada": {"token": ""}}),
    json.dumps({"ada": {"token": ADA}, "grace": {"token": ADA}}),  # two reviewers, one token
    json.dumps({"ada": {"token": SHARED}}),  # collides with the shared token
])
def test_a_broken_reviewer_config_leaves_review_closed(monkeypatch, value):
    monkeypatch.setenv("ANTOVA_REVIEWERS", value)
    with pytest.raises(ReviewerConfigError):
        _configured()
    response = _as(SHARED).get("/api/review/tenders")
    assert response.status_code == 503
    assert response.json() == {"detail": "Review is not configured on this server"}


def test_a_reviewer_without_a_name_is_named_by_id(monkeypatch):
    monkeypatch.setenv("ANTOVA_REVIEWERS", json.dumps({"ada": {"token": ADA}}))
    assert [p.name for _, p in _configured() if p.id == "ada"] == ["ada"]
