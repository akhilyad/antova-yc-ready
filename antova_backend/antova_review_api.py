"""
Founder review: inspect any tender, override adders, verify and withdraw briefs.

Every route needs the review token (the router-level dependency). Overrides are frozen
while a brief is VERIFIED: withdraw it first.
"""

from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, StringConstraints, field_validator
from sqlalchemy.orm import Session

from antova_auth import ReviewerPrincipal, require_review_token
from antova_briefs_api import (
    LoadedTender, RatesBody, brief, evaluate, evidence_png, load_tender, not_found,
)
from antova_db import TenderRepository, get_db
from antova_models import (
    BriefResponse, ConflictResponse, EvaluateResponse, ReviewPutResponse, ReviewRow, ReviewTenderRow,
    VerifyResponse, WithdrawResponse,
)
from antova_export import XLSX_TYPE, clarifications_xlsx, tbe_workbook
from antova_ingest import clarify
from antova_review import evidence_hash, open_items, review_state

_CENTS = Decimal("0.01")
REVIEW_CACHE = "private, no-store"
log = logging.getLogger(__name__)
OVERRIDES_LOCKED = "Withdraw the brief before changing overrides"

router = APIRouter(prefix="/api/review", tags=["Review"], dependencies=[Depends(require_review_token)])


class OverrideBody(BaseModel):
    """A founder's euro adder for one cell: 0 to 10 million, whole cents, with a reason."""
    adder_eur: Decimal = Field(ge=0, le=10_000_000, allow_inf_nan=False)
    note: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]

    @field_validator("adder_eur")
    @classmethod
    def _whole_cents(cls, value: Decimal) -> Decimal:
        if value != value.quantize(_CENTS):
            raise ValueError("adder_eur has at most 2 decimal places")
        return value.copy_abs().quantize(_CENTS)  # copy_abs: -0 is 0


class VerifyBody(BaseModel):
    """What the reviewer was looking at. Optional: without it, verify still refuses a tender that was
    replaced while the request ran, but cannot tell that it differs from what the reviewer saw."""
    run_id: Annotated[str, StringConstraints(max_length=64)] | None = None


class ReviewBody(BaseModel):
    """A reviewer's decision on one cell: what and why. Who is the server's call, from the token."""
    action: Literal["approve", "override", "reject"]
    # Older clients send a name here. It is accepted and ignored: the reviewer recorded is the one
    # the token belongs to, so a client cannot sign a decision as someone else.
    reviewer: Annotated[str, StringConstraints(strip_whitespace=True, max_length=128)] | None = None
    note: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


def _loaded(db: Session, tender_id: str) -> LoadedTender:
    loaded = load_tender(db, tender_id)
    if loaded is None:
        raise not_found()
    return loaded


def _editable(tender_id: str, db: Session = Depends(get_db)) -> LoadedTender:
    """The tender whose overrides may change: 404 if unknown, 409 while its brief is VERIFIED.

    A dependency, so it runs before the request body is validated.
    """
    loaded = _loaded(db, tender_id)
    if loaded.meta.status == "VERIFIED":
        raise HTTPException(status_code=409, detail=OVERRIDES_LOCKED)
    return loaded


@router.get("/tenders", response_model=list[ReviewTenderRow])
def list_tenders(db: Session = Depends(get_db)):
    """Newest ingest first, with the count of open items that block verifying each."""
    rows = []
    for meta in TenderRepository(db).list_meta():
        loaded = load_tender(db, meta.tender_id)
        rows.append({
            "tender_id": meta.tender_id,
            "title": meta.title,
            "status": meta.status,
            "share_id": meta.share_id,
            "ingested_at": meta.ingested_at.isoformat(),
            "verified_at": meta.verified_at.isoformat() if meta.verified_at is not None else None,
            "open_items": len(open_items(loaded.tender, loaded.overrides, loaded.reviews)),
        })
    return rows


@router.get("/tenders/{tender_id}", response_model=BriefResponse)
def get_tender(tender_id: str, db: Session = Depends(get_db)):
    return brief(_loaded(db, tender_id))


@router.post("/tenders/{tender_id}/evaluate", response_model=EvaluateResponse)
def evaluate_tender(tender_id: str, rates: RatesBody, db: Session = Depends(get_db)):
    return evaluate(_loaded(db, tender_id), rates)


@router.get("/tenders/{tender_id}/evidence/{param_id}/{source}/{which}.png")
def get_evidence(tender_id: str, param_id: str, source: str, which: str, db: Session = Depends(get_db)):
    return evidence_png(_loaded(db, tender_id), param_id, source, which, REVIEW_CACHE)


