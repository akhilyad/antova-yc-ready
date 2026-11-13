"""
SpecClaw Enterprise FastAPI Production Service

- Tenders come from the ingest pipeline (specclaw_ingest) and are read from the
  database; nothing here is hardcoded tender data.
- Background ingest jobs, WebSocket telemetry, TTL caching of leveling results,
  audit ledger for negotiation rounds, PDF deviation-closure export.
"""

import os
import time
from contextlib import asynccontextmanager
from typing import Dict, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.orm import Session

import specclaw_engine as engine
import specclaw_pdf as pdf_engine
from specclaw_auth import REVIEW_HEADER, require_review_token
from specclaw_briefs_api import router as briefs_router
from specclaw_cache import leveling_cache
from specclaw_db import (  # noqa: F401  (record classes re-exported for callers)
    ExtractedParameterRecord, ParameterRecord, SessionLocal, TenderRecord, TenderRepository,
    VendorRecord, get_db, init_db,
)
from specclaw_ingest import config
from specclaw_review import open_items, unresolved_flags
from specclaw_ingest.pipeline import UnknownTender
from specclaw_models import DownloadPdfRequest, EvaluateRequest, IngestJobRequest, JobStatusResponse
from specclaw_review_api import router as review_router
from specclaw_telemetry import telemetry_manager
from specclaw_workers import job_manager

NOT_INGESTED = "Tender not ingested yet — POST /api/jobs/ingest"
PERFORMANCE_FEE = 0.15
# Parameters the negotiating vendor concedes in each scripted negotiation round.
NEGOTIATION_ROUNDS = {
    1: [],
    2: ["PARAM-01", "PARAM-03", "PARAM-05"],
    3: ["PARAM-01", "PARAM-02", "PARAM-03", "PARAM-05", "PARAM-06"],
}


# --- FASTAPI LIFESPAN MANAGEMENT ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    config.validate_config()  # an ontology or rate-table gap stops the service at startup
    job_manager.start()
    print("[SpecClaw Engine] Production services initialized with lifespan management.")
    yield
    await job_manager.stop()
    print("[SpecClaw Engine] Production services shut down cleanly.")


app = FastAPI(
    title="SpecClaw — Autonomous TBE & Spec-Deviation Clawback Engine",
    description="Deterministic Engineering-Procurement Leveling Architecture (YC RFS 2027)",
    version="2.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("ANTOVA_ALLOWED_ORIGINS", "").split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", REVIEW_HEADER],
)

app.include_router(briefs_router)
app.include_router(review_router)


def _load_tender(db: Session, tender_id: str) -> engine.TenderPackage:
    tender = TenderRepository(db).load_tender(tender_id) if tender_id else None
    if tender is None:
        raise HTTPException(status_code=404, detail=NOT_INGESTED)
    return tender


def _negotiating(tender: engine.TenderPackage, vendor_id: Optional[str] = None) -> engine.Vendor:
    """The vendor whose deviations are being closed: the named one, else the lowest true evaluated price (A2)."""
    if vendor_id is not None:
        vendor = next((v for v in tender.vendors if v.id == vendor_id), None)
        if vendor is None:
            raise HTTPException(status_code=404, detail=f"Unknown vendor {vendor_id}")
        if not vendor.headline_price:
            raise HTTPException(status_code=409, detail=f"{vendor_id} has no headline price to negotiate on")
        return vendor
    chosen = engine.negotiating_vendor_id(tender)
    vendor = next((v for v in tender.vendors if v.id == chosen), None)
    if vendor is None:
        raise HTTPException(status_code=409, detail="No vendor is fully priced, so there is no one to negotiate with")
    return vendor


# --- PRESENTATION & STATIC ENDPOINTS ---

@app.get("/", response_class=HTMLResponse, tags=["Presentation"])
def serve_home():
    html_path = os.path.join(os.path.dirname(__file__), "specclaw_interactive_mvp.html")
    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h1>SpecClaw Engine Active</h1><p>specclaw_interactive_mvp.html not found.</p>")


@app.get("/favicon.ico", tags=["Presentation"])
def serve_favicon():
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#06b6d4"/><text y="70" font-size="60" font-family="sans-serif" font-weight="900" fill="#020617" x="15">SC</text></svg>"""
    return Response(content=svg, media_type="image/svg+xml")


@app.get("/specclaw_ui_bundle.js", tags=["Presentation"])
@app.get("/static/specclaw_ui_bundle.js", tags=["Presentation"])
def serve_ui_bundle():
    bundle_path = os.path.join(os.path.dirname(__file__), "specclaw_ui_bundle.js")
    if os.path.exists(bundle_path):
        with open(bundle_path, "r", encoding="utf-8") as f:
            return Response(content=f.read(), media_type="application/javascript")
    raise HTTPException(status_code=404, detail="specclaw_ui_bundle.js not found")


# --- CORE API ENDPOINTS ---

