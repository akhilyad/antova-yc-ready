"""WP1: staged artifacts and the run fingerprint."""

import dataclasses
import json
import shutil
from decimal import Decimal
from pathlib import Path

import pytest

from specclaw_db import SessionLocal, TenderRepository
from specclaw_ingest import artifacts, extract, ontology
from specclaw_ingest.extract import ClaudeLocator, ReplayMiss, ResponseStore
from specclaw_ingest.parse import parse_document, load_manifest
from specclaw_ingest.pipeline import persist, rerun_from, run_ingest
from specclaw_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected

VOLTSWITCH = "Bid_vendor-b_VoltSwitch.pdf"


@pytest.fixture(scope="module")
def expected():
    return load_expected()


@pytest.fixture(scope="module")
def result(expected):
    return run_ingest(PACK, locator=AnswerKeyLocator(expected))


def _copy_pack(tmp_path: Path) -> Path:
    for item in PACK.iterdir():
        if item.is_file():
            shutil.copy(item, tmp_path / item.name)
    return tmp_path


def test_canonical_json_is_sorted_and_writes_decimals_as_strings():
    body = artifacts.canonical_json({"b": Decimal("1.50"), "a": (1, 2), "c": {"z": None, "y": True}})
    assert body == '{"a":[1,2],"b":"1.50","c":{"y":true,"z":null}}'


def test_every_stage_has_a_hashed_json_artifact(result):
    assert list(result.artifacts) == list(artifacts.STAGE_NAMES) == [
        "parsed", "located", "verified", "resolved", "checked", "priced", "leveled"]
    for stage, artifact in result.artifacts.items():
        assert artifact.stage == stage
        assert artifact.sha256 == artifacts.sha256_text(artifact.body)
        assert artifacts.canonical_json(json.loads(artifact.body)) == artifact.body  # canonical and round-trips


def test_two_runs_on_the_same_inputs_give_identical_hashes(result, expected):
    again = run_ingest(PACK, locator=AnswerKeyLocator(expected))
    assert {s: a.sha256 for s, a in again.artifacts.items()} == {s: a.sha256 for s, a in result.artifacts.items()}
    assert again.fingerprint == result.fingerprint
    assert again.stats["run_id"] == result.stats["run_id"]


def test_artifacts_carry_no_timings(result):
    leveled = json.loads(result.artifacts["leveled"].body)
    assert "duration_s" not in leveled["stats"] and "stage_log" not in leveled["stats"]
    assert leveled["tender"]["latency_sec"] == 0


def test_rerun_from_verified_equals_the_full_run(result):
    again = rerun_from("verified", result.artifacts, result.fingerprint)
    assert {s: a.sha256 for s, a in again.artifacts.items()} == {s: a.sha256 for s, a in result.artifacts.items()}
    assert again.tender.model_dump(exclude={"latency_sec"}) == result.tender.model_dump(exclude={"latency_sec"})


def test_rerun_after_tampering_with_a_located_quote_changes_the_outcome(result):
    """Phase 2's tamper path: replace one quote in `located`, rerun from `verified`."""
    located = json.loads(result.artifacts["located"].body)
    candidates = located["outcomes"][VOLTSWITCH]["response"]["candidates"]
    target = next(c for c in candidates if c["param_id"] == "PARAM-01" and c["page"] == 11)
    target["quote"] = "NOTE 7: Standard switchgear bay rated 50kA 3s as required."
    tampered = dict(result.artifacts)
    tampered["located"] = artifacts.make_artifact("located", located)
    again = rerun_from("verified", tampered, result.fingerprint)
    assert again.artifacts["parsed"].sha256 == result.artifacts["parsed"].sha256
    assert again.artifacts["verified"].sha256 != result.artifacts["verified"].sha256
    assert again.stats["candidates_rejected"] == result.stats["candidates_rejected"] + 1


def test_rerun_rejects_an_unknown_stage(result):
    with pytest.raises(ValueError):
        rerun_from("nonsense", result.artifacts, result.fingerprint)


