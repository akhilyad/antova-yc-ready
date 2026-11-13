"""Write the frontend's test fixtures from the synthetic sample. Development and tests only.

    python -m specclaw_ingest.export_fixtures <out_dir>

Ingests samples/TENDER-2026-402 in memory with the answer-key locator (no database, no
Claude API) and renders the same payloads the API serves. The output is a contract: it is
committed under web/src/test/fixtures/ and a test checks it matches a fresh export byte
for byte, so everything is deterministic: sorted keys, fixed timestamps, fixed stage
timings (representative of a live run, not measured), LF line endings.
"""

from __future__ import annotations

import argparse
import itertools
import json
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from specclaw_db import TenderMeta
from specclaw_engine import Override, SensitivitySettings, TenderPackage, evaluate_vendor_financials
from specclaw_ingest.pipeline import STAGES, run_ingest
from specclaw_ingest.tests.fakes import PACK, AnswerKeyLocator, load_expected
from specclaw_models import JobStatus, JobStatusResponse
from specclaw_review import _override_entries, brief_payload, open_items, public_brief_payload

SHARE_ID = "e2e-sample-share-id-000000"
FIXED_AT = datetime(2026, 11, 5, tzinfo=timezone.utc)
FIXED_ISO = FIXED_AT.isoformat()  # 2026-11-05T00:00:00+00:00
JOB_ID = "job-e2e00001"
# Milliseconds since start at which each stage reported, as a live run would record them.
STAGE_T_MS = [15, 2840, 41260, 41390, 41520, 41580, 41660]
DURATION_S = 41.7
LATENCY_SEC = 42
# The real values change with every edit to the pipeline's source, so the fixtures carry fixed ones.
RUN_FINGERPRINT = "f" * 64
RUN_ID = "e2e0" * 8

PARITY_COPPER = [0.5, 1.0, 1.15, 2.5]
PARITY_LABOUR = [20.0, 60.0, 87.5, 200.0]
PARITY_FREIGHT = [0.5, 1.0, 2.5]
PARITY_OVERRIDE_NOTE = "Parity case: founder priced the gap from the vendor's clarification"
PARITY_OVERRIDE = {("PARAM-02", "vendor-b"): Override(adder_eur=Decimal("10000.00"), note=PARITY_OVERRIDE_NOTE)}

DRAFT_CELL = ("PARAM-05", "vendor-c")  # made unpriced in the draft brief, so it is an open item
FAILED_ERROR = "IngestFailed: ExtractError: locate request for Bid_vendor-b_VoltSwitch.pdf failed"


def _ingest() -> tuple[TenderPackage, list[dict], dict]:
    """The sample's tender, document list and stats, with the run's timings replaced by fixed ones."""
    result = run_ingest(PACK, locator=AnswerKeyLocator(load_expected()))
    stats = dict(result.stats)
    stats["stage_log"] = [{"stage": stage, "pct": pct, "t_ms": t_ms}
                          for (stage, pct), t_ms in zip(STAGES, STAGE_T_MS, strict=True)]
    stats["duration_s"] = DURATION_S
    stats["run_fingerprint"] = RUN_FINGERPRINT
    stats["run_id"] = RUN_ID
    tender = result.tender.model_copy(update={"latency_sec": LATENCY_SEC})
    documents = [{"filename": d.filename, "role": d.role, "vendor_id": d.vendor_id, "page_count": d.page_count}
                 for d in result.documents]
    return tender, documents, stats


def _meta(tender: TenderPackage, stats: dict, status: str) -> TenderMeta:
    return TenderMeta(
        tender_id=tender.id, title=tender.title, share_id=SHARE_ID, status=status,
        verified_at=FIXED_AT if status == "VERIFIED" else None, ingested_at=FIXED_AT,
        ingest_mode=stats["ingest_mode"], synthetic=stats["synthetic"],
        ingest_stats={k: v for k, v in stats.items() if k != "stage_log"}, stage_log=stats["stage_log"],
    )