@router.put("/tenders/{tender_id}/overrides/{param_id}/{vendor_id}", status_code=204)
def put_override(tender_id: str, param_id: str, vendor_id: str, body: OverrideBody,
                 loaded: LoadedTender = Depends(_editable), db: Session = Depends(get_db),
                 principal: ReviewerPrincipal = Depends(require_review_token)):
    cell = next((p.vendors[vendor_id] for p in loaded.tender.parameters
                 if p.id == param_id and vendor_id in p.vendors), None)
    if cell is None:
        raise not_found()
    # Stamped with the cell as the founder sees it now: a re-ingest keeps the override only while it is unchanged.
    TenderRepository(db).put_override(tender_id, param_id, vendor_id, body.adder_eur, body.note,
                                      evidence_hash(cell), set_by=principal.id)
    log.info("override set: tender=%s cell=%s/%s by=%s", tender_id, param_id, vendor_id, principal.id)
    return Response(status_code=204)


@router.delete("/tenders/{tender_id}/overrides/{param_id}/{vendor_id}", status_code=204,
               dependencies=[Depends(_editable)])
def delete_override(tender_id: str, param_id: str, vendor_id: str, db: Session = Depends(get_db),
                    principal: ReviewerPrincipal = Depends(require_review_token)):
    if not TenderRepository(db).delete_override(tender_id, param_id, vendor_id):
        raise not_found()
    log.info("override deleted: tender=%s cell=%s/%s by=%s", tender_id, param_id, vendor_id, principal.id)
    return Response(status_code=204)


@router.get("/tenders/{tender_id}/reviews", response_model=list[ReviewRow])
def list_reviews(tender_id: str, db: Session = Depends(get_db)):
    """The tender's whole review record, oldest first."""
    _loaded(db, tender_id)
    return [{**row, "created_at": row["created_at"].isoformat()} for row in TenderRepository(db).list_reviews(tender_id)]


@router.put("/tenders/{tender_id}/reviews/{param_id}/{vendor_id}", response_model=ReviewPutResponse)
def put_review(tender_id: str, param_id: str, vendor_id: str, body: ReviewBody,
               loaded: LoadedTender = Depends(_editable), db: Session = Depends(get_db),
               principal: ReviewerPrincipal = Depends(require_review_token)):
    """Record a decision on a cell, stamped with the hash of the evidence as it stands now.

    The extracted data is never changed. To change a cell's adder, use the overrides route.
    """
    cell = next((p.vendors[vendor_id] for p in loaded.tender.parameters
                 if p.id == param_id and vendor_id in p.vendors), None)
    if cell is None:
        raise not_found()
    row = TenderRepository(db).add_review(tender_id, param_id, vendor_id, action=body.action,
                                          reviewer=principal.id, note=body.note, evidence_hash=evidence_hash(cell))
    log.info("review recorded: tender=%s cell=%s/%s action=%s by=%s", tender_id, param_id, vendor_id,
             body.action, principal.id)
    return {**row, "created_at": row["created_at"].isoformat(), "state": review_state(cell, row)}


def _clarification_rows(loaded: LoadedTender, vendor: str | None) -> list[dict]:
    """The clarification questions, for one vendor when `vendor` is given (404 if it is not in the tender).

    A vendor's rows quote only its own bid and the buyer's requirement: no other bidder's name, price or
    citation, so one vendor's file can be sent to that vendor as it is.
    """
    if vendor is not None and vendor not in {v.id for v in loaded.tender.vendors}:
        raise not_found()
    rows = clarify.clarifications(loaded.tender)
    return rows if vendor is None else [r for r in rows if r["vendor_id"] == vendor]


def _attachment(body: bytes | str, media_type: str, name: str) -> Response:
    return Response(content=body, media_type=media_type, headers={
        "Content-Disposition": f"attachment; filename={name}", "Cache-Control": REVIEW_CACHE})


@router.get("/tenders/{tender_id}/clarifications.csv")
def clarifications_csv(tender_id: str, vendor: Annotated[str | None, Query(max_length=64)] = None,
                       db: Session = Depends(get_db)):
    """The vendor clarification register: one templated question per gap, with the pages it rests on.
    `?vendor=<id>` limits it to one vendor, ready to send to them."""
    loaded = _loaded(db, tender_id)
    suffix = f"_{vendor}" if vendor else ""
    return _attachment(clarify.to_csv(_clarification_rows(loaded, vendor)), "text/csv; charset=utf-8",
                       f"Clarifications_{tender_id}{suffix}.csv")


@router.get("/tenders/{tender_id}/clarifications.xlsx")
def clarifications_xlsx_route(tender_id: str, vendor: Annotated[str | None, Query(max_length=64)] = None,
                              db: Session = Depends(get_db)):
    """The same register as a spreadsheet."""
    loaded = _loaded(db, tender_id)
    suffix = f"_{vendor}" if vendor else ""
    return _attachment(clarifications_xlsx(_clarification_rows(loaded, vendor)), XLSX_TYPE,
                       f"Clarifications_{tender_id}{suffix}.xlsx")


