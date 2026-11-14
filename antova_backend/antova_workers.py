"""
Ingest job worker.

- A job's status lives in the database (`ingest_jobs`), so it survives a restart and
  GET /api/jobs/{id} answers from any process.
- The queue itself is in memory and has one worker. A job that was queued or running when the
  process stopped cannot resume: start() marks it FAILED ("interrupted"), and the user submits it
  again. A live (paid) run is never started again automatically.
- Runs the real ingest pipeline on a worker thread; progress is read by polling the job.
"""

import asyncio
import logging
import time
import uuid
from pathlib import Path
from typing import Callable, Dict, Optional

from fastapi.encoders import jsonable_encoder

from antova_db import SessionLocal, TenderRepository
from antova_ingest import extract, pipeline
from antova_ingest.extract import ExtractError
from antova_models import JobStatus, JobStatusResponse
from antova_service import persist

log = logging.getLogger(__name__)

INTERRUPTED = "Interrupted: the service restarted before this job finished. Submit it again."


def _repo_call(fn: Callable[[TenderRepository], object]):
    """Run `fn` with a repository on its own short session (jobs are written from worker threads)."""
    db = SessionLocal()
    try:
        return fn(TenderRepository(db))
    finally:
        db.close()


class JobQueueManager:
    def __init__(self):
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        # tender_id -> job_id of the job this process queued or is running for it.
        self._active: Dict[str, str] = {}
        self._worker_task: Optional[asyncio.Task] = None
        self._running = False
        # Builds the locator for a job; tests swap in an offline one.
        self.locator_factory: Callable[[Path, str], extract.Locator] = extract.make_locator

    def start(self):
        if not self._running:
            self._running = True
            # Jobs left over from a previous process or app lifespan will never run.
            interrupted = _repo_call(lambda repo: repo.fail_unfinished_jobs(INTERRUPTED))
            if interrupted:
                log.warning("marked %d unfinished ingest job(s) as interrupted", interrupted)
            # A fresh queue per start: each app lifespan has its own event loop.
            self._queue = asyncio.Queue()
            self._active = {}
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
        """Queue an ingest of the tender folder. Raises pipeline.UnknownTender for an unknown ID.

        A tender with a job already queued or running in this process gets that job's ID back
        instead of a second job: two ingests of one tender would race to replace its rows.
        """
        pipeline.tender_dir_for(tender_id)
        existing = self._active.get(tender_id)
        if existing is not None:
            return existing
        job_id = f"job-{uuid.uuid4().hex[:8]}"
        _repo_call(lambda repo: repo.create_job(job_id, tender_id, mode))
        self._active[tender_id] = job_id
        self._queue.put_nowait(job_id)
        return job_id

    def get_job_status(self, job_id: str) -> Optional[JobStatusResponse]:
        row = _repo_call(lambda repo: repo.get_job(job_id))
        if row is None:
            return None
        return JobStatusResponse(
            job_id=row["job_id"],
            status=JobStatus(row["status"]),
            progress_pct=row["progress_pct"],
            stage=row["stage"],
            created_at=row["created_at"].isoformat(),
            completed_at=row["completed_at"].isoformat() if row["completed_at"] else None,
            result=row["result"],
            error=row["error"],
        )

    async def _worker_loop(self):
        while self._running:
            try:
                job_id = await self._queue.get()
                await self._process_job(job_id)
                self._queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception:
                log.exception("ingest worker loop error")
                await asyncio.sleep(0.5)

    @staticmethod
    def _persist(result) -> list[dict]:
        db = SessionLocal()
        try:
            return persist(result, db)
        finally:
            db.close()

    async def _process_job(self, job_id: str):
        job = _repo_call(lambda repo: repo.get_job(job_id))
        if job is None:
            return
        tender_id = job["tender_id"]
        started = time.perf_counter()
        log.info("ingest job %s started: tender=%s mode=%s", job_id, tender_id, job["mode"])
        _repo_call(lambda repo: repo.update_job(job_id, status="PROCESSING"))

        def progress(stage: str, pct: int) -> None:
            _repo_call(lambda repo: repo.update_job(job_id, progress_pct=pct, stage=stage))

        try:
            tender_dir = pipeline.tender_dir_for(tender_id)
            mode = job["mode"]
            locator = self.locator_factory(tender_dir, mode)
            result = await asyncio.to_thread(pipeline.run_ingest, tender_dir, mode, progress, locator, tender_id)
            cleared = await asyncio.to_thread(self._persist, result)
            _repo_call(lambda repo: repo.update_job(
                job_id, status="COMPLETED", progress_pct=100, stage="Persist", finished=True,
                result=jsonable_encoder({**result.stats, "overrides_cleared": cleared})))
            log.info("ingest job %s completed: tender=%s %.1fs, %d override(s) cleared", job_id, tender_id,
                     time.perf_counter() - started, len(cleared))
        except Exception as e:
            # An ingest that fails for a reason about the documents (a bad manifest, an unreadable MR, a
            # model refusal) is an outcome, not a bug: a warning. Anything else is logged with its traceback.
            if isinstance(e, (pipeline.IngestFailed, pipeline.UnknownTender, ExtractError)):
                log.warning("ingest job %s failed: tender=%s: %s", job_id, tender_id, e)
            else:
                log.exception("ingest job %s crashed: tender=%s", job_id, tender_id)
            _repo_call(lambda repo: repo.update_job(
                job_id, status="FAILED", finished=True, error=f"{type(e).__name__}: {e}"))
        finally:
            if self._active.get(tender_id) == job_id:
                del self._active[tender_id]


# Global singleton worker queue
job_manager = JobQueueManager()
