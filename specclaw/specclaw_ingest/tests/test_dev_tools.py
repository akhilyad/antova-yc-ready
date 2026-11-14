"""The offline dev seed and the frontend fixture export."""

import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from specclaw_briefs_api import brief, load_tender
from specclaw_db import TenderRepository
from specclaw_ingest import dev_seed, export_fixtures
from specclaw_ingest.pipeline import STAGES
from specclaw_review import public_brief_payload

REPO_ROOT = Path(__file__).resolve().parents[2]
COMMITTED = REPO_ROOT / "web" / "src" / "test" / "fixtures"
FILES = ["draft-brief.json", "jobs.json", "parity-cases.json", "review-list.json", "verified-brief.json"]
TENDER_ID = "TENDER-2026-402"


@pytest.fixture
def seed_engine(tmp_path):
    """A throwaway database, so seeding never touches the shared test database."""
    return create_engine(f"sqlite:///{(tmp_path / 'seed.db').as_posix()}")


@pytest.fixture(scope="module")
def exported(tmp_path_factory):
    out = tmp_path_factory.mktemp("fixtures-a")
    export_fixtures.export(out)
    return out


def _read(out: Path, name: str):
    return json.loads((out / name).read_text(encoding="utf-8"))


def test_seed_prints_share_id_and_verifies(seed_engine, capsys):
    assert dev_seed.main(["--share-id", "seed-test-share-id-00000"], bind=seed_engine) == 0
    assert capsys.readouterr().out.strip() == "share_id=seed-test-share-id-00000"
    with Session(seed_engine) as db:
        meta = TenderRepository(db).get_meta(TENDER_ID)
    assert meta.share_id == "seed-test-share-id-00000"
    assert meta.status == "VERIFIED"
    assert meta.verified_at is not None
    assert meta.ingest_mode == "answer_key"
    # Rate table v2 flags and leaves unpriced VoltSwitch's dispatch warranty, so the verified seed carries the
    # founder's approval of that flag and the founder's price for the cell.
    with Session(seed_engine) as db:
        repo = TenderRepository(db)
        assert list(repo.latest_reviews(TENDER_ID)) == [("PARAM-06", "vendor-b")]
        assert repo.latest_reviews(TENDER_ID)[("PARAM-06", "vendor-b")]["action"] == "approve"
        assert {k: str(v.adder_eur) for k, v in repo.get_overrides(TENDER_ID).items()} == {("PARAM-06", "vendor-b"): "9300.00"}


def test_seed_draft_leaves_the_brief_unverified(seed_engine, capsys):
    assert dev_seed.main(["--draft"], bind=seed_engine) == 0
    printed = capsys.readouterr().out.strip()
    with Session(seed_engine) as db:
        meta = TenderRepository(db).get_meta(TENDER_ID)
    assert printed == f"share_id={meta.share_id}"
    assert meta.status == "DRAFT"
    assert meta.verified_at is None


def test_export_writes_five_files(exported):
    assert sorted(p.name for p in exported.iterdir()) == FILES
    for name in FILES:
        raw = (exported / name).read_bytes()
        assert b"\r\n" not in raw
        assert raw.endswith(b"}\n") or raw.endswith(b"]\n")


def test_export_is_deterministic(exported, tmp_path):
    export_fixtures.export(tmp_path)
    for name in FILES:
        assert (tmp_path / name).read_bytes() == (exported / name).read_bytes(), name


def test_verified_and_draft_briefs(exported):
    verified = _read(exported, "verified-brief.json")
    assert verified["share_id"] == "e2e-sample-share-id-000000"
    assert verified["status"] == "VERIFIED"
    assert verified["verified_at"] == "2026-11-05T00:00:00+00:00"
    assert verified["open_items"] == []
    assert verified["review"] == {"open_flags": 0, "stale": 0, "rejected": 0, "reviewed": 1, "final": True}
    assert [(o["param_id"], o["vendor_id"], o["adder_eur"]) for o in verified["overrides"]] == [
        ("PARAM-06", "vendor-b", "9300.00")]
    assert verified["ingest_mode"] == "answer_key"
    assert [s["stage"] for s in verified["stage_log"]] == [s for s, _ in STAGES]
    # The verified brief is the public payload: no run cost. The draft is the founder's review payload.
    assert not {"api_cost_usd", "cogs_usd"} & set(verified["ingest_stats"])
    assert "compute_cogs" not in verified["tender"]

    draft = _read(exported, "draft-brief.json")
    assert draft["status"] == "DRAFT"
    assert {"api_cost_usd", "cogs_usd"} <= set(draft["ingest_stats"])
    assert "compute_cogs" in draft["tender"]
    assert draft["verified_at"] is None
    assert draft["open_items"] == [{"kind": "unpriced", "vendor_id": "vendor-c", "param_id": "PARAM-05",
                                    "message": "Gap found but not priced"}]
    cell = next(p for p in draft["tender"]["parameters"] if p["id"] == "PARAM-05")["vendors"]["vendor-c"]
    assert (cell["pricing_status"], cell["cost_lines"], cell["cost_adder"]) == ("UNPRICED", [], 0.0)
    # The draft is a copy: the verified brief's cell is untouched.
    original = next(p for p in verified["tender"]["parameters"] if p["id"] == "PARAM-05")["vendors"]["vendor-c"]
    assert original["pricing_status"] == "PRICED"


