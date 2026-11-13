import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useReviewTenders, type IngestInput } from '../api/queries'
import type { OverrideEntry } from '../api/schemas'
import { AuditModal } from '../components/modal/AuditModal'
import { ReingestConfirm } from '../components/review/ReingestConfirm'
import { RunIngestForm } from '../components/review/RunIngestForm'
import { TokenGate } from '../components/review/TokenGate'
import { Banner } from '../components/ui/Banner'
import { Button } from '../components/ui/Button'
import { copy } from '../content/copy'
import { formatDate } from '../lib/formatDate'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useNoIndex } from '../lib/useNoIndex'
import { reviewFailure } from '../review/access'
import { useReingestGuard } from '../review/reingest'
import { clearToken, useReviewToken } from '../review/token'
import styles from './ReviewIndex.module.css'

/**
 * Router state a completed ingest leaves for the brief it opens: which tender was re-ingested,
 * and the overrides it cleared, so the brief's banner can list them for re-entry.
 */
export type ReingestedState = { reingested: string; overridesCleared: OverrideEntry[] }

/** One *Run ingest* submission; `id` keys the audit modal so each run starts its own job. */
export type IngestRun = Required<IngestInput> & { id: number }

/**
 * The founder's tender list at /review (spec §7.4): behind the token gate, every tender with
 * its status and open items, and *Run ingest*, which follows the job in the audit modal (live
 * mode); a tender whose brief is verified or has overrides asks first (useReingestGuard). A
 * completed job opens the tender's brief with the re-ingested banner (ruling R22): when the
 * founder closes the modal, so its findings stay readable, or at once if the modal was already
 * closed mid-run.
 */
export default function ReviewIndex() {
  const { token, signIn, signOut } = useReviewToken()
  const query = useReviewTenders(token ?? '', { enabled: token !== null })
  const failure = reviewFailure(query.error)
  const navigate = useNavigate()
  const ingestHeadingId = useId()
  const folderRef = useRef<HTMLInputElement>(null)
  const [run, setRun] = useState<IngestRun | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [done, setDone] = useState<ReingestedState | null>(null)
  // A token typed into the gate stays on the gate until the server first answers, so a wrong
  // one never flashes the tender list and the field keeps what was pasted.
  const [submitted, setSubmitted] = useState(false)
  const gated = token === null || failure === 'unauthorized' || (submitted && query.isPending)
  const submitToken = (value: string) => {
    setSubmitted(true)
    signIn(value)
  }

  const launch = (input: Required<IngestInput>) => {
    setRun((last) => ({ ...input, id: (last?.id ?? 0) + 1 }))
    setDone(null)
    setModalOpen(true)
  }
  const guard = useReingestGuard(token ?? '', launch)

  useNoIndex()
  useDocumentTitle(copy.meta.title(gated ? copy.review.gate.title : copy.review.index.heading))

  // A refused token is not kept for the next visit.
  useEffect(() => {
    if (failure === 'unauthorized') clearToken()
  }, [failure])

  if (gated) return <TokenGate onSubmit={submitToken} rejected={failure === 'unauthorized'} />

  const openBrief = (state: ReingestedState) =>
    navigate(`/review/${encodeURIComponent(state.reingested)}`, { state })

  // The brief is already refetched (useLiveIngest). useLiveIngest calls the latest onDone, so
  // `modalOpen` here is current when the job completes.
  const onIngestDone = (state: ReingestedState) => {
    if (modalOpen) setDone(state)
    else openBrief(state)
  }

  const onModalClose = () => {
    setModalOpen(false)
    if (done !== null) openBrief(done)
  }

  const tenders = query.data
  let body
  if (failure === 'notConfigured') {
    body = <Banner variant="error">{copy.review.notConfigured}</Banner>
  } else if (failure !== null && tenders === undefined) {
    body = (
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
    )
  } else if (tenders === undefined) {
    body = <p aria-busy="true">{copy.review.index.loading}</p>
  } else if (tenders.length === 0) {
    const empty = copy.review.indexEmpty
    body = (
      <p className={styles.empty}>
        {empty.lead}
        <code>{empty.command}</code>
        {empty.or}
        <Button variant="link" onClick={() => folderRef.current?.focus()}>
          {empty.action}
        </Button>
        {empty.end}
      </p>
    )
  } else {
    const columns = copy.review.index.columns
    body = (
      <div
        className={styles.scroll}
        role="region"
        aria-label={copy.review.index.caption}
        tabIndex={0}
      >
        <table className={styles.table}>
          <caption className="visually-hidden">{copy.review.index.caption}</caption>
          <thead>
            <tr>
              {/* Status and open items first: they are what the founder scans for. */}
              <th scope="col">{columns.tender}</th>
              <th scope="col">{columns.status}</th>
              <th scope="col" className={styles.number}>
                {columns.openItems}
              </th>
              <th scope="col">{columns.title}</th>
              <th scope="col">{columns.ingested}</th>
              <th scope="col">{columns.verified}</th>
            </tr>
          </thead>
          <tbody>
            {tenders.map((t) => (
              <tr key={t.tender_id}>
                <th scope="row" className={styles.id}>
                  <Link to={`/review/${encodeURIComponent(t.tender_id)}`}>{t.tender_id}</Link>
                </th>
                <td className={styles.status}>{copy.review.index.status[t.status]}</td>
                <td className={`${styles.number} ${t.open_items > 0 ? styles.open : ''}`}>
                  {copy.review.index.openItemCount(t.open_items)}
                </td>
                <td className={styles.title}>{t.title}</td>
                <td>{formatDate(t.ingested_at)}</td>
                <td>{t.verified_at ? formatDate(t.verified_at) : copy.review.index.notVerified}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1>{copy.review.index.heading}</h1>
        <Button variant="link" onClick={signOut}>
          {copy.review.signOut}
        </Button>
      </div>
      {body}
      {failure === 'notConfigured' ? null : (
        <section aria-labelledby={ingestHeadingId} className={styles.ingest}>
          <h2 id={ingestHeadingId} className={styles.ingestHeading}>
            {copy.review.ingest.heading}
          </h2>
          <RunIngestForm onStart={guard.start} inputRef={folderRef} busy={guard.checking} />
        </section>
      )}
      <ReingestConfirm {...guard.confirm} />
      {run !== null ? (
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
      ) : null}
    </div>
  )
}