def _draft_tender(tender: TenderPackage) -> TenderPackage:
    """A deep copy with the draft cell unpriced; the verified tender is left as it is."""
    draft = tender.model_copy(deep=True)
    param_id, vendor_id = DRAFT_CELL
    cell = next(p for p in draft.parameters if p.id == param_id).vendors[vendor_id]
    cell.pricing_status = "UNPRICED"
    cell.cost_lines = []
    cell.cost_adder = 0.0
    return draft


def _review_row(meta: TenderMeta, tender: TenderPackage) -> dict:
    """One row of GET /api/review/tenders."""
    return {
        "tender_id": meta.tender_id,
        "title": meta.title,
        "status": meta.status,
        "share_id": meta.share_id,
        "ingested_at": meta.ingested_at.isoformat(),
        "verified_at": meta.verified_at.isoformat() if meta.verified_at is not None else None,
        "open_items": len(open_items(tender, {})),
    }


def _parity_cases(tender: TenderPackage) -> list[dict]:
    cases = []
    for copper, labour, freight, overrides in itertools.product(
            PARITY_COPPER, PARITY_LABOUR, PARITY_FREIGHT, [{}, PARITY_OVERRIDE]):
        sensitivity = SensitivitySettings(copper_multiplier=copper, site_labor_rate=labour,
                                          freight_multiplier=freight)
        financials = evaluate_vendor_financials(tender, sensitivity, [], overrides=overrides)
        cases.append({
            "rates": {"copper": copper, "labour": labour, "freight": freight},
            "overrides": _override_entries(overrides),
            "expected": [{key: f[key] for key in ("vendor_id", "total_tech_penalty", "total_commercial_adder",
                                                   "true_evaluated_price")} for f in financials],
        })
    return cases


def _job(status: JobStatus, stage: str, pct: int, result: dict | None = None, error: str | None = None) -> dict:
    """A GET /api/jobs/{id} body."""
    finished = status in (JobStatus.COMPLETED, JobStatus.FAILED)
    return JobStatusResponse(
        job_id=JOB_ID, status=status, progress_pct=pct, stage=stage, created_at=FIXED_ISO,
        completed_at=FIXED_ISO if finished else None, result=result, error=error,
    ).model_dump(mode="json")


def _jobs(stats: dict) -> dict:
    processing = [*STAGES, ("Persist", 100)]  # the worker reports Persist after the pipeline's stages
    last_stage, last_pct = STAGES[1]  # failed while locating: Parse was the last stage reported
    return {
        "start": {"job_id": JOB_ID, "status": "QUEUED"},  # POST /api/jobs/ingest
        "queued": _job(JobStatus.PENDING, "Queued in worker pipeline", 0),
        "processing": [_job(JobStatus.PROCESSING, stage, pct) for stage, pct in processing],
        "completed": _job(JobStatus.COMPLETED, "Persist", 100,
                          result={**stats, "overrides_cleared": _override_entries(PARITY_OVERRIDE)}),
        "failed": _job(JobStatus.FAILED, last_stage, last_pct, error=FAILED_ERROR),
    }


def build() -> dict[str, Any]:
    """Every fixture, keyed by file name."""
    tender, documents, stats = _ingest()
    verified_meta = _meta(tender, stats, "VERIFIED")
    draft = _draft_tender(tender)
    draft_meta = _meta(draft, stats, "DRAFT")
    defaults = SensitivitySettings()
    return {
        # GET /api/briefs/{share_id} (public, no run cost) and GET /api/review/tenders/{id} (the founder's).
        "verified-brief.json": public_brief_payload(brief_payload(tender, verified_meta, documents, {}, defaults)),
        "draft-brief.json": brief_payload(draft, draft_meta, documents, {}, defaults),
        "review-list.json": [_review_row(draft_meta, draft)],
        "parity-cases.json": _parity_cases(tender),
        "jobs.json": _jobs(stats),
    }


def export(out_dir: Path) -> list[Path]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for name, data in build().items():
        path = out_dir / name
        with path.open("w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(data, sort_keys=True, indent=2, ensure_ascii=False) + "\n")
        written.append(path)
    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m specclaw_ingest.export_fixtures",
                                     description=__doc__.splitlines()[0])
    parser.add_argument("out_dir", type=Path)
    args = parser.parse_args(argv)
    for path in export(args.out_dir):
        print(path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
