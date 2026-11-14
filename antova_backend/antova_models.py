"""
API contracts: what the HTTP routes accept and return.

The domain model (tenders, vendors, cells, cost lines) lives in antova_engine; this module
holds only the request and response shapes of the routes, so /docs and /openapi.json describe
them. Fields whose content is the domain model, or varies with the run, are typed as
dict[str, Any] on purpose: they are the engine's own JSON, and the web client validates them
with its own schemas (web/src/api/schemas.ts).
"""

from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from antova_ingest.parse import TENDER_ID_PATTERN


# --- ingest jobs ---------------------------------------------------------------------------------

class JobStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class IngestJobRequest(BaseModel):
    # Older UI builds also send document_count / ocr_mode; they are accepted and ignored.
    model_config = ConfigDict(extra="ignore")
    tender_id: str = Field(..., pattern=TENDER_ID_PATTERN, description="Tender folder under the tenders root")
    mode: Literal["replay", "auto", "live"] = Field(
        default="auto", description="replay: saved model responses only; auto: reuse or call; live: always call"
    )


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress_pct: int
    stage: str
    created_at: str
    completed_at: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


# --- briefs and review ---------------------------------------------------------------------------

class BriefResponse(BaseModel):
    """GET /api/briefs/{share_id} and GET /api/review/tenders/{id}: one tender's evaluation."""
    share_id: str
    status: Literal["DRAFT", "VERIFIED"]
    verified_at: Optional[str] = None
    synthetic: bool
    ingest_mode: str
    ingest_stats: Dict[str, Any]
    stage_log: List[Dict[str, Any]]
    documents: List[Dict[str, Any]]
    tender: Dict[str, Any]
    financials: List[Dict[str, Any]]
    overrides: List[Dict[str, Any]]
    open_items: List[Dict[str, Any]]
    review: Dict[str, Any]


class EvaluateResponse(BaseModel):
    """POST .../evaluate: every vendor's financials under the given sliders."""
    financials: List[Dict[str, Any]]


class ReviewTenderRow(BaseModel):
    """One tender in the founder's list."""
    tender_id: str
    title: str
    status: Literal["DRAFT", "VERIFIED"]
    share_id: str
    ingested_at: str
    verified_at: Optional[str] = None
    open_items: int


class ReviewRow(BaseModel):
    """One recorded decision on one cell."""
    id: int
    tender_id: str
    param_id: str
    vendor_id: str
    action: Literal["approve", "override", "reject"]
    reviewer: str
    note: str
    evidence_hash: str
    created_at: str


class ReviewPutResponse(ReviewRow):
    state: str = Field(description="none, open, reviewed, stale or rejected: the cell's state after this decision")


class VerifyResponse(BaseModel):
    share_id: str
    verified_at: str


class WithdrawResponse(BaseModel):
    status: Literal["DRAFT"]


class ConflictResponse(BaseModel):
    """A 409: open items still block verification, or the tender changed since the reviewer read it."""
    detail: str
    open_items: Optional[List[Dict[str, Any]]] = None
    code: Optional[str] = Field(default=None, description="run_changed when the tender was ingested again")
