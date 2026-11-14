"""Public briefs by share ID (verified only) and the founder's review routes.

Each test starts from a fresh save of the sample tender: DRAFT, no overrides.

The sample is evaluated with rate table v2, which flags VoltSwitch's warranty measured from dispatch and leaves
it unpriced. That cell (PARAM-06, vendor-b) is an open item until the founder approves the flag and prices the
gap, so every test that verifies the sample first calls `_resolve_warranty`.
"""

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from specclaw_api import app
from specclaw_auth import REVIEW_HEADER
from specclaw_db import SessionLocal, TenderRepository
from specclaw_ingest.pipeline import run_ingest
from specclaw_service import persist
from specclaw_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected

TENDER_ID = "TENDER-2026-402"
REVIEW_HEADERS = {REVIEW_HEADER: "test-review-token"}  # token set in conftest.py
NOT_FOUND = {"detail": "Not found"}
REVIEW = f"/api/review/tenders/{TENDER_ID}"
EVIDENCE = "evidence/PARAM-01/vendor-b/primary.png"


@pytest.fixture(scope="module")
def ingested():
    return run_ingest(PACK, locator=AnswerKeyLocator(load_expected()))


@pytest.fixture
def share_id(ingested):
    """Save the sample tender afresh and return its share ID."""
    db = SessionLocal()
    try:
        persist(ingested, db)
        # Reviews, and overrides on unchanged cells, outlive a re-ingest by design; clear them so no
        # test inherits another's approvals or prices.
        db.execute(text("DELETE FROM cell_reviews WHERE tender_id = :id"), {"id": TENDER_ID})
        db.execute(text("DELETE FROM adder_overrides WHERE tender_id = :id"), {"id": TENDER_ID})
        db.commit()
        return TenderRepository(db).get_meta(TENDER_ID).share_id
    finally:
        db.close()


@pytest.fixture
def review():
    return TestClient(app, headers=REVIEW_HEADERS)


@pytest.fixture
def public():
    return TestClient(app)


def _seed_unpriced(ingested, param_id="PARAM-03", vendor_id="vendor-c"):
    """Save a copy of the sample tender with one cell unpriced (the sample itself has no open items)."""
    tender = ingested.tender.model_copy(deep=True)
    next(p for p in tender.parameters if p.id == param_id).vendors[vendor_id].pricing_status = "UNPRICED"
    db = SessionLocal()
    try:
        TenderRepository(db).save_tender(tender, ingested.documents, datetime.now(timezone.utc))
    finally:
        db.close()


WARRANTY_OVERRIDE = {"param_id": "PARAM-06", "vendor_id": "vendor-b", "adder_eur": "9300.00",
                     "note": "priced by the founder: freight 6,150 plus 18 months x EUR 175"}
WARRANTY_OPEN_ITEMS = [  # what the unreviewed sample blocks verification with, before any other cell is touched
    {"kind": "review_flag", "vendor_id": "vendor-b", "param_id": "PARAM-06", "message": "Review flag not approved yet"},
    {"kind": "unpriced", "vendor_id": "vendor-b", "param_id": "PARAM-06", "message": "Gap found but not priced"},
]


def _resolve_warranty(review):
    """Approve the WARRANTY_BASIS flag on VoltSwitch's PARAM-06 and price the cell, as the founder does."""
    approved = review.put(f"{REVIEW}/reviews/PARAM-06/vendor-b", json={
        "action": "approve", "reviewer": "a.yadav", "note": "warranty start date checked against the bid"})
    assert approved.status_code == 200
    priced = review.put(f"{REVIEW}/overrides/PARAM-06/vendor-b",
                        json={"adder_eur": WARRANTY_OVERRIDE["adder_eur"], "note": WARRANTY_OVERRIDE["note"]})
    assert priced.status_code == 204


def _vendor(financials, vendor_id):
    return next(f for f in financials if f["vendor_id"] == vendor_id)


def _override(review, param_id, vendor_id, adder_eur, note="checked with the vendor"):
    return review.put(f"{REVIEW}/overrides/{param_id}/{vendor_id}", json={"adder_eur": adder_eur, "note": note})


