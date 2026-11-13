import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import {
  invalidateAfterIngest,
  queryKeys,
  useJob,
  useReviewBrief,
  useStartIngest,
  type IngestMode,
} from '../../api/queries'
import type { Brief, Job, OverrideEntry } from '../../api/schemas'
import { copy } from '../../content/copy'
import { STAGE_KEYS, stageForBackend } from '../../domain/replay'

export type LiveSource = {
  tenderId: string
  mode: IngestMode
  token: string
  /**
   * The job completed and the tender's brief has been refetched. Called once per job, with
   * the overrides the re-ingest cleared (the job store is in memory: this is the one copy).
   */
  onDone: (overridesCleared: OverrideEntry[]) => void
}

export type LiveView =
  | { phase: 'idle' }
  /** Starting the job, or the worker hasn't picked it up yet. */
  | { phase: 'queued' }
  /** Stages before `activeIndex` are done; `activeIndex` equals the stage count while saving. */
  | { phase: 'running'; activeIndex: number }
  /** `brief` is the refetched brief the findings come from; null if it couldn't be read. */
  | { phase: 'done'; brief: Brief | null }
  /** `failedIndex` is the stage that stopped, when it is known. */
  | { phase: 'failed'; failedIndex: number | null; message: string }

/** The worker's stage text before the pipeline reports its first stage (specclaw_workers.py). */
export const QUEUED_STAGE = 'Queued in worker pipeline'

/**
 * Backend stages that report part of a plain stage's work: after Intake, the documents are
 * still being read (Parse belongs to the same plain stage).
 */
const PARTIAL_STAGES = new Set(['Intake'])

/**
 * The plain stage running after the pipeline reported `stage`. A report comes when its stage
 * finishes (specclaw_ingest/pipeline.py), so after "Parse" the next plain stage is under way.
 * Throws on a stage name it doesn't know (via stageForBackend).
 */
function runningIndex(stage: string): number {
  if (stage === QUEUED_STAGE) return 0
  const index = STAGE_KEYS.indexOf(stageForBackend(stage))
  return PARTIAL_STAGES.has(stage) ? index : index + 1
}

function failedView(job: Job): LiveView {
  let failedIndex: number | null
  try {
    failedIndex = Math.min(runningIndex(job.stage), STAGE_KEYS.length - 1)
  } catch {
    failedIndex = null
  }
  const stage = failedIndex === null ? job.stage : (copy.modal.stages[failedIndex] ?? job.stage)
  return {
    phase: 'failed',
    failedIndex,
    message: copy.modal.failure({ stage, error: job.error ?? '' }),
  }
}

/** The running index a processing job's stage maps to, or null for a stage this build doesn't know. */
function reportedIndex(stage: string): number | null {
  try {
    return Math.min(runningIndex(stage), STAGE_KEYS.length)
  } catch {
    return null
  }
}

/**
 * A live ingest for the audit modal in review mode (spec §7.2): starts the job once, follows
 * it through useJob (the one place a job is polled), and maps the backend's stages to the six
 * plain ones. When the job completes, the tender's review brief, tender list and public briefs
 * are refetched; then the findings come from the fresh brief and `onDone` fires. Idle while
 * `source` is null. Mount one per run (a new `key`): the job starts on mount.
 */
export function useLiveIngest(source: LiveSource | null): { view: LiveView; retry(): void } {
  const client = useQueryClient()
  const token = source?.token ?? ''
  const tenderId = source?.tenderId ?? ''
  const start = useStartIngest(token)
  const [jobId, setJobId] = useState<string | null>(null)
  const [refreshedJob, setRefreshedJob] = useState<string | null>(null)
  const started = useRef(false)
  const notified = useRef<string | null>(null)

  const job = useJob(jobId, token)
  // A running job reporting a stage this build doesn't know (a newer backend) stays at the last
  // stage it did know, never "failed": that would offer Try again while the job still runs, a
  // second ingest of the same tender (ruling R27). Kept as state set during render.
  const reported = job.data?.status === 'PROCESSING' ? reportedIndex(job.data.stage) : null
  const [lastActive, setLastActive] = useState(0)
  if (reported !== null && reported !== lastActive) setLastActive(reported)
  const completed = job.data?.status === 'COMPLETED'
  const brief = useReviewBrief(tenderId, token, { enabled: source !== null && completed })
  const finished = completed && jobId !== null && refreshedJob === jobId

  const begin = (run: LiveSource) =>
    start.mutate(
      { tenderId: run.tenderId, mode: run.mode },
      { onSuccess: (result) => setJobId(result.job_id) },
    )
  const launch = useEffectEvent(() => {
    if (source !== null) begin(source)
  })

  useEffect(() => {
    if (source === null || started.current) return
    started.current = true
    launch()
  }, [source])

  // Completed: refetch what the ingest changed before showing findings from the brief.
  useEffect(() => {
    if (!completed || jobId === null || tenderId === '') return
    let current = true
    void invalidateAfterIngest(client, tenderId, token).then(() => {
      if (current) setRefreshedJob(jobId)
    })
    return () => {
      current = false
    }
  }, [completed, jobId, tenderId, token, client])

  const reportDone = useEffectEvent(() => source?.onDone(job.data?.result?.overrides_cleared ?? []))
  useEffect(() => {
    if (!finished || jobId === null || notified.current === jobId) return
    notified.current = jobId
    reportDone()
  }, [finished, jobId])

  const retry = () => {
    if (source === null) return
    if (jobId !== null) client.removeQueries({ queryKey: queryKeys.job(jobId, token) })
    setJobId(null)
    setRefreshedJob(null)
    setLastActive(0)
    start.reset()
    begin(source)
  }

  let view: LiveView
  const data = job.data
  // The job store is in memory: after an API restart the job is a 404 while the last
  // PROCESSING poll is still cached, so a 404 on an unfinished job means lost. A finished job
  // keeps its result: a later refetch (on window focus) that 404s changes nothing.
  const final = data?.status === 'COMPLETED' || data?.status === 'FAILED'
  const lost = job.error instanceof ApiError && job.error.kind === 'not_found' && !final
  if (source === null) {
    view = { phase: 'idle' }
  } else if (start.isError) {
    view = { phase: 'failed', failedIndex: null, message: copy.review.ingest.startFailed }
  } else if (lost) {
    view = { phase: 'failed', failedIndex: null, message: copy.modal.jobLost }
  } else if (data === undefined) {
    view = job.isError
      ? { phase: 'failed', failedIndex: null, message: copy.modal.jobLost }
      : { phase: 'queued' }
  } else if (data.status === 'FAILED') {
    view = failedView(data)
  } else if (data.status === 'COMPLETED') {
    view = finished
      ? { phase: 'done', brief: brief.isError ? null : (brief.data ?? null) }
      : { phase: 'running', activeIndex: STAGE_KEYS.length }
  } else if (data.status === 'PENDING') {
    view = { phase: 'queued' }
  } else {
    view = { phase: 'running', activeIndex: reported ?? lastActive }
  }
  return { view, retry }
}
