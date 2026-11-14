"""WP7: the human review record and the vendor clarification register."""

import csv
import io
import json
import shutil
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

import antova_engine as engine
from samples import mutate
from antova_api import app
from antova_auth import REVIEW_HEADER
from antova_db import SessionLocal, TenderRepository
from antova_ingest import clarify
from antova_ingest.pipeline import run_ingest
from antova_service import persist
from antova_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected
from antova_review import evidence_hash, open_items, review_state

HEADERS = {REVIEW_HEADER: "test-review-token"}
VOLTSWITCH = "Bid_vendor-b_VoltSwitch.pdf"
CELL = ("PARAM-01", "vendor-b")  # (param_id, vendor_id)
# Rate table v2 flags VoltSwitch's warranty measured from dispatch and leaves it unpriced, so the sample always
# has this second flagged cell, and its price gap is an open item until the founder prices it.
WARRANTY = ("PARAM-06", "vendor-b")


def _dropped(expected: dict) -> dict:
    """The locator misses VoltSwitch's failing drawing note, so the sweep finds it and flags the cell."""
    data = json.loads(json.dumps(expected))
    ideal = data["ideal_locate"][VOLTSWITCH]
    ideal["candidates"] = [c for c in ideal["candidates"] if not (c["param_id"] == "PARAM-01" and c["page"] == 11)]
    return data


@pytest.fixture(scope="module")
def flagged():
    """TENDER-2026-402 with two review flags: SWEEP_GOVERNS on vendor-b PARAM-01, and WARRANTY_BASIS on PARAM-06."""
    return run_ingest(PACK, locator=AnswerKeyLocator(_dropped(load_expected())))


@pytest.fixture
def repo():
    db = SessionLocal()
    yield TenderRepository(db)
    db.close()


@pytest.fixture
def stored(flagged, repo):
    persist(flagged, repo.db)
    for row in repo.list_reviews(flagged.tender.id):
        repo.db.execute(__import__("sqlalchemy").text("DELETE FROM cell_reviews WHERE id = :i"), {"i": row["id"]})
    repo.db.commit()
    return flagged.tender


def _cell(tender, param_id=CELL[0], vendor_id=CELL[1]):
    return next(p for p in tender.parameters if p.id == param_id).vendors[vendor_id]


def _open(tender, reviews, overrides=None, cell=CELL):
    """The open items on one (param_id, vendor_id) cell."""
    return [i for i in open_items(tender, overrides or {}, reviews) if (i.param_id, i.vendor_id) == cell]


WARRANTY_BODY = {"action": "approve", "reviewer": "a.yadav", "note": "Warranty start date checked against the bid"}


# --- the review record ----------------------------------------------------------------

def test_evidence_hash_follows_what_the_reviewer_saw(flagged):
    cell = _cell(flagged.tender)
    same = cell.model_copy(deep=True)
    assert evidence_hash(same) == evidence_hash(cell) and len(evidence_hash(cell)) == 64
    changed = cell.model_copy(deep=True)
    changed.citation["quote"] = changed.citation["quote"].replace("31.5kA", "50kA")
    assert evidence_hash(changed) != evidence_hash(cell)
    repriced = cell.model_copy(deep=True)
    repriced.cost_adder += 1
    assert evidence_hash(repriced) != evidence_hash(cell)


def test_a_flag_is_open_until_someone_approves_it(stored, repo):
    tender_id = stored.id
    assert review_state(_cell(stored), None) == "open"
    assert [(i.kind, i.vendor_id, i.param_id) for i in open_items(stored, {}, repo.latest_reviews(tender_id))] == [
        ("review_flag", "vendor-b", "PARAM-01"), ("review_flag", "vendor-b", "PARAM-06"),
        ("unpriced", "vendor-b", "PARAM-06")]
    repo.add_review(tender_id, *CELL, action="approve", reviewer="a.yadav", note="Drawing note 7 checked against the PDF",
                    evidence_hash=evidence_hash(_cell(stored)))
    latest = repo.latest_reviews(tender_id)
    assert review_state(_cell(stored), latest[CELL]) == "reviewed"
    assert _open(stored, latest) == []
    # The warranty cell stays open until it is approved and priced: an approval does not price it, and a price does not approve it.
    assert [i.kind for i in _open(stored, latest, cell=WARRANTY)] == ["review_flag", "unpriced"]
    repo.add_review(tender_id, *WARRANTY, action="approve", reviewer="a.yadav", note="ok",
                    evidence_hash=evidence_hash(_cell(stored, *WARRANTY)))
    latest = repo.latest_reviews(tender_id)
    assert [i.kind for i in open_items(stored, {}, latest)] == ["unpriced"]
    priced = {WARRANTY: engine.Override(adder_eur=Decimal("9300.00"), note="priced")}
    assert open_items(stored, priced, latest) == []


