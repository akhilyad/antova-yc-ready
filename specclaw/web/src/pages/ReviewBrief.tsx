import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import type { Scope } from '../api/client'
import { useReviewBrief, type IngestInput } from '../api/queries'
import type { Brief, OverrideEntry } from '../api/schemas'
import { BriefView } from '../components/brief/BriefView'
import { AuditModal } from '../components/modal/AuditModal'
import { OverrideForm } from '../components/review/OverrideForm'
import { ReingestConfirm } from '../components/review/ReingestConfirm'
import { RunIngestForm } from '../components/review/RunIngestForm'
import { TokenGate } from '../components/review/TokenGate'
import { VerifyBar } from '../components/review/VerifyBar'
import { Banner } from '../components/ui/Banner'
import { Button } from '../components/ui/Button'
import { copy } from '../content/copy'
import type { CellRef } from '../domain/footnotes'
import { formatAdder, toCents } from '../domain/money'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useNoIndex } from '../lib/useNoIndex'
import { reviewFailure } from '../review/access'
import { useReingestGuard } from '../review/reingest'
import { clearToken, useReviewToken } from '../review/token'
import styles from './ReviewBrief.module.css'
import type { IngestRun, ReingestedState } from './ReviewIndex'

/** Below this confidence a located value is worth a second look. */
const CONFIDENCE_FLOOR = 0.95

function overrideFor(brief: Brief, cell: CellRef) {
  return brief.overrides.find((o) => o.param_id === cell.paramId && o.vendor_id === cell.vendorId)
}

/**
 * Cells the founder should look at (spec §7.3): a low-confidence read, a contradiction, and,
 * until overridden, an unpriced gap or an item that needs inspection.
 */
function needsAttention(brief: Brief, cell: CellRef): boolean {
  const param = brief.tender.parameters.find((p) => p.id === cell.paramId)
  const extraction =
    param && Object.hasOwn(param.vendors, cell.vendorId) ? param.vendors[cell.vendorId] : undefined
  if (extraction === undefined) return false
  if (extraction.confidence < CONFIDENCE_FLOOR) return true
  if (extraction.conflict_note !== null || extraction.status === 'CONFLICT_DOWNGRADE') return true
  if (overrideFor(brief, cell) !== undefined) return false
  return (
    extraction.pricing_status === 'UNPRICED' || extraction.status === 'MANUAL_INSPECTION_REQUIRED'
  )
}

function reingestedIn(state: unknown): ReingestedState | null {
  if (typeof state !== 'object' || state === null || !('reingested' in state)) return null
  const { reingested, overridesCleared } = state as Partial<ReingestedState>
  if (typeof reingested !== 'string') return null
  return { reingested, overridesCleared: Array.isArray(overridesCleared) ? overridesCleared : [] }
}

/** One override a re-ingest cleared, with the names the brief knows it by. */
function clearedText(brief: Brief, o: OverrideEntry): string {
  return copy.review.clearedOverride({
    vendor: brief.tender.vendors.find((v) => v.id === o.vendor_id)?.name ?? o.vendor_id,
    requirement: brief.tender.parameters.find((p) => p.id === o.param_id)?.name ?? o.param_id,
    amount: formatAdder(toCents(o.adder_eur)),
    note: o.note,
  })
}

/**
 * A tender's brief in review mode at /review/:tenderId (spec §7.3): the brief as the public
 * page shows it, plus the review banner and verify controls, highlighted cells, an override
 * form in each sidenote, and *Run ingest* (this tender by default). Re-ingesting a tender whose
 * brief is verified or has overrides asks first (useReingestGuard); afterwards the banner lists
 * the overrides the re-ingest cleared until the founder dismisses it or saves an override.
 */