@router.get("/tenders/{tender_id}/export-tbe.xlsx", responses={409: {"model": ConflictResponse}})
def export_tbe(tender_id: str, db: Session = Depends(get_db)):
    """The verified evaluation as a workbook: summary, leveling, every priced cell, the overrides and
    reviews behind it, and the clarification log. Only a VERIFIED brief can be exported."""
    loaded = _loaded(db, tender_id)
    if loaded.meta.status != "VERIFIED":
        return JSONResponse(status_code=409, content={"detail": "Verify the brief before exporting it"})
    payload = brief(loaded)
    cells_by_key = {(p.id, vid): c for p in loaded.tender.parameters for vid, c in p.vendors.items()}
    cells = []
    for f in payload["financials"]:
        for item in f["itemized_breakdown"]:
            cell = cells_by_key[(item["param_id"], f["vendor_id"])]
            source = cell.citation
            cells.append({
                "vendor_id": f["vendor_id"], "param_id": item["param_id"], "param_name": item["param_name"],
                "criticality": item["criticality"], "status": item["status"], "adder_eur": item["adder_eur"],
                "pricing_status": item["pricing_status"], "is_overridden": item["is_overridden"],
                "override_note": item["override_note"], "formula": cell.adder_formula or "",
                "source": f"{source['filename']} p.{source['page']}" if source else "",
            })
    repo = TenderRepository(db)
    body = tbe_workbook(
        brief=payload, tender_title=loaded.tender.title, client=loaded.tender.client,
        equipment_class=loaded.tender.equipment_class, rate_table_version=loaded.tender.rate_table_version,
        cells=cells, override_rows=repo.list_override_rows(tender_id), reviews=repo.list_reviews(tender_id),
        clarification_rows=clarify.clarifications(loaded.tender), verified_by=loaded.meta.verified_by,
        generated_at=datetime.now(timezone.utc))
    return _attachment(body, XLSX_TYPE, f"TBE_{tender_id}.xlsx")


RUN_CHANGED = {
    "detail": "This tender was ingested again after you opened it. Reload it and check it before verifying.",
    "code": "run_changed",
}


def _open_items_conflict(items) -> JSONResponse:
    return JSONResponse(status_code=409, content={
        "detail": "Open items remain", "open_items": [asdict(item) for item in items],
    })


@router.post("/tenders/{tender_id}/verify", response_model=VerifyResponse, responses={409: {"model": ConflictResponse}})
def verify(tender_id: str, body: VerifyBody | None = None, db: Session = Depends(get_db),
           principal: ReviewerPrincipal = Depends(require_review_token)):
    """Publish a brief, once, if it is the run the reviewer saw and nothing blocks it.

    The check and the change are one transaction: the tender row is claimed first (which takes
    SQLite's write lock), and the open items are counted again from what is stored at that moment.
    A re-ingest, a deleted override or a withdrawn review landing between the reviewer's last read
    and this call therefore either shows up as a conflict or cannot happen.
    """
    loaded = _loaded(db, tender_id)
    run_id = loaded.meta.ingest_stats.get("run_id")
    if body is not None and body.run_id is not None and body.run_id != run_id:
        return JSONResponse(status_code=409, content=RUN_CHANGED)
    remaining = open_items(loaded.tender, loaded.overrides, loaded.reviews)
    if remaining:
        return _open_items_conflict(remaining)
    at = datetime.now(timezone.utc)  # SQLite drops the offset; UTC is what the repository assumes
    repo = TenderRepository(db)
    try:
        if not repo.claim_verification(tender_id, loaded.meta.ingested_at, at, principal.id, run_id):
            db.rollback()
            return JSONResponse(status_code=409, content=RUN_CHANGED)
        db.expire_all()  # read what is stored now, not what this session cached
        again = load_tender(db, tender_id)
        remaining = open_items(again.tender, again.overrides, again.reviews) if again is not None else []
        if remaining:
            db.rollback()
            return _open_items_conflict(remaining)
        db.commit()
    except Exception:
        db.rollback()
        raise
    log.info("brief verified: tender=%s run=%s by=%s", tender_id, run_id, principal.id)
    return {"share_id": loaded.meta.share_id, "verified_at": at.isoformat()}


@router.post("/tenders/{tender_id}/withdraw", response_model=WithdrawResponse)
def withdraw(tender_id: str, db: Session = Depends(get_db),
             principal: ReviewerPrincipal = Depends(require_review_token)):
    try:
        TenderRepository(db).set_status(tender_id, "DRAFT", datetime.now(timezone.utc))
    except LookupError:
        raise not_found() from None
    log.info("brief withdrawn: tender=%s by=%s", tender_id, principal.id)
    return {"status": "DRAFT"}