def _stored_overrides():
    db = SessionLocal()
    try:
        return TenderRepository(db).get_overrides(TENDER_ID)
    finally:
        db.close()


def _assert_public_404(public, share):
    for response in (
        public.get(f"/api/briefs/{share}"),
        public.post(f"/api/briefs/{share}/evaluate", json={}),
        public.get(f"/api/briefs/{share}/{EVIDENCE}"),
    ):
        assert response.status_code == 404
        assert response.json() == NOT_FOUND


# --- public briefs ------------------------------------------------------------------------------

def test_unverified_brief_is_404(public, share_id):
    _assert_public_404(public, share_id)


def test_unknown_brief_is_404_with_same_body(public, share_id):
    _assert_public_404(public, "no-such-share-id-000000000")


def test_verified_brief_payload(public, review, share_id):
    _resolve_warranty(review)
    verified = review.post(f"{REVIEW}/verify")
    assert verified.status_code == 200
    assert verified.json()["share_id"] == share_id
    response = public.get(f"/api/briefs/{share_id}")
    assert response.status_code == 200
    brief = response.json()
    assert brief["status"] == "VERIFIED"
    assert brief["share_id"] == share_id
    assert brief["verified_at"] == verified.json()["verified_at"]
    assert datetime.fromisoformat(brief["verified_at"]).utcoffset().total_seconds() == 0
    assert brief["overrides"] == [WARRANTY_OVERRIDE]
    assert brief["review"] == {"open_flags": 0, "stale": 0, "rejected": 0, "reviewed": 1, "final": True}
    assert {"synthetic", "ingest_mode", "ingest_stats", "stage_log", "tender", "financials"} <= set(brief)
    assert _vendor(brief["financials"], "vendor-b")["true_evaluated_price"] == 482800.0


def test_public_evaluate_reprices(public, review, share_id):
    _resolve_warranty(review)
    review.post(f"{REVIEW}/verify")
    response = public.post(f"/api/briefs/{share_id}/evaluate", json={"copper_multiplier": 2.0})
    assert response.status_code == 200
    assert set(response.json()) == {"financials"}
    assert _vendor(response.json()["financials"], "vendor-b")["true_evaluated_price"] > 482800.0
    defaults = public.post(f"/api/briefs/{share_id}/evaluate", json={}).json()
    assert _vendor(defaults["financials"], "vendor-b")["true_evaluated_price"] == 482800.0
    for bad in ({"copper_multiplier": 2.6}, {"site_labor_rate": 19.0}, {"freight_multiplier": 0.4}):
        assert public.post(f"/api/briefs/{share_id}/evaluate", json=bad).status_code == 422


def test_public_evidence_png(public, review, share_id):
    _resolve_warranty(review)
    review.post(f"{REVIEW}/verify")
    for path in (EVIDENCE, "evidence/PARAM-01/vendor-b/secondary.png", "evidence/PARAM-01/mr/primary.png"):
        response = public.get(f"/api/briefs/{share_id}/{path}")
        assert response.status_code == 200, path
        assert response.headers["content-type"] == "image/png"
        assert response.headers["cache-control"] == "public, max-age=300"
        assert response.content.startswith(b"\x89PNG")
    for missing in ("evidence/PARAM-02/vendor-b/secondary.png", "evidence/PARAM-01/mr/secondary.png",
                    "evidence/PARAM-99/vendor-b/primary.png", "evidence/PARAM-01/vendor-z/primary.png",
                    "evidence/PARAM-01/vendor-b/tertiary.png"):
        response = public.get(f"/api/briefs/{share_id}/{missing}")
        assert response.status_code == 404, missing
        assert response.json() == NOT_FOUND


# --- founder review -----------------------------------------------------------------------------

