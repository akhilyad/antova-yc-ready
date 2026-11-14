"""Tender documents in: PDFs and the manifest that names them, checked before anything is kept.

Uploads land in SPECCLAW_TENDERS_DIR/<tender_id>/, the folder an ingest job reads. The routes
refuse to run unless that variable is set, so they never write into the source tree. Order of
use: PUT every PDF, PUT the manifest, then POST /api/jobs/ingest.

Every PDF is checked before it replaces anything: the name, the size (counted as it streams, so
an oversized body is cut off, not buffered), the %PDF- header, that PyMuPDF opens it and it is
not encrypted, and its page count. A tender whose brief is VERIFIED is frozen: its documents back
the evidence crops people see, so they cannot be replaced until the brief is withdrawn.

Limits (environment, with defaults):
    SPECCLAW_MAX_UPLOAD_MB      50    one PDF
    SPECCLAW_MAX_PDF_PAGES      600   one PDF
    SPECCLAW_MAX_TENDER_FILES   40    PDFs in one tender folder
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import secrets
from pathlib import Path
from typing import Any

import fitz
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from specclaw_auth import ReviewerPrincipal, require_review_token
from specclaw_db import TenderRepository, get_db
from specclaw_ingest.parse import TENDER_ID_PATTERN, ManifestError, parse_manifest
from specclaw_ingest.pipeline import tenders_root

log = logging.getLogger(__name__)

PDF_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._ -]{0,118}\.pdf", re.IGNORECASE)
MAX_MANIFEST_BYTES = 256 * 1024
CHUNK = 64 * 1024

router = APIRouter(prefix="/api/review", tags=["Upload"], dependencies=[Depends(require_review_token)])


def _int_env(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name) or default))
    except ValueError:
        return default


def max_upload_bytes() -> int:
    return _int_env("SPECCLAW_MAX_UPLOAD_MB", 50) * 1024 * 1024


def max_pdf_pages() -> int:
    return _int_env("SPECCLAW_MAX_PDF_PAGES", 600)


def max_tender_files() -> int:
    return _int_env("SPECCLAW_MAX_TENDER_FILES", 40)


def _bad(status: int, detail: str) -> HTTPException:
    return HTTPException(status_code=status, detail=detail)


def tender_folder(tender_id: str) -> Path:
    """The folder uploads for this tender go to, created if needed. 503 when uploads are not configured."""
    if not os.environ.get("SPECCLAW_TENDERS_DIR"):
        raise _bad(503, "Uploads are not configured on this server")
    if not re.fullmatch(TENDER_ID_PATTERN, tender_id):
        raise _bad(422, "Invalid tender id")
    root = tenders_root().resolve()
    folder = (root / tender_id).resolve()
    if not folder.is_relative_to(root) or folder == root:
        raise _bad(422, "Invalid tender id")
    return folder


def _frozen(db: Session, tender_id: str) -> None:
    meta = TenderRepository(db).get_meta(tender_id)
    if meta is not None and meta.status == "VERIFIED":
        raise _bad(409, "Withdraw the brief before changing its documents")


async def _receive(request: Request, limit: int, into: Path) -> tuple[int, str]:
    """Stream the body to `into`, stopping at `limit` bytes. Returns (size, sha256)."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise _bad(413, f"The file is larger than {limit // (1024 * 1024)} MB")
    size, digest = 0, hashlib.sha256()
    with into.open("wb") as out:
        async for chunk in request.stream():
            size += len(chunk)
            if size > limit:
                raise _bad(413, f"The file is larger than {limit // (1024 * 1024)} MB")
            digest.update(chunk)
            out.write(chunk)
    return size, digest.hexdigest()


def check_pdf(path: Path) -> int:
    """The page count of a readable, unencrypted PDF within the page limit; else HTTP 422."""
    with path.open("rb") as f:
        if f.read(5) != b"%PDF-":
            raise _bad(422, "The file is not a PDF (it does not start with %PDF-)")
    try:
        with fitz.open(path) as doc:
            if doc.needs_pass or doc.is_encrypted:
                raise _bad(422, "The PDF is encrypted")
            pages = doc.page_count
    except HTTPException:
        raise
    except Exception:
        raise _bad(422, "The PDF cannot be read") from None
    if pages < 1:
        raise _bad(422, "The PDF has no pages")
    if pages > max_pdf_pages():
        raise _bad(422, f"The PDF has {pages} pages; the limit is {max_pdf_pages()}")
    return pages


@router.put("/tenders/{tender_id}/files/{filename}", status_code=201)
async def put_file(tender_id: str, filename: str, request: Request, db: Session = Depends(get_db),
                   principal: ReviewerPrincipal = Depends(require_review_token)) -> dict[str, Any]:
    """Store one PDF (the raw request body) as <filename> in the tender's folder."""
    if not PDF_NAME.fullmatch(filename):
        raise _bad(422, "The file name must be 1 to 120 letters, digits, dots, spaces, dashes or underscores, ending .pdf")
    folder = tender_folder(tender_id)
    _frozen(db, tender_id)
    existing = {p.name.lower() for p in folder.glob("*.pdf")} if folder.is_dir() else set()
    if filename.lower() not in existing and len(existing) >= max_tender_files():
        raise _bad(409, f"A tender holds at most {max_tender_files()} PDFs")
    folder.mkdir(parents=True, exist_ok=True)
    temp = folder / f".upload-{secrets.token_hex(6)}.tmp"
    try:
        size, sha256 = await _receive(request, max_upload_bytes(), temp)
        if size == 0:
            raise _bad(422, "The file is empty")
        pages = await run_in_threadpool(check_pdf, temp)
        os.replace(temp, folder / filename)  # whole file or nothing: an ingest never reads a half-written PDF
    finally:
        temp.unlink(missing_ok=True)
    log.info("document uploaded: tender=%s file=%s bytes=%d pages=%d by=%s", tender_id, filename, size, pages, principal.id)
    return {"filename": filename, "size_bytes": size, "sha256": sha256, "pages": pages}


@router.get("/tenders/{tender_id}/files")
def list_files(tender_id: str) -> dict[str, Any]:
    """The tender folder's PDFs, and whether its manifest is in place."""
    folder = tender_folder(tender_id)
    files = []
    if folder.is_dir():
        for path in sorted(folder.glob("*.pdf")):
            files.append({"filename": path.name, "size_bytes": path.stat().st_size})
    return {"files": files, "manifest": (folder / "manifest.json").is_file()}


@router.put("/tenders/{tender_id}/manifest")
async def put_manifest(tender_id: str, request: Request, db: Session = Depends(get_db),
                       principal: ReviewerPrincipal = Depends(require_review_token)) -> dict[str, Any]:
    """Store the tender's manifest (a JSON body) once every file it lists has been uploaded."""
    folder = tender_folder(tender_id)
    _frozen(db, tender_id)
    body = await request.body()
    if len(body) > MAX_MANIFEST_BYTES:
        raise _bad(413, "The manifest is larger than 256 KB")
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        raise _bad(422, "The manifest must be UTF-8 JSON") from None
    folder.mkdir(parents=True, exist_ok=True)
    try:
        manifest = parse_manifest(folder, text)
    except ManifestError as exc:
        raise _bad(422, str(exc)) from None
    if manifest.tender_id != tender_id:
        raise _bad(422, f"The manifest names tender {manifest.tender_id!r}, not {tender_id!r}")
    temp = folder / f".manifest-{secrets.token_hex(6)}.tmp"
    try:
        temp.write_text(text, encoding="utf-8")
        os.replace(temp, folder / "manifest.json")
    finally:
        temp.unlink(missing_ok=True)
    log.info("manifest stored: tender=%s documents=%d by=%s", tender_id, len(manifest.documents), principal.id)
    return {"tender_id": manifest.tender_id, "documents": len(manifest.documents),
            "vendors": [d.vendor_id for d in manifest.documents if d.role == "vendor_bid"]}
