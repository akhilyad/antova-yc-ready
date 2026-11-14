"""Saving an ingest result: the one place the ingest pipeline meets the database.

specclaw_ingest computes a result and never imports the database layer; this module, which
the worker, the CLI and the dev tools call, writes it.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from specclaw_db import TenderRepository
from specclaw_ingest.types import IngestResult


def persist(result: IngestResult, db: Session, share_id: str | None = None) -> list[dict]:
    """Save the tender; returns the founder overrides the re-ingest cleared, sorted by (param_id, vendor_id).

    An override whose cell is unchanged (same evidence hash) survives the re-ingest; one whose
    cell changed or vanished is cleared and returned here so the founder can enter it again.
    `share_id` is used only if the tender is new; an existing tender keeps its share ID.
    """
    stats = result.stats
    return TenderRepository(db).save_tender(
        result.tender, result.documents, datetime.now(timezone.utc),
        ingest_mode=stats["ingest_mode"], synthetic=stats["synthetic"],
        ingest_stats={k: v for k, v in stats.items() if k != "stage_log"},
        stage_log=stats["stage_log"],
        share_id=share_id,
        run={"run_id": stats["run_id"], "fingerprint": stats["run_fingerprint"],
             "parts": result.fingerprint.get("parts", {}), "artifacts": result.artifacts} if result.artifacts else None,
    )