def test_review_list_counts_open_items(review, ingested, share_id):
    _seed_unpriced(ingested)
    response = review.get("/api/review/tenders")
    assert response.status_code == 200
    row = next(r for r in response.json() if r["tender_id"] == TENDER_ID)
    assert set(row) == {"tender_id", "title", "status", "share_id", "ingested_at", "verified_at", "open_items"}
    assert (row["status"], row["share_id"], row["verified_at"], row["open_items"]) == ("DRAFT", share_id, None, 3)  # the warranty flag and gap, and the cell seeded unpriced
    assert datetime.fromisoformat(row["ingested_at"]).utcoffset().total_seconds() == 0


def test_review_detail_evaluate_and_evidence_for_draft(review, ingested, share_id):
    _seed_unpriced(ingested)
    detail = review.get(REVIEW)
    assert detail.status_code == 200
    assert detail.json()["status"] == "DRAFT"
    assert detail.json()["share_id"] == share_id
    assert [(i["kind"], i["param_id"], i["vendor_id"]) for i in detail.json()["open_items"]] == [
        ("review_flag", "PARAM-06", "vendor-b"), ("unpriced", "PARAM-06", "vendor-b"), ("unpriced", "PARAM-03", "vendor-c")]
    priced = review.post(f"{REVIEW}/evaluate", json={"copper_multiplier": 2.0})
    assert priced.status_code == 200
    assert _vendor(priced.json()["financials"], "vendor-b")["true_evaluated_price"] > 482800.0
    crop = review.get(f"{REVIEW}/{EVIDENCE}")
    assert crop.status_code == 200
    assert crop.headers["content-type"] == "image/png"
    assert review.get(f"{REVIEW}/evidence/PARAM-02/vendor-b/secondary.png").status_code == 404
    for unknown in ("/api/review/tenders/TENDER-NOPE", "/api/review/tenders/TENDER-NOPE/" + EVIDENCE):
        assert review.get(unknown).status_code == 404
    assert review.post("/api/review/tenders/TENDER-NOPE/evaluate", json={}).status_code == 404


def test_tender_migrated_from_v2_is_served(public, review, share_id):
    """R27: the v2 → v3 migration only adds tender columns, filling ingest_stats with {} and
    stage_log with []; the other tables are unchanged. Such a tender is served in full."""
    db = SessionLocal()
    try:
        db.execute(text("UPDATE tenders SET ingest_stats = '{}', stage_log = '[]' WHERE id = :id"), {"id": TENDER_ID})
        db.commit()
    finally:
        db.close()
    detail = review.get(REVIEW)
    assert detail.status_code == 200
    assert (detail.json()["ingest_stats"], detail.json()["stage_log"]) == ({}, [])
    assert len(detail.json()["tender"]["vendors"]) == 3
    _resolve_warranty(review)
    assert review.post(f"{REVIEW}/verify").status_code == 200
    served = public.get(f"/api/briefs/{share_id}")
    assert served.status_code == 200
    assert served.json()["ingest_stats"] == {}


def test_put_override_validation(review, share_id):
    for bad in ("-1", "-0.01", "1.005", 1.005, "10000000.01", "NaN", "Infinity", "abc"):
        assert _override(review, "PARAM-01", "vendor-b", bad).status_code == 422, bad
    for note in ("", "   ", "x" * 501):
        assert _override(review, "PARAM-01", "vendor-b", "100", note).status_code == 422, note
    assert review.put(f"{REVIEW}/overrides/PARAM-01/vendor-b", json={"adder_eur": "100"}).status_code == 422
    assert _override(review, "PARAM-99", "vendor-b", "100").status_code == 404
    assert _override(review, "PARAM-01", "vendor-z", "100").status_code == 404
    assert review.put("/api/review/tenders/TENDER-NOPE/overrides/PARAM-01/vendor-b",
                      json={"adder_eur": "100", "note": "n"}).status_code == 404
    assert _stored_overrides() == {}

    assert _override(review, "PARAM-01", "vendor-b", "10000000", "x" * 500).status_code == 204
    response = _override(review, "PARAM-01", "vendor-b", "1200.5", "  engineer's estimate  ")
    assert response.status_code == 204
    assert response.content == b""
    stored = _stored_overrides()[("PARAM-01", "vendor-b")]
    assert (stored.adder_eur, str(stored.adder_eur), stored.note) == (Decimal("1200.50"), "1200.50", "engineer's estimate")
    assert _override(review, "PARAM-01", "vendor-a", 0).status_code == 204
    assert str(_stored_overrides()[("PARAM-01", "vendor-a")].adder_eur) == "0.00"