@app.get("/api/health", tags=["System"])
def health_check():
    return {
        "status": "healthy",
        "system": "SpecClaw Deterministic Validation Engine",
        "version": "2.1.0-production",
        "pint_version": engine.pint.__version__,
        "cache": leveling_cache.get_stats(),
        "telemetry": telemetry_manager.get_stats()
    }


@app.get("/api/tender", tags=["Tenders"], dependencies=[Depends(require_review_token)])
def get_tender(tender_id: str = Query(...), db: Session = Depends(get_db)):
    return _load_tender(db, tender_id)


@app.post("/api/evaluate", tags=["Evaluation"], dependencies=[Depends(require_review_token)])
async def evaluate_tender(req: EvaluateRequest, db: Session = Depends(get_db)):
    """
    Evaluates vendor financials with parametric sensitivity controls, cached per
    tender and settings, and broadcasts the result over WebSockets.
    """
    start_time = time.perf_counter()
    tender = _load_tender(db, req.tender_id)
    sensitivity_dict = {
        "copper_multiplier": req.copper_multiplier,
        "site_labor_rate": req.site_labor_rate,
        "freight_multiplier": req.freight_multiplier
    }

    # The tender's revision is its run ID (the run fingerprint plus what every stage produced)
    # and its ingest timestamp: a result computed from an earlier run or an earlier ingest is
    # never served for a later one, even if it reached the cache after the re-ingest cleared it.
    meta = TenderRepository(db).get_meta(tender.id)
    revision = ""
    if meta is not None:
        revision = f"{meta.ingest_stats.get('run_id', '')}@{meta.ingested_at.isoformat() if meta.ingested_at else ''}"
    # A named negotiating vendor is part of what was asked, so it is part of the cache key.
    revision = f"{revision}#{req.vendor_id or ''}"
    cached_data = leveling_cache.get(tender.id, sensitivity_dict, req.conceded_params, revision)
    if cached_data:
        cached_data["cached"] = True
        cached_data["evaluation_time_ms"] = round((time.perf_counter() - start_time) * 1000, 3)
        return cached_data

    sensitivity = engine.SensitivitySettings(**sensitivity_dict)
    repo = TenderRepository(db)
    reviews = repo.latest_reviews(tender.id)
    open_flag_count = unresolved_flags(tender, reviews)
    blocking = open_items(tender, repo.get_overrides(tender.id), reviews)
    choice = engine.negotiating_choice(tender, sensitivity)
    negotiating = _negotiating(tender, req.vendor_id).id if req.vendor_id else choice["vendor_id"]
    # A vendor with no usable headline price has a null true evaluated price (never 0 + adders).
    financials = engine.evaluate_vendor_financials(tender, sensitivity, req.conceded_params, negotiating or "")
    vendor = next((f for f in financials if f["vendor_id"] == negotiating), None)
    clawback_value = vendor["clawed_back_amount"] if vendor else 0.0
    performance_fee = round(clawback_value * PERFORMANCE_FEE, 2)
    net_epc_savings = round(clawback_value - performance_fee, 2)

    duration_ms = round((time.perf_counter() - start_time) * 1000, 3)
    response_payload = {
        "tender_id": tender.id,
        "financials": financials,
        "negotiating_vendor": {**choice, "closing_with": negotiating},
        "rank_flip": engine.rank_flip(financials),
        # A person approves every flag: until then, and until the brief is verified, this is a draft.
        "open_flags": open_flag_count,
        "final": bool(meta is not None and meta.status == "VERIFIED" and open_flag_count == 0 and not blocking),
        "summary": {
            "clawback_value_eur": clawback_value,
            "specclaw_15pct_fee_eur": performance_fee,
            "net_epc_savings_eur": net_epc_savings
        },
        "cached": False,
        "evaluation_time_ms": duration_ms
    }
    leveling_cache.set(tender.id, sensitivity_dict, req.conceded_params, response_payload, revision)

    # The socket is public: no tender ID and no money figures.
    await telemetry_manager.broadcast("LEVELING_EVALUATED", {"evaluation_ms": duration_ms})
    return response_payload


# --- NEGOTIATION STATE MACHINE & AUDIT LEDGER ---

@app.post("/api/negotiate/turn", tags=["Negotiation"], dependencies=[Depends(require_review_token)])
async def negotiate_turn(
    round_num: int = Query(..., ge=1, le=3),
    tender_id: str = Query(...),
    vendor_id: Optional[str] = Query(None, description="Close deviations with this vendor instead of the lowest true price"),
    db: Session = Depends(get_db)
):
    """Advances negotiation state, persists an audit record, and broadcasts the turn."""
    conceded = NEGOTIATION_ROUNDS.get(round_num, [])
    tender = _load_tender(db, tender_id)
    vendor = _negotiating(tender, vendor_id)

    financials = engine.evaluate_vendor_financials(tender, engine.SensitivitySettings(), conceded, vendor.id)
    result = next(f for f in financials if f["vendor_id"] == vendor.id)
    clawed = result["clawed_back_amount"]
    fee = round(clawed * PERFORMANCE_FEE, 2)
    savings = round(clawed - fee, 2)

    record = TenderRepository(db).log_negotiation_round(
        tender_id=tender.id,
        round_num=round_num,
        vendor_id=vendor.id,
        clawed_amount=clawed,
        performance_fee=fee,
        net_savings=savings,
        conceded_items=conceded
    )

    # The socket is public: no tender ID and no money figures.
    await telemetry_manager.broadcast("NEGOTIATION_ROUND_ADVANCED", {
        "round": round_num,
        "conceded_count": len(conceded)
    })

    return {
        "round": round_num,
        "vendor_id": vendor.id,
        "clawed_amount": clawed,
        "performance_fee": fee,
        "net_savings": savings,
        "conceded_items": conceded,
        "audit_id": record.id
    }


