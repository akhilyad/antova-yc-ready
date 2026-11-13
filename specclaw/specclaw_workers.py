"""
SpecClaw Asynchronous Queue Worker System
- Background job processing decoupling CPU/IO from HTTP requests.
- Job lifecycle state machine (PENDING -> PROCESSING -> COMPLETED/FAILED).
- Runs the real ingest pipeline on a worker thread; progress is read by polling
  GET /api/jobs/{id}.
"""

import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from specclaw_db import SessionLocal
from specclaw_ingest import extract, pipeline
from specclaw_models import JobStatus, JobStatusResponse


class BackgroundJob:
    def __init__(self, job_id: str, job_type: str, payload: Dict[str, Any]):
        self.job_id = job_id
        self.job_type = job_type
        self.payload = payload
        self.status = JobStatus.PENDING
        self.progress_pct = 0
        self.stage = "Queued in worker pipeline"
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.completed_at: Optional[str] = None
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None


class JobQueueManager:
    def __init__(self):
        self._queue: asyncio.Queue[BackgroundJob] = asyncio.Queue()
        self._jobs: Dict[str, BackgroundJob] = {}
        self._worker_task: Optional[asyncio.Task] = None
        self._running = False
        # Builds the locator for a job; tests swap in an offline one.
        self.locator_factory: Callable[[Path, str], extract.Locator] = extract.make_locator

    def start(self):
        if not self._running:
            self._running = True
            # A fresh queue per start: each app lifespan has its own event loop.
            self._queue = asyncio.Queue()
            self._worker_task = asyncio.create_task(self._worker_loop())

    async def stop(self):
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

    def enqueue_ingest_job(self, tender_id: str, mode: str) -> str:
        """Queue an ingest of the tender folder. Raises pipeline.UnknownTender for an unknown ID."""
        tender_dir = pipeline.tender_dir_for(tender_id)
        job_id = f"job-{uuid.uuid4().hex[:8]}"
        job = BackgroundJob(
            job_id=job_id,
            job_type="INGEST_PIPELINE",
            payload={"tender_id": tender_id, "tender_dir": str(tender_dir), "mode": mode},
        )
        self._jobs[job_id] = job
        self._queue.put_nowait(job)
        return job_id

    def get_job_status(self, job_id: str) -> Optional[JobStatusResponse]:
        job = self._jobs.get(job_id)
        if not job:
            return None
        return JobStatusResponse(
            job_id=job.job_id,
            status=job.status,
            progress_pct=job.progress_pct,
            stage=job.stage,
            created_at=job.created_at,
            completed_at=job.completed_at,
            result=job.result,
            error=job.error,
        )

    async def _worker_loop(self):
        while self._running:
            try:
                job = await self._queue.get()
                await self._process_job(job)
                self._queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[Worker Error] {e}")
                await asyncio.sleep(0.5)

    @staticmethod
    def _persist(result) -> list[dict]:
        db = SessionLocal()
        try:
            return pipeline.persist(result, db)
        finally:
            db.close()

    async def _process_job(self, job: BackgroundJob):
        job.status = JobStatus.PROCESSING

        def progress(stage: str, pct: int) -> None:
            job.stage, job.progress_pct = stage, pct

        try:
            tender_dir = Path(job.payload["tender_dir"])
            mode = job.payload["mode"]
            locator = self.locator_factory(tender_dir, mode)
            result = await asyncio.to_thread(
                pipeline.run_ingest, tender_dir, mode, progress, locator, job.payload["tender_id"]
            )
            cleared = await asyncio.to_thread(self._persist, result)
            job.stage, job.progress_pct = "Persist", 100
            job.result = {**result.stats, "overrides_cleared": cleared}
            job.status = JobStatus.COMPLETED
            job.completed_at = datetime.now(timezone.utc).isoformat()
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error = f"{type(e).__name__}: {e}"
            job.completed_at = datetime.now(timezone.utc).isoformat()


# Global singleton worker queue
job_manager = JobQueueManager()