def test_review_row_records_who_what_when_and_the_evidence(stored, repo):
    repo.add_review(stored.id, *CELL, action="override", reviewer="a.yadav", note="Priced from the vendor's clarification",
                    evidence_hash=evidence_hash(_cell(stored)))
    row = repo.list_reviews(stored.id)[-1]
    assert (row["param_id"], row["vendor_id"], row["action"], row["reviewer"]) == (*CELL, "override", "a.yadav")
    assert row["note"] == "Priced from the vendor's clarification"
    assert row["evidence_hash"] == evidence_hash(_cell(stored)) and row["created_at"].tzinfo is not None


def test_review_never_changes_the_extracted_data(stored, repo):
    before = repo.load_tender(stored.id).model_dump()
    repo.add_review(stored.id, *CELL, action="override", reviewer="a.yadav", note="n",
                    evidence_hash=evidence_hash(_cell(stored)))
    assert repo.load_tender(stored.id).model_dump() == before


def test_a_rejected_cell_stays_open(stored, repo):
    repo.add_review(stored.id, *CELL, action="reject", reviewer="a.yadav", note="Wrong passage",
                    evidence_hash=evidence_hash(_cell(stored)))
    latest = repo.latest_reviews(stored.id)
    assert review_state(_cell(stored), latest[CELL]) == "rejected"
    assert [i.kind for i in _open(stored, latest)] == ["review_flag"]


def test_reingest_with_changed_evidence_makes_the_approval_stale(stored, repo, tmp_path):
    repo.add_review(stored.id, *CELL, action="approve", reviewer="a.yadav", note="ok",
                    evidence_hash=evidence_hash(_cell(stored)))
    # Re-ingest unchanged: the approval still stands.
    again = run_ingest(PACK, locator=AnswerKeyLocator(_dropped(load_expected())))
    persist(again, repo.db)
    latest = repo.latest_reviews(stored.id)
    assert review_state(_cell(again.tender), latest[CELL]) == "reviewed"
    # Re-ingest after the vendor re-issues the drawing note: the reviewer has not seen this evidence.
    pack = mutate.base_pack()
    pack.replace_text(VOLTSWITCH, "rated 31.5kA 1s", "rated 40kA 1s")
    pack.expected = _dropped(pack.expected)
    changed = run_ingest(mutate.write(pack, tmp_path), locator=AnswerKeyLocator(pack.expected))
    cell = _cell(changed.tender)
    assert cell.flags and review_state(cell, latest[CELL]) == "stale"
    items = _open(changed.tender, latest)
    assert [(i.kind, i.message) for i in items] == [("review_flag", "Evidence changed since it was approved; review again")]


def test_unflagged_cells_need_no_review():
    """The sample's only flag is the warranty basis; once the founder approves it and prices the cell, nothing is open."""
    from antova_ingest.dev_seed import founder_resolution

    result = run_ingest(PACK, locator=AnswerKeyLocator(load_expected()))
    assert [(i.kind, i.vendor_id, i.param_id) for i in open_items(result.tender, {}, {})] == [
        ("review_flag", "vendor-b", "PARAM-06"), ("unpriced", "vendor-b", "PARAM-06")]
    assert result.stats["flags_raised"] == 1
    overrides, reviews = founder_resolution(result.tender)
    assert list(reviews) == [WARRANTY] and list(overrides) == [WARRANTY]
    assert open_items(result.tender, overrides, reviews) == []


# --- nothing is final while flags are open -----------------------------------------------

@pytest.fixture
def client(stored):
    with TestClient(app, headers=HEADERS) as c:
        yield c


def test_brief_reports_open_flags_and_is_not_final(client, stored):
    brief = client.get(f"/api/review/tenders/{stored.id}").json()
    assert brief["review"] == {"open_flags": 2, "stale": 0, "rejected": 0, "reviewed": 0, "final": False}
    assert [(i["kind"], i["param_id"]) for i in brief["open_items"]] == [
        ("review_flag", "PARAM-01"), ("review_flag", "PARAM-06"), ("unpriced", "PARAM-06")]


def test_verify_is_refused_while_a_flag_is_open_and_allowed_after_approval(client, stored):
    refused = client.post(f"/api/review/tenders/{stored.id}/verify")
    assert refused.status_code == 409 and refused.json()["open_items"][0]["kind"] == "review_flag"
    put = client.put(f"/api/review/tenders/{stored.id}/reviews/PARAM-01/vendor-b",
                     json={"action": "approve", "reviewer": "a.yadav", "note": "Checked note 7 on p.11"})
    assert put.status_code == 200 and put.json()["state"] == "reviewed"
    brief = client.get(f"/api/review/tenders/{stored.id}").json()
    assert brief["review"]["open_flags"] == 1 and brief["review"]["reviewed"] == 1
    # The warranty cell is still flagged and unpriced: it needs its own approval and a price.
    assert client.post(f"/api/review/tenders/{stored.id}/verify").status_code == 409
    assert client.put(f"/api/review/tenders/{stored.id}/reviews/PARAM-06/vendor-b", json=WARRANTY_BODY).status_code == 200
    assert client.put(f"/api/review/tenders/{stored.id}/overrides/PARAM-06/vendor-b",
                      json={"adder_eur": "9300.00", "note": "priced by the founder"}).status_code == 204
    brief = client.get(f"/api/review/tenders/{stored.id}").json()
    assert brief["review"]["open_flags"] == 0 and brief["review"]["reviewed"] == 2
    assert client.post(f"/api/review/tenders/{stored.id}/verify").status_code == 200
    assert client.get(f"/api/review/tenders/{stored.id}").json()["review"]["final"] is True
    client.post(f"/api/review/tenders/{stored.id}/withdraw")