@app.get("/api/audit-trail", tags=["Negotiation"], dependencies=[Depends(require_review_token)])
def get_audit_trail(tender_id: str = Query(...), db: Session = Depends(get_db)):
    repo = TenderRepository(db)
    return [
        {
            "id": r.id,
            "round": r.negotiation_round,
            "vendor_id": r.vendor_id,
            "clawed_amount": r.clawed_amount,
            "performance_fee": r.performance_fee,
            "net_savings": r.net_savings,
            "conceded_items": r.conceded_items.split(",") if r.conceded_items else [],
            "created_at": r.created_at.isoformat() if r.created_at else None
        }
        for r in repo.get_audit_trail(tender_id)
    ]


# --- BACKGROUND JOBS (QUEUE WORKERS) ---

@app.post("/api/jobs/ingest", response_model=Dict[str, str], tags=["Jobs"], dependencies=[Depends(require_review_token)])
def start_ingest_job(req: IngestJobRequest):
    """Queues a real ingest of the tender folder (MR spec + vendor bids)."""
    try:
        job_id = job_manager.enqueue_ingest_job(tender_id=req.tender_id, mode=req.mode)
    except UnknownTender as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"job_id": job_id, "status": "QUEUED"}


@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse, tags=["Jobs"], dependencies=[Depends(require_review_token)])
def get_job_status(job_id: str):
    status_resp = job_manager.get_job_status(job_id)
    if not status_resp:
        raise HTTPException(status_code=404, detail="Job not found")
    return status_resp


# --- CACHE MANAGEMENT ---

@app.get("/api/cache/stats", tags=["System"], dependencies=[Depends(require_review_token)])
def get_cache_stats():
    return leveling_cache.get_stats()


@app.post("/api/cache/invalidate", tags=["System"], dependencies=[Depends(require_review_token)])
def invalidate_cache():
    count = leveling_cache.invalidate_tender()
    return {"message": "Cache invalidated", "entries_evicted": count}


# --- PDF EXPORT ---

@app.post("/api/export-pdf", tags=["Export"], dependencies=[Depends(require_review_token)])
def export_pdf(req: DownloadPdfRequest, tender_id: str = Query(...), vendor_id: Optional[str] = Query(None),
               db: Session = Depends(get_db)):
    tender = _load_tender(db, tender_id)
    vendor = _negotiating(tender, vendor_id)
    raw_params = []
    for p in tender.model_dump()["parameters"]:
        raw_params.append({
            "id": p["id"],
            "name": p["name"],
            "mrRequirement": p["mr_requirement"],
            "vendors": {
                vid: {
                    "extracted": v["extracted_text"],
                    "bbox": v["bbox"],
                    "costAdder": v["cost_adder"]
                } for vid, v in p["vendors"].items()
            }
        })

    # Every summary figure is computed for the negotiating vendor and the items it conceded.
    # Round 1 is the opening position: nothing is conceded yet.
    conceded = list(req.conceded_params) if req.negotiation_round >= 2 else []
    financials = engine.evaluate_vendor_financials(tender, engine.SensitivitySettings(), conceded, vendor.id)
    result = next(f for f in financials if f["vendor_id"] == vendor.id)
    pdf_bytes = pdf_engine.generate_deviation_closure_pdf(
        tender_id=tender.id,
        tender_title=tender.title,
        vendor_name=vendor.name,
        negotiation_round=req.negotiation_round,
        conceded_items=conceded,
        total_clawed_back=result["clawed_back_amount"],
        parameters=raw_params,
        vendor_id=vendor.id,
        headline_price=vendor.headline_price,
        total_adders=round(result["total_adders"] + result["clawed_back_amount"], 2),
        open_adders=result["total_adders"],
        buyer_name=tender.client,
        open_flags=unresolved_flags(tender, TenderRepository(db).latest_reviews(tender.id)),
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=SpecClaw_PO_Attachment_{tender.id}_Rev{req.negotiation_round}.pdf"
        }
    )


# --- WEBSOCKET REALTIME TELEMETRY ---

@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """Real-time telemetry connection with ping/pong heartbeats and stage events."""
    await telemetry_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await telemetry_manager.handle_client_message(websocket, data)
    except WebSocketDisconnect:
        await telemetry_manager.disconnect(websocket)
    except Exception:
        await telemetry_manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("specclaw_api:app", host="127.0.0.1", port=8000, reload=True)
