"""
Public briefs: a verified evaluation, keyed by its unguessable share ID.

No token. Every miss (unknown share ID, a brief that is not VERIFIED, a missing
evidence crop) answers the same 404 body, so a probe learns nothing. The loading
and rendering helpers here are shared with the founder review routes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from antova_db import TenderMeta, TenderRepository, get_db
from antova_engine import Override, SensitivitySettings, TenderPackage, evaluate_vendor_financials
from antova_models import BriefResponse, EvaluateResponse
from antova_evidence import EvidenceNotFound, citation_for, document_path, render_crop
from antova_review import brief_payload, public_brief_payload

NOT_FOUND = "Not found"
# Short, so a withdrawn brief's crops leave shared caches within minutes.
PUBLIC_CACHE = "public, max-age=300"

router = APIRouter(prefix="/api/briefs", tags=["Briefs"])


class RatesBody(BaseModel):
    """The brief's sensitivity sliders; the same bounds as /api/evaluate."""
    copper_multiplier: float = Field(default=1.0, ge=0.5, le=2.5)
    site_labor_rate: Optional[float] = Field(default=None, ge=20.0, le=200.0)  # unset: the table's rate
    freight_multiplier: float = Field(default=1.0, ge=0.5, le=2.5)


@dataclass
class LoadedTender:
    """Everything a brief is built from."""
    tender: TenderPackage
    meta: TenderMeta
    documents: list[dict]
    overrides: dict[tuple[str, str], Override]
    reviews: dict[tuple[str, str], dict] = field(default_factory=dict)


def not_found() -> HTTPException:
    return HTTPException(status_code=404, detail=NOT_FOUND)


def load_tender(db: Session, tender_id: str) -> Optional[LoadedTender]:
    repo = TenderRepository(db)
    meta = repo.get_meta(tender_id)
    tender = repo.load_tender(tender_id) if meta is not None else None
    if tender is None:
        return None
    return LoadedTender(tender, meta, repo.list_documents(tender_id), repo.get_overrides(tender_id),
                        repo.latest_reviews(tender_id))


def brief(loaded: LoadedTender) -> dict:
    return brief_payload(loaded.tender, loaded.meta, loaded.documents, loaded.overrides, SensitivitySettings(),
                         loaded.reviews)


def evaluate(loaded: LoadedTender, rates: RatesBody) -> dict:
    sensitivity = SensitivitySettings(**rates.model_dump())
    return {"financials": evaluate_vendor_financials(loaded.tender, sensitivity, [], overrides=loaded.overrides)}


def evidence_png(loaded: LoadedTender, param_id: str, source: str, which: str, cache_control: str) -> Response:
    """The crop for one stored citation. Filename, page and bbox come only from the stored citation."""
    try:
        citation = citation_for(loaded.tender, param_id, source, which)
        known = {d["filename"] for d in loaded.documents}
        path = document_path(loaded.meta.tender_id, citation["filename"], known)
        png = render_crop(path, citation["page"], tuple(citation["bbox"]))
    except EvidenceNotFound:
        raise not_found() from None
    return Response(content=png, media_type="image/png", headers={"Cache-Control": cache_control})


def _verified(db: Session, share_id: str) -> LoadedTender:
    tender_id = TenderRepository(db).tender_id_for_share(share_id)
    loaded = load_tender(db, tender_id) if tender_id is not None else None
    if loaded is None or loaded.meta.status != "VERIFIED":
        raise not_found()
    return loaded


@router.get("/{share_id}", response_model=BriefResponse)
def get_brief(share_id: str, db: Session = Depends(get_db)):
    return public_brief_payload(brief(_verified(db, share_id)))


@router.post("/{share_id}/evaluate", response_model=EvaluateResponse)
def evaluate_brief(share_id: str, rates: RatesBody, db: Session = Depends(get_db)):
    return evaluate(_verified(db, share_id), rates)


@router.get("/{share_id}/evidence/{param_id}/{source}/{which}.png")
def get_evidence(share_id: str, param_id: str, source: str, which: str, db: Session = Depends(get_db)):
    return evidence_png(_verified(db, share_id), param_id, source, which, PUBLIC_CACHE)
