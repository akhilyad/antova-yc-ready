"""Uploading a tender: PDFs and a manifest in, checked before anything is kept, then ingested."""

import json
import shutil
import time
from pathlib import Path

import fitz
import pytest
from fastapi.testclient import TestClient

from specclaw_api import app
from specclaw_auth import REVIEW_HEADER
from specclaw_db import SessionLocal, TenderRepository
from specclaw_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected
from specclaw_workers import job_manager

TENDER_ID = "TENDER-2026-499"
HEADERS = {REVIEW_HEADER: "test-review-token"}  # token set in conftest.py
PDF = {"Content-Type": "application/pdf"}
SMALL = "Bid_vendor-a_Nordwerk.pdf"


@pytest.fixture
def root(tmp_path, monkeypatch):
    monkeypatch.setenv("SPECCLAW_TENDERS_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture
def client(root):
    return TestClient(app, headers=HEADERS)


def _pdf(name=SMALL) -> bytes:
    return (PACK / name).read_bytes()


def _url(name="x.pdf", tender=TENDER_ID):
    return f"/api/review/tenders/{tender}/files/{name}"


def _leftovers(root: Path):
    return [p.name for p in root.rglob("*") if p.is_file() and p.suffix == ".tmp"]


def _manifest(tender=TENDER_ID) -> dict:
    data = json.loads((PACK / "manifest.json").read_text(encoding="utf-8"))
    data["tender_id"] = tender
    return data


# --- PDFs --------------------------------------------------------------------------------------

def test_uploads_are_off_until_a_tenders_folder_is_configured(monkeypatch):
    monkeypatch.delenv("SPECCLAW_TENDERS_DIR", raising=False)
    c = TestClient(app, headers=HEADERS)
    response = c.put(_url(), content=_pdf(), headers=PDF)
    assert response.status_code == 503 and "not configured" in response.json()["detail"]


def test_a_pdf_is_stored_whole_and_described(client, root):
    response = client.put(_url(SMALL), content=_pdf(), headers=PDF)
    assert response.status_code == 201
    body = response.json()
    assert body["pages"] == 30 and body["size_bytes"] == len(_pdf())
    assert (root / TENDER_ID / SMALL).read_bytes() == _pdf()
    assert body["sha256"] == __import__("hashlib").sha256(_pdf()).hexdigest()
    assert _leftovers(root) == []
    assert client.get(f"/api/review/tenders/{TENDER_ID}/files").json() == {
        "files": [{"filename": SMALL, "size_bytes": len(_pdf())}], "manifest": False}


def test_replacing_a_pdf_replaces_it(client, root):
    client.put(_url(SMALL), content=_pdf(), headers=PDF)
    other = _pdf("Bid_vendor-b_VoltSwitch.pdf")
    assert client.put(_url(SMALL), content=other, headers=PDF).status_code == 201
    assert (root / TENDER_ID / SMALL).read_bytes() == other


@pytest.mark.parametrize("name", ["notes.txt", "..pdf.exe", ".hidden.pdf", "a" * 130 + ".pdf", "a%5Cb.pdf", "con?.pdf", "x.PDF.zip"])
def test_a_bad_file_name_is_refused(client, root, name):
    response = client.put(_url(name), content=_pdf(), headers=PDF)
    assert response.status_code in (404, 422)
    assert not (root / TENDER_ID).exists() or not list((root / TENDER_ID).iterdir())


@pytest.mark.parametrize("tender", ["tender-lower", "../escape", "A" * 65, "TENDER_1"])
def test_a_bad_tender_id_is_refused(client, root, tender):
    response = client.put(_url(tender=tender), content=_pdf(), headers=PDF)
    assert response.status_code in (404, 422)
    assert list(root.iterdir()) == []


def test_something_that_is_not_a_pdf_is_refused_and_leaves_nothing(client, root):
    for content, detail in [(b"<html>not a pdf</html>", "%PDF-"), (b"", "empty"), (b"%PDF-1.7\nnot really", "cannot be read")]:
        response = client.put(_url(), content=content, headers=PDF)
        assert response.status_code == 422 and detail in response.json()["detail"], detail
    assert not (root / TENDER_ID / "x.pdf").exists() and _leftovers(root) == []


def test_a_refused_upload_does_not_destroy_the_file_it_would_replace(client, root):
    client.put(_url(SMALL), content=_pdf(), headers=PDF)
    assert client.put(_url(SMALL), content=b"%PDF-1.7\ngarbage", headers=PDF).status_code == 422
    assert (root / TENDER_ID / SMALL).read_bytes() == _pdf()


def test_an_oversized_body_is_cut_off(client, root, monkeypatch):
    monkeypatch.setenv("SPECCLAW_MAX_UPLOAD_MB", "1")
    response = client.put(_url(), content=b"%PDF-" + b"0" * (1024 * 1024 + 10), headers=PDF)
    assert response.status_code == 413 and "1 MB" in response.json()["detail"]
    assert _leftovers(root) == [] and not (root / TENDER_ID / "x.pdf").exists()


def test_a_body_without_a_declared_length_is_cut_off_while_streaming(client, root, monkeypatch):
    monkeypatch.setenv("SPECCLAW_MAX_UPLOAD_MB", "1")

    def chunks():
        yield b"%PDF-"
        for _ in range(40):
            yield b"0" * 65536  # about 2.5 MB, no Content-Length

    response = client.put(_url(), content=chunks(), headers=PDF)
    assert response.status_code == 413
    assert _leftovers(root) == []


def test_a_pdf_over_the_page_limit_is_refused(client, root, monkeypatch):
    monkeypatch.setenv("SPECCLAW_MAX_PDF_PAGES", "5")
    response = client.put(_url(SMALL), content=_pdf(), headers=PDF)
    assert response.status_code == 422 and "30 pages" in response.json()["detail"]
    assert not (root / TENDER_ID / SMALL).exists()


def test_an_encrypted_pdf_is_refused(client, root, tmp_path_factory):
    path = tmp_path_factory.mktemp("enc") / "locked.pdf"
    with fitz.open() as doc:
        doc.new_page().insert_text((72, 72), "secret")
        doc.save(path, encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="pw", owner_pw="pw")
    response = client.put(_url(), content=path.read_bytes(), headers=PDF)
    assert response.status_code == 422 and "encrypted" in response.json()["detail"]


def test_a_tender_holds_a_limited_number_of_pdfs(client, root, monkeypatch):
    monkeypatch.setenv("SPECCLAW_MAX_TENDER_FILES", "2")
    assert client.put(_url("a.pdf"), content=_pdf(), headers=PDF).status_code == 201
    assert client.put(_url("b.pdf"), content=_pdf(), headers=PDF).status_code == 201
    assert client.put(_url("c.pdf"), content=_pdf(), headers=PDF).status_code == 409
    assert client.put(_url("A.PDF"), content=_pdf(), headers=PDF).status_code == 201  # replacing one is not adding


def test_uploads_need_the_review_token(root):
    anonymous = TestClient(app)
    assert anonymous.put(_url(), content=_pdf(), headers=PDF).status_code == 401
    assert anonymous.put(f"/api/review/tenders/{TENDER_ID}/manifest", content=b"{}").status_code == 401
    assert anonymous.get(f"/api/review/tenders/{TENDER_ID}/files").status_code == 401


def test_a_verified_brief_freezes_its_documents(client, root, ingested_402):
    db = SessionLocal()
    try:
        from datetime import datetime, timezone

        TenderRepository(db).set_status("TENDER-2026-402", "VERIFIED", datetime.now(timezone.utc), by="t")
        try:
            response = client.put(_url(SMALL, "TENDER-2026-402"), content=_pdf(), headers=PDF)
            assert response.status_code == 409 and "Withdraw" in response.json()["detail"]
            assert client.put("/api/review/tenders/TENDER-2026-402/manifest",
                              content=json.dumps(_manifest("TENDER-2026-402"))).status_code == 409
        finally:
            TenderRepository(db).set_status("TENDER-2026-402", "DRAFT", datetime.now(timezone.utc))
    finally:
        db.close()
    assert list(root.iterdir()) == []


@pytest.fixture(scope="module")
def ingested_402():
    from specclaw_ingest.pipeline import run_ingest
    from specclaw_service import persist

    result = run_ingest(PACK, locator=AnswerKeyLocator(load_expected()))
    db = SessionLocal()
    try:
        persist(result, db)
    finally:
        db.close()


# --- manifest ----------------------------------------------------------------------------------

def _upload_all(client):
    for entry in _manifest()["documents"]:
        assert client.put(_url(entry["file"]), content=_pdf(entry["file"]), headers=PDF).status_code == 201


def test_a_manifest_naming_a_missing_file_is_refused(client, root):
    client.put(_url(SMALL), content=_pdf(), headers=PDF)
    response = client.put(f"/api/review/tenders/{TENDER_ID}/manifest", content=json.dumps(_manifest()))
    assert response.status_code == 422 and "not found" in response.json()["detail"]
    assert not (root / TENDER_ID / "manifest.json").exists()


@pytest.mark.parametrize("mutate,detail", [
    (lambda m: m.update(tender_id="TENDER-2026-111"), "not 'TENDER-2026-499'"),
    (lambda m: m.update(rate_table="../../etc/passwd"), "invalid rate_table"),
    (lambda m: m["documents"].append(dict(m["documents"][1])), "duplicate"),
    (lambda m: m["documents"][1].update(file="../outside.pdf"), "outside"),
])
def test_a_manifest_with_a_fault_is_refused(client, root, mutate, detail):
    _upload_all(client)
    manifest = _manifest()
    mutate(manifest)
    response = client.put(f"/api/review/tenders/{TENDER_ID}/manifest", content=json.dumps(manifest))
    assert response.status_code == 422 and detail in response.json()["detail"], response.text
    assert not (root / TENDER_ID / "manifest.json").exists()


def test_a_bad_manifest_does_not_replace_a_good_one(client, root):
    _upload_all(client)
    assert client.put(f"/api/review/tenders/{TENDER_ID}/manifest", content=json.dumps(_manifest())).status_code == 200
    kept = (root / TENDER_ID / "manifest.json").read_bytes()
    assert client.put(f"/api/review/tenders/{TENDER_ID}/manifest", content=b"{not json").status_code == 422
    assert (root / TENDER_ID / "manifest.json").read_bytes() == kept
    assert _leftovers(root) == []


def test_a_manifest_must_be_small_utf8(client):
    assert client.put(f"/api/review/tenders/{TENDER_ID}/manifest", content=b"x" * (256 * 1024 + 1)).status_code == 413
    assert client.put(f"/api/review/tenders/{TENDER_ID}/manifest", content=b"\xff\xfe\x00").status_code == 422


# --- the whole path ----------------------------------------------------------------------------

def test_upload_then_ingest_gives_a_brief(client, root, monkeypatch):
    monkeypatch.setattr(job_manager, "locator_factory", lambda d, m: AnswerKeyLocator(load_expected()))
    _upload_all(client)
    stored = client.put(f"/api/review/tenders/{TENDER_ID}/manifest", content=json.dumps(_manifest()))
    assert stored.status_code == 200
    assert stored.json() == {"tender_id": TENDER_ID, "documents": 4, "vendors": ["vendor-a", "vendor-b", "vendor-c"]}
    assert client.get(f"/api/review/tenders/{TENDER_ID}/files").json()["manifest"] is True
    with TestClient(app, headers=HEADERS) as live:
        job = live.post("/api/jobs/ingest", json={"tender_id": TENDER_ID, "mode": "replay"}).json()["job_id"]
        deadline = time.monotonic() + 60
        status = {}
        while time.monotonic() < deadline:
            status = live.get(f"/api/jobs/{job}").json()
            if status["status"] in ("COMPLETED", "FAILED"):
                break
            time.sleep(0.05)
        assert status["status"] == "COMPLETED", status
        brief = live.get(f"/api/review/tenders/{TENDER_ID}").json()
    assert brief["tender"]["id"] == TENDER_ID and len(brief["tender"]["vendors"]) == 3
    assert [d["filename"] for d in brief["documents"]][0] == "MR-33kV-GIS-Rev4.pdf"
    shutil.rmtree(root / TENDER_ID)