def test_review_list_row_mirrors_the_route(exported):
    rows = _read(exported, "review-list.json")
    assert rows == [{
        "tender_id": TENDER_ID,
        "title": rows[0]["title"],
        "status": "DRAFT",
        "share_id": "e2e-sample-share-id-000000",
        "ingested_at": "2026-11-05T00:00:00+00:00",
        "verified_at": None,
        "open_items": 1,
    }]


def test_parity_cases_cover_the_grid(exported):
    cases = _read(exported, "parity-cases.json")
    assert len(cases) == 4 * 4 * 3 * 2
    grid = {(c["rates"]["copper"], c["rates"]["labour"], c["rates"]["freight"], len(c["overrides"])) for c in cases}
    assert len(grid) == 96 and {g[3] for g in grid} == {1, 2}
    # Every case carries the founder's price for the sample's unpriced warranty cell; half add the parity override.
    founder = {"param_id": "PARAM-06", "vendor_id": "vendor-b", "adder_eur": "9300.00",
               "note": dev_seed.FOUNDER_OVERRIDES[("PARAM-06", "vendor-b")].note}
    parity = {"param_id": "PARAM-02", "vendor_id": "vendor-b", "adder_eur": "10000.00",
              "note": export_fixtures.PARITY_OVERRIDE_NOTE}
    overridden = [c for c in cases if len(c["overrides"]) == 2]
    assert len(overridden) == len(cases) // 2
    assert {json.dumps(c["overrides"], sort_keys=True) for c in overridden} == {json.dumps([parity, founder], sort_keys=True)}
    assert {json.dumps(c["overrides"], sort_keys=True) for c in cases if len(c["overrides"]) == 1} == {
        json.dumps([founder], sort_keys=True)}
    for case in cases:
        assert [e["vendor_id"] for e in case["expected"]] == ["vendor-a", "vendor-b", "vendor-c"]
        assert set(case["expected"][0]) == {"vendor_id", "total_tech_penalty", "total_commercial_adder",
                                            "true_evaluated_price"}
    default = next(c for c in cases if c["rates"] == {"copper": 1.0, "labour": 60.0, "freight": 1.0}
                   and len(c["overrides"]) == 1)
    verified = _read(exported, "verified-brief.json")
    by_vendor = {f["vendor_id"]: f for f in verified["financials"]}
    for e in default["expected"]:
        assert e["true_evaluated_price"] == by_vendor[e["vendor_id"]]["true_evaluated_price"]


def test_jobs_cover_every_state(exported):
    jobs = _read(exported, "jobs.json")
    shape = {"job_id", "status", "progress_pct", "stage", "created_at", "completed_at", "result", "error"}
    samples = [jobs["queued"], *jobs["processing"], jobs["completed"], jobs["failed"]]
    assert all(set(s) == shape for s in samples)
    assert jobs["start"] == {"job_id": jobs["queued"]["job_id"], "status": "QUEUED"}
    assert jobs["queued"]["status"] == "PENDING"
    assert [(s["status"], s["stage"], s["progress_pct"]) for s in jobs["processing"]] == [
        ("PROCESSING", stage, pct) for stage, pct in [*STAGES, ("Persist", 100)]
    ]
    completed = jobs["completed"]
    assert completed["status"] == "COMPLETED"
    assert completed["completed_at"] == "2026-11-05T00:00:00+00:00"
    assert completed["result"]["overrides_cleared"] == [{
        "param_id": "PARAM-02", "vendor_id": "vendor-b", "adder_eur": "10000.00",
        "note": export_fixtures.PARITY_OVERRIDE_NOTE,
    }]
    review = _read(exported, "draft-brief.json")  # the job result, like the review payload, keeps the run cost
    assert {k: v for k, v in completed["result"].items() if k not in ("stage_log", "overrides_cleared")} \
        == review["ingest_stats"]
    assert completed["result"]["stage_log"] == review["stage_log"]
    assert jobs["failed"]["status"] == "FAILED" and jobs["failed"]["error"]


def test_verified_fixture_matches_the_api_payload(exported, seed_engine, capsys):
    """Seeding the same sample into a database and loading it as GET /api/briefs/{share_id} does gives
    the fixture, apart from the fields that record when and how fast the run happened."""
    dev_seed.main(["--share-id", "e2e-sample-share-id-000000"], bind=seed_engine)
    capsys.readouterr()
    with Session(seed_engine) as db:
        served = json.loads(json.dumps(public_brief_payload(brief(load_tender(db, TENDER_ID)))))
    fixture = _read(exported, "verified-brief.json")
    for payload in (served, fixture):
        payload["verified_at"] = None
        payload["stage_log"] = None
        payload["ingest_stats"].pop("duration_s")
        payload["ingest_stats"].pop("run_fingerprint")  # fixed placeholders in the fixture
        payload["ingest_stats"].pop("run_id")
        payload["tender"].pop("latency_sec")
    assert served == fixture


def test_committed_fixtures_are_current(tmp_path):
    if not COMMITTED.is_dir():
        pytest.skip("web/src/test/fixtures/ does not exist yet; create it with "
                    "`python -m specclaw_ingest.export_fixtures web/src/test/fixtures`")
    export_fixtures.export(tmp_path)
    for name in FILES:
        committed = COMMITTED / name
        assert committed.is_file(), f"{committed} is missing; run python -m specclaw_ingest.export_fixtures"
        assert committed.read_bytes() == (tmp_path / name).read_bytes(), (
            f"{name} is stale; run `python -m specclaw_ingest.export_fixtures web/src/test/fixtures`")