export default function ReviewBrief() {
  const { tenderId = '' } = useParams()
  const { token, signIn, signOut } = useReviewToken()
  const query = useReviewBrief(tenderId, token ?? '', { enabled: token !== null })
  const failure = reviewFailure(query.error)
  const location = useLocation()
  const navigate = useNavigate()
  const [run, setRun] = useState<IngestRun | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [done, setDone] = useState<ReingestedState | null>(null)
  // Kept in state, not read from the router each render: a footnote click replaces the
  // location (and its state), and the banner must stay.
  const [reingested, setReingested] = useState<ReingestedState | null>(() =>
    reingestedIn(location.state),
  )
  const gated = token === null || failure === 'unauthorized'
  const { data } = query

  useNoIndex()
  useDocumentTitle(
    copy.meta.title(
      gated
        ? copy.review.gate.title
        : data
          ? data.status === 'VERIFIED'
            ? copy.brief.kicker(data.tender.id)
            : copy.brief.draftKicker(data.tender.id)
          : copy.brief.titleLoading,
    ),
  )

  useEffect(() => {
    if (failure === 'unauthorized') clearToken()
  }, [failure])

  const launch = (input: Required<IngestInput>) => {
    setRun((last) => ({ ...input, id: (last?.id ?? 0) + 1 }))
    setDone(null)
    setModalOpen(true)
  }
  const guard = useReingestGuard(token ?? '', launch)

  if (gated) return <TokenGate onSubmit={signIn} rejected={failure === 'unauthorized'} />

  // The brief is already refetched (useLiveIngest): the banner explains the re-ingest.
  const onIngestDone = (state: ReingestedState) => {
    setDone(state)
    setReingested(state)
  }

  // Another tender's ingest opens that tender's brief once the modal closes.
  const onModalClose = () => {
    setModalOpen(false)
    if (done === null || done.reingested === tenderId) return
    navigate(`/review/${encodeURIComponent(done.reingested)}`, { state: done })
  }

  const modal =
    run !== null ? (
      <AuditModal
        key={run.id}
        open={modalOpen}
        onClose={onModalClose}
        source={{
          kind: 'live',
          tenderId: run.tenderId,
          mode: run.mode,
          token,
          onDone: (overridesCleared) =>
            onIngestDone({ reingested: run.tenderId, overridesCleared }),
        }}
      />
    ) : null

  const toolbar = (
    <div className={styles.toolbar} data-print="hide">
      <Link to="/review" className={styles.back}>
        {copy.review.allTenders}
      </Link>
      <Button variant="link" onClick={signOut} className={styles.signOut}>
        {copy.review.signOut}
      </Button>
      <details className={styles.ingest}>
        <summary className={styles.summary}>{copy.review.ingest.heading}</summary>
        <div className={styles.ingestBody}>
          <RunIngestForm defaultTenderId={tenderId} onStart={guard.start} busy={guard.checking} />
        </div>
      </details>
      {modal}
      <ReingestConfirm {...guard.confirm} />
    </div>
  )

  if (failure === 'notConfigured' || (failure === 'missing' && data === undefined)) {
    return (
      <>
        {toolbar}
        <div className="page">
          <h1>
            {failure === 'notConfigured'
              ? copy.review.notConfigured
              : copy.review.missingTender(tenderId)}
          </h1>
        </div>
      </>
    )
  }

  const errorBanner =
    failure !== null ? (
      <Banner
        variant="error"
        actions={
          <Button variant="secondary" onClick={() => void query.refetch()}>
            {copy.errors.apiUnreachableAction}
          </Button>
        }
      >
        {copy.errors.apiUnreachable}
      </Banner>
    ) : null

  if (data === undefined) {
    return (
      <>
        {toolbar}
        <div className="page">{errorBanner ?? <p aria-busy="true">{copy.brief.loading}</p>}</div>
      </>
    )
  }

  const scope: Scope = { kind: 'review', tenderId, token }
  const locked = data.status === 'VERIFIED'

  return (
    <>
      {toolbar}
      {errorBanner}
      {reingested?.reingested === tenderId ? (
        <Banner
          variant="replay"
          actions={
            <Button variant="secondary" onClick={() => setReingested(null)}>
              {copy.review.reingestedDismiss}
            </Button>
          }
          details={
            reingested.overridesCleared.length > 0 ? (
              <>
                <p>{copy.review.reingestedCleared(reingested.overridesCleared.length)}</p>
                <ul className={styles.cleared}>
                  {reingested.overridesCleared.map((o) => (
                    <li key={`${o.param_id}-${o.vendor_id}`}>{clearedText(data, o)}</li>
                  ))}
                </ul>
              </>
            ) : undefined
          }
        >
          {copy.review.reingested}
        </Banner>
      ) : null}
      <VerifyBar brief={data} tenderId={tenderId} token={token} />
      <BriefView
        brief={data}
        scope={scope}
        cellHighlight={(cell) => needsAttention(data, cell)}
        reviewSlot={(cell) => (
          <OverrideForm
            tenderId={tenderId}
            token={token}
            cell={cell}
            override={overrideFor(data, cell)}
            locked={locked}
            onSaved={() => setReingested(null)}
          />
        )}
      />
    </>
  )
}