def test_fingerprint_covers_every_input(result):
    parts = result.fingerprint["parts"]
    assert set(parts) == {"inputs", "ontology", "rules", "rate_table", "prompt", "locator_mode", "package_version"}
    assert set(parts["inputs"]) == {"manifest.json", "MR-33kV-GIS-Rev4.pdf", "Bid_vendor-a_Nordwerk.pdf",
                                    VOLTSWITCH, "Bid_vendor-c_Deltaport.pdf"}
    assert parts["locator_mode"] == "answer_key"
    assert len(result.fingerprint["fingerprint"]) == 64
    assert result.stats["run_fingerprint"] == result.fingerprint["fingerprint"]


def test_changed_bid_changes_the_fingerprint(tmp_path, expected, result):
    pack = _copy_pack(tmp_path)
    with (pack / VOLTSWITCH).open("ab") as f:
        f.write(b"\n% re-issued\n")  # a PDF comment: same text, different file
    changed = run_ingest(pack, locator=AnswerKeyLocator(expected))
    assert changed.fingerprint["fingerprint"] != result.fingerprint["fingerprint"]
    assert changed.fingerprint["parts"]["inputs"][VOLTSWITCH] != result.fingerprint["parts"]["inputs"][VOLTSWITCH]
    assert changed.stats["run_id"] != result.stats["run_id"]




def test_editing_a_locate_hint_changes_the_prompt_hash_and_misses_the_replay_store(tmp_path, monkeypatch, result):
    doc = parse_document(PACK, load_manifest(PACK).documents[0])
    store = ResponseStore(tmp_path)
    key_before = store.key_for(doc)
    prompt_before = artifacts.run_fingerprint(PACK, "replay")["parts"]["prompt"]
    outcome = AnswerKeyLocator(load_expected()).locate(doc)
    store.save(key_before, outcome, doc)
    assert ClaudeLocator(store, "replay").locate(doc).from_store

    first = ontology.PARAMETERS[0]
    edited = (dataclasses.replace(first, locate_hint=first.locate_hint + " Include the peak value."),
              *ontology.PARAMETERS[1:])
    monkeypatch.setattr(extract, "PARAMETERS", edited)
    assert artifacts.run_fingerprint(PACK, "replay")["parts"]["prompt"] != prompt_before
    assert store.key_for(doc) != key_before
    with pytest.raises(ReplayMiss):
        ClaudeLocator(store, "replay").locate(doc)


def test_persist_stores_the_run_and_its_artifacts(result):
    db = SessionLocal()
    try:
        persist(result, db)
        repo = TenderRepository(db)
        run = repo.get_run(result.tender.id)
        assert run["run_id"] == result.stats["run_id"]
        assert run["fingerprint"] == result.fingerprint["fingerprint"]
        assert run["parts"] == result.fingerprint["parts"]
        stored = repo.get_stage_artifacts(run["run_id"])
        assert list(stored) == list(artifacts.STAGE_NAMES)
        for stage, artifact in result.artifacts.items():
            assert stored[stage].sha256 == artifact.sha256
            assert stored[stage].body == artifact.body
        # A stored run reruns from any stage without the PDFs.
        again = rerun_from("checked", stored, run)
        assert again.artifacts["leveled"].sha256 == result.artifacts["leveled"].sha256
    finally:
        db.close()


def test_reingest_keeps_only_the_latest_runs_artifacts(tmp_path, expected, result):
    db = SessionLocal()
    try:
        persist(result, db)
        pack = _copy_pack(tmp_path)
        with (pack / VOLTSWITCH).open("ab") as f:
            f.write(b"\n% re-issued\n")
        changed = run_ingest(pack, locator=AnswerKeyLocator(expected))
        persist(changed, db)
        repo = TenderRepository(db)
        assert repo.get_run(result.tender.id)["run_id"] == changed.stats["run_id"]
        assert repo.get_stage_artifacts(result.stats["run_id"]) == {}
        assert len(repo.get_stage_artifacts(changed.stats["run_id"])) == len(artifacts.STAGE_NAMES)
    finally:
        db.close()
