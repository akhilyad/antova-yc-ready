import { useEffect, useId, useMemo, useRef } from 'react'
import { Link } from 'react-router'
import type { Brief } from '../../api/schemas'
import { copy } from '../../content/copy'
import { anchorFor } from '../../domain/footnotes'
import { buildReplay, contradictionCell, type Replay, type ReplayTiming } from '../../domain/replay'
import { formatDate } from '../../lib/formatDate'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { Button, buttonClassName } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import styles from './AuditModal.module.css'
import { DocCard } from './DocCard'
import { StageList, type StageItem, type StageState } from './StageList'
import { useLiveIngest, type LiveSource, type LiveView } from './useLiveIngest'
import { useReplay } from './useReplay'

export type AuditSource =
  /** The public replay of a recorded run; `briefHref` is the brief's page (`/b/{share_id}`). */
  | { kind: 'replay'; brief: Brief; briefHref: string }
  /** Review mode: run an ingest now and follow its job. */
  | ({ kind: 'live' } & LiveSource)

export type AuditModalProps = {
  open: boolean
  onClose: () => void
  source: AuditSource
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/** The replay script; a stage log naming a stage this build doesn't know plays at an even pace. */
function scriptFor(brief: Brief): Replay {
  try {
    return buildReplay(brief)
  } catch {
    return buildReplay({ ...brief, stage_log: [] })
  }
}

type Doc = { title: string; filename: string; pages: number }

function documentsOf(brief: Brief): Doc[] {
  const vendors = new Map(brief.tender.vendors.map((v) => [v.id, v.name]))
  return brief.documents.map((d) => {
    const vendor = d.vendor_id === null ? undefined : vendors.get(d.vendor_id)
    const title =
      d.role === 'mr_spec'
        ? copy.modal.documents.spec
        : vendor !== undefined
          ? copy.modal.documents.bid(vendor)
          : copy.brief.sectionName(d.role)
    return { title, filename: d.filename, pages: d.page_count }
  })
}

/** "Recorded 5 November 2026; …", only when the replay is sped up; no date on a draft. */
function timingText(timing: ReplayTiming | null): string | null {
  if (timing === null || timing.speedLabel === null) return null
  const seconds = String(Math.round(timing.realSeconds * 10) / 10)
  const speed = timing.speedLabel
  const date = timing.recordedAt === null ? null : formatDate(timing.recordedAt)
  return date === null
    ? copy.modal.timingUndated({ seconds, speed })
    : copy.modal.timing({ date, seconds, speed })
}

/** Stages before `active` are done; `failed` (if any) stopped; the rest wait. */
function statesFor(count: number, active: number, failed: number | null): StageState[] {
  return Array.from({ length: count }, (_, i) => {
    if (failed !== null) return i < failed ? 'done' : i === failed ? 'failed' : 'pending'
    return i < active ? 'done' : i === active ? 'active' : 'pending'
  })
}

function liveStates(view: LiveView, count: number): StageState[] {
  switch (view.phase) {
    case 'running':
      return statesFor(count, view.activeIndex, null)
    case 'done':
      return statesFor(count, count, null)
    case 'failed':
      return view.failedIndex === null
        ? statesFor(count, -1, null)
        : statesFor(count, view.failedIndex, view.failedIndex)
    default:
      return statesFor(count, -1, null)
  }
}

/**
 * The audit modal (spec §7.2): the input documents, then six steps revealed one by one, each
 * with its finding. Publicly it is a labelled replay of a recorded run, with *Skip to result*,
 * pause, a timing footer when the recording is sped up, and *Open the brief* at the end. In
 * review mode it runs a live ingest instead and follows the job until it completes or fails.
 * A completed step is announced in a polite live region. Under reduced motion every step is
 * shown complete at once.
 */
export function AuditModal({ open, onClose, source }: AuditModalProps) {
  const titleId = useId()
  const docsId = useId()
  const announceRef = useRef<HTMLParagraphElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useMediaQuery(REDUCED_MOTION, true)

  const replayBrief = source.kind === 'replay' ? source.brief : null
  const script = useMemo(
    () => (replayBrief === null ? null : scriptFor(replayBrief)),
    [replayBrief],
  )
  const replay = useReplay(script, { reducedMotion, active: open && script !== null })
  const { view, retry } = useLiveIngest(source.kind === 'live' ? source : null)

  const liveBrief = view.phase === 'done' ? view.brief : null
  const liveScript = useMemo(() => (liveBrief === null ? null : scriptFor(liveBrief)), [liveBrief])

  const labels = copy.modal.stages
  let stages: StageItem[]
  let docs: Doc[]
  let done: boolean
  if (script !== null && replayBrief !== null) {
    const states = statesFor(script.stages.length, replay.activeIndex, null)
    stages = script.stages.map((s, i) => ({
      label: s.label,
      finding: s.finding,
      state: states[i] ?? 'pending',
      durationMs: s.durationMs,
    }))
    docs = documentsOf(replayBrief)
    done = replay.done
  } else {
    const states = liveStates(view, labels.length)
    stages = labels.map((label, i) => ({
      label,
      finding: liveScript?.stages[i]?.finding ?? null,
      state: states[i] ?? 'pending',
    }))
    docs = liveBrief === null ? [] : documentsOf(liveBrief)
    done = view.phase === 'done'
  }
  const docState: StageState = stages[0]?.state ?? 'pending'

  const completed = stages.filter((s) => s.state === 'done')
  const last = completed.at(-1)
  const announcement = done
    ? copy.modal.allDone
    : last
      ? copy.modal.stageDone({ label: last.label, finding: last.finding })
      : ''

  // The region is rendered empty and filled after each commit, so the change is announced.
  useEffect(() => {
    if (announceRef.current) announceRef.current.textContent = announcement
  }, [announcement, open])

  // When the control that had focus goes away (Skip, Pause, Watch again), focus moves to the
  // first action of the new state instead of falling to the page.
  const phase = source.kind === 'replay' ? (done ? 'done' : 'playing') : view.phase
  useEffect(() => {
    if (!open) return
    const active = document.activeElement
    if (active !== null && active !== document.body) return
    actionsRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus()
  }, [phase, open])

  let actions = null
  if (source.kind === 'replay') {
    const cell = contradictionCell(source.brief.tender)
    const href =
      cell === null
        ? source.briefHref
        : `${source.briefHref}#${anchorFor(cell.vendorId, cell.paramId)}`
    actions = done ? (
      <>
        <Link
          key="open"
          to={href}
          className={buttonClassName('primary', styles.linkButton)}
          onClick={onClose}
        >
          {copy.modal.openBrief}
        </Link>
        {reducedMotion ? null : (
          <Button key="again" variant="secondary" onClick={replay.restart}>
            {copy.modal.watchAgain}
          </Button>
        )}
      </>
    ) : (
      <>
        <Button
          key="pause"
          variant="secondary"
          onClick={replay.paused ? replay.play : replay.pause}
        >
          {replay.paused ? copy.modal.play : copy.modal.pause}
        </Button>
        <Button key="skip" variant="link" onClick={replay.skip}>
          {copy.modal.skip}
        </Button>
      </>
    )
  } else if (view.phase === 'done') {
    actions = <Button onClick={onClose}>{copy.modal.openBrief}</Button>
  } else if (view.phase === 'failed') {
    actions = <Button onClick={retry}>{copy.modal.tryAgain}</Button>
  }

  const timing = source.kind === 'replay' ? timingText(script?.timing ?? null) : null
  const tenderId = source.kind === 'replay' ? source.brief.tender.id : source.tenderId

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} size="wide">
      <div className={styles.modal}>
        {/* div, not header/footer: portalled to body, those would be a second banner and
            contentinfo beside the site's own. */}
        <div className={styles.head}>
          <div className={styles.heading}>
            <span className={styles.chip}>
              {source.kind === 'replay' ? copy.modal.chipRecorded : copy.modal.chipLive}
            </span>
            <h2 id={titleId} className={styles.title}>
              {source.kind === 'replay'
                ? copy.modal.title(tenderId)
                : copy.modal.liveTitle(tenderId)}
            </h2>
          </div>
          <Button variant="link" onClick={onClose} className={styles.close}>
            {copy.ui.close}
          </Button>
        </div>

        <div className={docs.length > 0 ? styles.columns : undefined}>
          {docs.length > 0 ? (
            <section className={styles.docs}>
              <h3 id={docsId} className={styles.sectionHeading}>
                {copy.modal.documents.heading}
              </h3>
              <ul className={styles.docList} aria-labelledby={docsId}>
                {docs.map((d) => (
                  <DocCard key={d.filename} {...d} state={docState} />
                ))}
              </ul>
            </section>
          ) : null}
          <div className={styles.steps}>
            {view.phase === 'queued' ? <p className={styles.note}>{copy.modal.queued}</p> : null}
            <StageList
              stages={stages}
              label={copy.modal.stagesHeading}
              reducedMotion={reducedMotion}
              paused={replay.paused}
            />
            {view.phase === 'failed' ? (
              <p role="alert" className={styles.failure}>
                {view.message}
              </p>
            ) : null}
          </div>
        </div>

        <p ref={announceRef} role="status" className="visually-hidden" />

        {timing !== null || actions !== null ? (
          <div className={styles.foot}>
            {timing !== null ? <p className={styles.timing}>{timing}</p> : null}
            <div ref={actionsRef} className={styles.actions}>
              {actions}
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