def test_delete_override(review, share_id):
    path = f"{REVIEW}/overrides/PARAM-01/vendor-b"
    assert review.delete(path).status_code == 404
    _override(review, "PARAM-01", "vendor-b", "0")
    response = review.delete(path)
    assert response.status_code == 204
    assert _stored_overrides() == {}
    assert review.delete(path).status_code == 404
    assert review.delete("/api/review/tenders/TENDER-NOPE/overrides/PARAM-01/vendor-b").status_code == 404


def test_override_flows_into_public_brief(public, review, share_id):
    _resolve_warranty(review)
    assert _override(review, "PARAM-01", "vendor-b", "0", "  waived after clarification  ").status_code == 204
    assert review.post(f"{REVIEW}/verify").status_code == 200
    brief = public.get(f"/api/briefs/{share_id}").json()
    assert brief["overrides"] == [{"param_id": "PARAM-01", "vendor_id": "vendor-b", "adder_eur": "0.00",
                                   "note": "waived after clarification"}, WARRANTY_OVERRIDE]
    voltswitch = _vendor(brief["financials"], "vendor-b")
    assert voltswitch["true_evaluated_price"] == 482800.0 - 18500.0
    row = next(r for r in voltswitch["itemized_breakdown"] if r["param_id"] == "PARAM-01")
    assert (row["is_overridden"], row["override_note"], row["adder_eur"]) == (True, "waived after clarification", 0.0)
    repriced = public.post(f"/api/briefs/{share_id}/evaluate", json={"copper_multiplier": 2.0}).json()
    row = next(r for r in _vendor(repriced["financials"], "vendor-b")["itemized_breakdown"] if r["param_id"] == "PARAM-01")
    assert row["adder_eur"] == 0.0  # sliders never scale an override


def test_verify_blocked_by_open_items(public, review, ingested, share_id):
    _seed_unpriced(ingested)
    blocked = review.post(f"{REVIEW}/verify")
    assert blocked.status_code == 409
    assert blocked.json() == {"detail": "Open items remain", "open_items": [
        *WARRANTY_OPEN_ITEMS,
        {"kind": "unpriced", "vendor_id": "vendor-c", "param_id": "PARAM-03", "message": "Gap found but not priced"}]}
    assert public.get(f"/api/briefs/{share_id}").status_code == 404
    assert _override(review, "PARAM-03", "vendor-c", "3000", "engineer's estimate").status_code == 204
    still = review.post(f"{REVIEW}/verify")  # priced, but the warranty flag is not approved and its gap is not priced
    assert (still.status_code, still.json()["open_items"]) == (409, WARRANTY_OPEN_ITEMS)
    _resolve_warranty(review)
    assert review.post(f"{REVIEW}/verify").status_code == 200
    assert public.get(f"/api/briefs/{share_id}").status_code == 200


def test_withdraw_hides_brief(public, review, share_id):
    _resolve_warranty(review)
    review.post(f"{REVIEW}/verify")
    assert public.get(f"/api/briefs/{share_id}").status_code == 200
    response = review.post(f"{REVIEW}/withdraw")
    assert response.status_code == 200
    assert response.json() == {"status": "DRAFT"}
    _assert_public_404(public, share_id)
    assert review.get(REVIEW).json()["verified_at"] is None
    assert review.post("/api/review/tenders/TENDER-NOPE/withdraw").status_code == 404
    assert review.post("/api/review/tenders/TENDER-NOPE/verify").status_code == 404


