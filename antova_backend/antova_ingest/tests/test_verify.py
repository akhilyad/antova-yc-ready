"""Answer-key comparison and the verification CLI."""

import json
import shutil

import pytest

from antova_engine import ComplianceStatus
from antova_ingest import extract
from antova_ingest.pipeline import run_ingest
from antova_ingest.run import main
from antova_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected
from antova_ingest.verify import compare_to_answer_key


@pytest.fixture(scope="module")
def result():
    return run_ingest(PACK, locator=AnswerKeyLocator(load_expected()))


def test_compare_clean(result):
    assert compare_to_answer_key(result.tender, load_expected()) == []


def test_compare_reports_status_mismatch(result):
    tender = result.tender.model_copy(deep=True)
    p01 = next(p for p in tender.parameters if p.id == "PARAM-01")
    p01.vendors["vendor-b"].status = ComplianceStatus.DEVIATION_DOWNGRADE
    messages = compare_to_answer_key(tender, load_expected())
    assert messages == ["vendor-b PARAM-01: status DEVIATION_DOWNGRADE != expected CONFLICT_DOWNGRADE"]


def test_compare_reports_wrong_adder(result):
    tender = result.tender.model_copy(deep=True)
    p02 = next(p for p in tender.parameters if p.id == "PARAM-02")
    p02.vendors["vendor-b"].cost_adder = 1.0
    p02.vendors["vendor-b"].cost_lines = []
    messages = compare_to_answer_key(tender, load_expected())
    assert any(m.startswith("vendor-b PARAM-02: adder") for m in messages)


def test_api_check_leaves_audit_ledger_alone(monkeypatch):
    """Final review M8: verification must not append negotiation rows to the real audit ledger."""
    from antova_db import AuditLedgerRecord, SessionLocal
    from antova_ingest.verify import check_api_path

    monkeypatch.setattr(extract, "make_locator", lambda d, m: AnswerKeyLocator(load_expected()))

    def audit_rows():
        db = SessionLocal()
        try:
            return db.query(AuditLedgerRecord).count()
        finally:
            db.close()

    before = audit_rows()
    assert check_api_path("TENDER-2026-402", load_expected()) == []
    assert audit_rows() == before


def test_api_check_works_without_configured_review_token(monkeypatch):
    """The gated API path still verifies when ANTOVA_REVIEW_TOKEN is unset, and leaves it unset."""
    import os

    from antova_ingest.verify import check_api_path

    monkeypatch.setattr(extract, "make_locator", lambda d, m: AnswerKeyLocator(load_expected()))
    monkeypatch.delenv("ANTOVA_REVIEW_TOKEN", raising=False)
    assert check_api_path("TENDER-2026-402", load_expected()) == []
    assert "ANTOVA_REVIEW_TOKEN" not in os.environ


def test_api_check_uses_configured_review_token(monkeypatch):
    import os

    from antova_ingest.verify import check_api_path

    monkeypatch.setattr(extract, "make_locator", lambda d, m: AnswerKeyLocator(load_expected()))
    monkeypatch.setenv("ANTOVA_REVIEW_TOKEN", "configured-token")
    assert check_api_path("TENDER-2026-402", load_expected()) == []
    assert os.environ["ANTOVA_REVIEW_TOKEN"] == "configured-token"


def test_cli_verify_passes(tmp_path, monkeypatch, capsys):
    folder = tmp_path / "TENDER-2026-402"
    folder.mkdir()
    for item in PACK.iterdir():
        if item.is_file():
            shutil.copy(item, folder / item.name)
    monkeypatch.setattr(extract, "make_locator", lambda d, m: AnswerKeyLocator(load_expected()))
    assert main([str(folder), "--verify"]) == 0
    out = capsys.readouterr().out
    assert "PASS" in out
    reports = list((folder / "runs").glob("*.json"))
    assert len(reports) == 1
    report = json.loads(reports[0].read_text(encoding="utf-8"))
    assert report["passed"] is True
    assert report["mismatches"] == []