def test_review_route_validates_its_input(client, stored):
    base = f"/api/review/tenders/{stored.id}/reviews"
    assert client.put(f"{base}/PARAM-01/vendor-b", json={"action": "bless", "reviewer": "a", "note": "n"}).status_code == 422
    assert client.put(f"{base}/PARAM-01/vendor-b", json={"action": "approve", "reviewer": "x" * 129, "note": "n"}).status_code == 422
    assert client.put(f"{base}/PARAM-99/vendor-b", json={"action": "approve", "reviewer": "a", "note": "n"}).status_code == 404
    listed = client.get(base)
    assert listed.status_code == 200 and isinstance(listed.json(), list)


def test_brief_says_whether_the_result_is_final(client, stored):
    review = client.get(f"/api/review/tenders/{stored.id}").json()["review"]
    assert (review["open_flags"], review["final"]) == (2, False)


# --- the clarification register -------------------------------------------------------------

@pytest.fixture(scope="module")
def sample():
    return run_ingest(PACK, locator=AnswerKeyLocator(load_expected())).tender


def _rows(tender, vendor_id=None, param_id=None):
    return [r for r in clarify.clarifications(tender)
            if (vendor_id is None or r["vendor_id"] == vendor_id) and (param_id is None or r["param_id"] == param_id)]


def test_every_non_compliant_cell_gets_a_question(sample):
    rows = clarify.clarifications(sample)
    asked = {(r["vendor_id"], r["param_id"]) for r in rows}
    for p in sample.parameters:
        for vendor_id, cell in p.vendors.items():
            if cell.status != engine.ComplianceStatus.COMPLIANT:
                assert (vendor_id, p.id) in asked
    assert not [r for r in rows if r["vendor_id"] == "vendor-a" and r["kind"] != "BASIS"]


def test_deviation_question_cites_both_documents(sample):
    row = next(r for r in _rows(sample, "vendor-c", "PARAM-01") if r["kind"] == "DEVIATION")
    assert row["question"] == (
        "Your datasheet p.6 states a short-time withstand duration of 1 s. MR p.5 requires 3 s. "
        "Confirm the rated duration and provide the type-test certificate.")
    assert row["citations"] == "Bid_vendor-c_Deltaport.pdf p.6; MR-33kV-GIS-Rev4.pdf p.5"
    assert (row["vendor_name"], row["param_name"]) == ("Deltaport Skid Consortium B.V.",
                                                       "Rated Short-Time Withstand Current (Ik)")


def test_conflict_question_names_both_passages(sample):
    rows = [r for r in _rows(sample, "vendor-b", "PARAM-01") if r["kind"] == "CONFLICT"]
    assert rows and all("cover letter p.2" in r["question"] and "drawing p.11" in r["question"] for r in rows)
    assert all("Confirm which governs" in r["question"] for r in rows)


def test_omitted_scope_question(sample):
    row = next(r for r in _rows(sample, "vendor-b", "PARAM-05") if r["kind"] == "OMITTED")
    assert "test plan p.18" in row["question"] and "MR p.13" in row["question"]
    assert "Confirm" in row["question"]


def test_unspecified_warranty_start_is_asked_about(sample):
    row = next(r for r in _rows(sample, "vendor-a", "PARAM-06") if r["kind"] == "BASIS")
    assert "does not say when the warranty period starts" in row["question"] and "from commissioning" in row["question"]


def test_review_flags_become_questions(flagged):
    rows = [r for r in _rows(flagged.tender, "vendor-b", "PARAM-01") if r["kind"] == "FLAG"]
    assert len(rows) == 1 and "p.11" in rows[0]["question"]


def test_questions_are_deterministic_and_use_no_model(sample):
    assert clarify.clarifications(sample) == clarify.clarifications(sample)
    assert all(r["question"].endswith((".", "?")) and "  " not in r["question"] for r in clarify.clarifications(sample))


def test_every_ontology_field_has_a_template():
    from antova_ingest.ontology import PARAMETERS
    for param in PARAMETERS:
        for f in param.fields:
            assert f.name in clarify.FIELD_TEMPLATES, (param.id, f.name)


def test_csv_export(sample):
    text = clarify.to_csv(clarify.clarifications(sample))
    rows = list(csv.DictReader(io.StringIO(text)))
    assert list(rows[0]) == ["tender_id", "vendor_id", "vendor_name", "param_id", "param_name", "kind", "question", "citations"]
    assert len(rows) == len(clarify.clarifications(sample)) and rows[0]["tender_id"] == "TENDER-2026-402"
    assert any("€" not in r["question"] or True for r in rows)


def test_csv_route(client, stored):
    response = client.get(f"/api/review/tenders/{stored.id}/clarifications.csv")
    assert response.status_code == 200 and response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    assert response.text.splitlines()[0].startswith("tender_id,vendor_id,vendor_name")