def test_override_change_on_verified_brief_is_409(public, review, share_id, monkeypatch):
    locked = {"detail": "Withdraw the brief before changing overrides"}
    _resolve_warranty(review)
    path = f"{REVIEW}/overrides/PARAM-01/vendor-b"
    assert _override(review, "PARAM-01", "vendor-b", "0", "waived").status_code == 204
    assert review.post(f"{REVIEW}/verify").status_code == 200
    before_overrides, before_brief = _stored_overrides(), public.get(f"/api/briefs/{share_id}").json()
    for response in (
        _override(review, "PARAM-01", "vendor-b", "5000"),
        _override(review, "PARAM-02", "vendor-b", "5000"),
        _override(review, "PARAM-01", "vendor-b", "-1", ""),   # 409 comes before body validation
        _override(review, "PARAM-99", "vendor-b", "5000"),     # ... and before the cell check
        review.delete(path),
        review.delete(f"{REVIEW}/overrides/PARAM-02/vendor-b"),
    ):
        assert response.status_code == 409
        assert response.json() == locked
    assert review.put("/api/review/tenders/TENDER-NOPE/overrides/PARAM-01/vendor-b",
                      json={"adder_eur": "-1"}).status_code == 404  # unknown tender: 404 first
    assert _stored_overrides() == before_overrides
    assert public.get(f"/api/briefs/{share_id}").json() == before_brief

    assert review.post(f"{REVIEW}/withdraw").status_code == 200
    assert _override(review, "PARAM-01", "vendor-b", "5000").status_code == 204
    assert _stored_overrides()[("PARAM-01", "vendor-b")].adder_eur == Decimal("5000.00")
    assert review.delete(path).status_code == 204




def test_review_routes_need_token(public, share_id):
    routes = [
        ("get", "/api/review/tenders", None),
        ("get", REVIEW, None),
        ("post", f"{REVIEW}/evaluate", {}),
        ("get", f"{REVIEW}/{EVIDENCE}", None),
        ("put", f"{REVIEW}/overrides/PARAM-01/vendor-b", {"adder_eur": "0", "note": "n"}),
        ("delete", f"{REVIEW}/overrides/PARAM-01/vendor-b", None),
        ("post", f"{REVIEW}/verify", None),
        ("post", f"{REVIEW}/withdraw", None),
    ]
    for headers in ({}, {REVIEW_HEADER: "wrong-token"}):
        for method, path, body in routes:
            kwargs = {"headers": headers} if body is None else {"headers": headers, "json": body}
            response = getattr(public, method)(path, **kwargs)
            assert response.status_code == 401, (method, path, headers)
    db = SessionLocal()
    try:
        assert TenderRepository(db).get_meta(TENDER_ID).status == "DRAFT"
    finally:
        db.close()
    assert _stored_overrides() == {}


def test_public_brief_omits_antova_run_cost(public, review, share_id):
    """Final review F3: what the run cost Antova is the founder's, not the brief reader's."""
    _resolve_warranty(review)
    review.post(f"{REVIEW}/verify")
    served = public.get(f"/api/briefs/{share_id}").json()
    assert "api_cost_usd" not in served["ingest_stats"]
    assert "cogs_usd" not in served["ingest_stats"]
    assert "compute_cogs" not in served["tender"]
    founder = review.get(REVIEW).json()
    assert {"api_cost_usd", "cogs_usd"} <= set(founder["ingest_stats"])
    assert "compute_cogs" in founder["tender"]


def test_override_survives_an_unchanged_reingest_but_not_a_changed_one(review, share_id, ingested):
    import copy

    assert _override(review, "PARAM-01", "vendor-b", "5000").status_code == 204
    db = SessionLocal()
    try:
        assert persist(ingested, db) == []  # same evidence: the override stays
        assert _stored_overrides()[("PARAM-01", "vendor-b")].adder_eur == Decimal("5000.00")

        changed = copy.deepcopy(ingested)
        cell = next(p.vendors["vendor-b"] for p in changed.tender.parameters if p.id == "PARAM-01")
        cell.extracted_text += " (revised)"
        cleared = persist(changed, db)
    finally:
        db.close()
    assert [(o["param_id"], o["vendor_id"], o["adder_eur"]) for o in cleared] == [("PARAM-01", "vendor-b", "5000.00")]
    assert ("PARAM-01", "vendor-b") not in _stored_overrides()
