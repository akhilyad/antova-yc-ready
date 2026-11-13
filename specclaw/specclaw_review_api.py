"""
Founder review: inspect any tender, override adders, verify and withdraw briefs.

Every route needs the review token (the router-level dependency). Override changes
and status changes clear the leveling cache for the tender. Overrides are frozen
while a brief is VERIFIED: withdraw it first.
"""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, StringConstraints, field_validator
from sqlalchemy.orm import Session

from specclaw_auth import require_review_token
from specclaw_briefs_api import (
    LoadedTender, RatesBody, brief, evaluate, evidence_png, load_tender, not_found,
)
from specclaw_cache import leveling_cache
from specclaw_db import TenderRepository, get_db
from specclaw_ingest import clarify
from specclaw_review import evidence_hash, open_items, review_state

_CENTS = Decimal("0.01")
REVIEW_CACHE = "private, no-store"
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


class ReviewBody(BaseModel):
    """A reviewer's decision on one cell: who, what and why."""
    action: Literal["approve", "override", "reject"]
    reviewer: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)]
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


def _cell_exists(loaded: LoadedTender, param_id: str, vendor_id: str) -> bool:
    return any(p.id == param_id and vendor_id in p.vendors for p in loaded.tender.parameters)


@router.get("/tenders")
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


@router.get("/tenders/{tender_id}")
def get_tender(tender_id: str, db: Session = Depends(get_db)):
    return brief(_loaded(db, tender_id))


@router.post("/tenders/{tender_id}/evaluate")
def evaluate_tender(tender_id: str, rates: RatesBody, db: Session = Depends(get_db)):
    return evaluate(_loaded(db, tender_id), rates)


@router.get("/tenders/{tender_id}/evidence/{param_id}/{source}/{which}.png")
def get_evidence(tender_id: str, param_id: str, source: str, which: str, db: Session = Depends(get_db)):
    return evidence_png(_loaded(db, tender_id), param_id, source, which, REVIEW_CACHE)


@router.put("/tenders/{tender_id}/overrides/{param_id}/{vendor_id}", status_code=204)
def put_override(tender_id: str, param_id: str, vendor_id: str, body: OverrideBody,
                 loaded: LoadedTender = Depends(_editable), db: Session = Depends(get_db)):
    if not _cell_exists(loaded, param_id, vendor_id):
        raise not_found()
    TenderRepository(db).put_override(tender_id, param_id, vendor_id, body.adder_eur, body.note)
    leveling_cache.invalidate_tender(tender_id)
    return Response(status_code=204)


@router.delete("/tenders/{tender_id}/overrides/{param_id}/{vendor_id}", status_code=204,
               dependencies=[Depends(_editable)])
def delete_override(tender_id: str, param_id: str, vendor_id: str, db: Session = Depends(get_db)):
    if not TenderRepository(db).delete_override(tender_id, param_id, vendor_id):
        raise not_found()
    leveling_cache.invalidate_tender(tender_id)
    return Response(status_code=204)


@router.get("/tenders/{tender_id}/reviews")
def list_reviews(tender_id: str, db: Session = Depends(get_db)):
    """The tender's whole review record, oldest first."""
    _loaded(db, tender_id)
    return [{**row, "created_at": row["created_at"].isoformat()} for row in TenderRepository(db).list_reviews(tender_id)]


@router.put("/tenders/{tender_id}/reviews/{param_id}/{vendor_id}")
def put_review(tender_id: str, param_id: str, vendor_id: str, body: ReviewBody,
               loaded: LoadedTender = Depends(_editable), db: Session = Depends(get_db)):
    """Record a decision on a cell, stamped with the hash of the evidence as it stands now.

    The extracted data is never changed. To change a cell's adder, use the overrides route.
    """
    cell = next((p.vendors[vendor_id] for p in loaded.tender.parameters
                 if p.id == param_id and vendor_id in p.vendors), None)
    if cell is None:
        raise not_found()
    row = TenderRepository(db).add_review(tender_id, param_id, vendor_id, action=body.action,
                                          reviewer=body.reviewer, note=body.note, evidence_hash=evidence_hash(cell))
    leveling_cache.invalidate_tender(tender_id)
    return {**row, "created_at": row["created_at"].isoformat(), "state": review_state(cell, row)}


@router.get("/tenders/{tender_id}/clarifications.csv")
def clarifications_csv(tender_id: str, db: Session = Depends(get_db)):
    """The vendor clarification register: one templated question per gap, with the pages it rests on."""
    loaded = _loaded(db, tender_id)
    body = clarify.to_csv(clarify.clarifications(loaded.tender))
    return Response(content=body, media_type="text/csv; charset=utf-8", headers={
        "Content-Disposition": f"attachment; filename=Clarifications_{tender_id}.csv", "Cache-Control": REVIEW_CACHE})


@router.post("/tenders/{tender_id}/verify")
def verify(tender_id: str, db: Session = Depends(get_db)):
    loaded = _loaded(db, tender_id)
    remaining = open_items(loaded.tender, loaded.overrides, loaded.reviews)
    if remaining:
        return JSONResponse(status_code=409, content={
            "detail": "Open items remain", "open_items": [asdict(item) for item in remaining],
        })
    at = datetime.now(timezone.utc)  # SQLite drops the offset; UTC is what the repository assumes
    TenderRepository(db).set_status(tender_id, "VERIFIED", at)
    leveling_cache.invalidate_tender(tender_id)
    return {"share_id": loaded.meta.share_id, "verified_at": at.isoformat()}


@router.post("/tenders/{tender_id}/withdraw")
def withdraw(tender_id: str, db: Session = Depends(get_db)):
    try:
        TenderRepository(db).set_status(tender_id, "DRAFT", datetime.now(timezone.utc))
    except LookupError:
        raise not_found() from None
    leveling_cache.invalidate_tender(tender_id)
    return {"status": "DRAFT"}
