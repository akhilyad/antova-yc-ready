import { useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ApiError } from '../../api/client'
import { useVerify, useWithdraw } from '../../api/queries'
import { OpenItem, type Brief } from '../../api/schemas'
import { copy } from '../../content/copy'
import { anchorFor } from '../../domain/footnotes'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import styles from './VerifyBar.module.css'

export type VerifyBarProps = {
  brief: Brief
  tenderId: string
  token: string
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/** The public link a verified brief is shared at. */
export function shareUrlFor(shareId: string): string {
  return `${window.location.origin}/b/${encodeURIComponent(shareId)}`
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** A 409 from verify: how many open items the server still counts. */
function openItemsIn(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.kind !== 'conflict') return null
  const body = error.body
  if (typeof body !== 'object' || body === null || !('open_items' in body)) return null
  const items = OpenItem.array().safeParse(body.open_items)
  return items.success ? items.data.length : null
}

/**
 * The review banner and the publish controls (spec §7.3). Draft: "Draft. Only you can see
 * this.", the open items, and *Mark verified*, which stays focusable but aria-disabled (and
 * says why) while items are open. Verified: "Verified · shared" with the share link, *Copy
 * share link* and *Withdraw brief*. Both actions confirm in a dialog first. A successful
 * verify copies the share link and presses the verified stamp once (not under reduced motion).
 */
export function VerifyBar({ brief, tenderId, token }: VerifyBarProps) {
  const verifyTitleId = useId()
  const withdrawTitleId = useId()
  const reasonId = useId()
  const statusRef = useRef<HTMLParagraphElement>(null)
  const reducedMotion = useMediaQuery(REDUCED_MOTION, true)

  const verify = useVerify(tenderId, token)
  const withdraw = useWithdraw(tenderId, token)
  const [dialog, setDialog] = useState<'verify' | 'withdraw' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [stamped, setStamped] = useState(false)

  const openItems = brief.open_items
  const blocked = openItems.length > 0
  const shareUrl = shareUrlFor(brief.share_id)
  const verified = brief.status === 'VERIFIED'

  const names = (item: OpenItem) => ({
    vendor: brief.tender.vendors.find((v) => v.id === item.vendor_id)?.name ?? item.vendor_id,
    requirement:
      item.param_id === null
        ? null
        : (brief.tender.parameters.find((p) => p.id === item.param_id)?.name ?? item.param_id),
    message: item.message,
  })

  /** Announce, and take focus: the control that opened the dialog has just been replaced. */
  const announce = (message: string) => {
    setStatus(message)
    requestAnimationFrame(() => statusRef.current?.focus())
  }

  const closeDialog = () => {
    setDialog(null)
    verify.reset()
    withdraw.reset()
  }

  const confirmVerify = () => {
    verify.mutate(undefined, {
      onSuccess: async (result) => {
        const copied = await copyText(shareUrlFor(result.share_id))
        setDialog(null)
        setStamped(true)
        announce(copied ? copy.review.verify.success : copy.review.verify.successNotCopied)
      },
    })
  }

  const confirmWithdraw = () => {
    withdraw.mutate(undefined, {
      onSuccess: () => {
        setDialog(null)
        setStamped(false)
        announce(copy.review.withdraw.success)
      },
    })
  }

  const copyLink = async () => {
    setStatus(
      (await copyText(shareUrl)) ? copy.review.verify.linkCopied : copy.review.verify.copyFailed,
    )
  }

  const verifyFailed = verify.isError
    ? (() => {
        const n = openItemsIn(verify.error)
        return n === null || n === 0 ? copy.review.verify.failed : copy.review.verify.disabled(n)
      })()
    : null

  return (
    <div className={styles.bar} data-print="hide">
      {verified ? (
        <Banner
          variant="verified"
          actions={
            <>
              <Button variant="secondary" onClick={() => void copyLink()}>
                {copy.review.verify.copyLink}
              </Button>
              <Button variant="secondary" onClick={() => setDialog('withdraw')}>
                {copy.review.withdraw.button}
              </Button>
            </>
          }
        >
          {stamped && !reducedMotion ? (
            <span className={styles.stamp} aria-hidden="true" data-testid="verified-stamp">
              {copy.review.verify.stamp}
            </span>
          ) : null}
          {copy.review.verify.banner}
        </Banner>
      ) : (
        <Banner
          variant="draft"
          actions={
            <>
              {blocked ? (
                <span id={reasonId} className={styles.reason}>
                  {copy.review.verify.disabled(openItems.length)}
                </span>
              ) : null}
              <Button
                aria-disabled={blocked || undefined}
                aria-describedby={blocked ? reasonId : undefined}
                onClick={() => {
                  if (!blocked) setDialog('verify')
                }}
              >
                {copy.review.verify.button}
              </Button>
            </>
          }
        >
          {copy.review.draftBanner}
        </Banner>
      )}

      <div className={styles.detail}>
        {verified ? (
          <p className={styles.share}>
            <span className={styles.shareLabel}>{copy.review.verify.shareLink}</span>{' '}
            <a href={shareUrl}>{shareUrl}</a>
          </p>
        ) : null}
        {!verified && blocked ? (
          <div className={styles.open}>
            <p>{copy.review.openItems(openItems.length)}</p>
            <ul className={styles.items}>
              {openItems.map((item) => {
                const text = copy.review.openItem(names(item))
                return (
                  <li key={`${item.kind}-${item.vendor_id}-${item.param_id ?? ''}`}>
                    {item.param_id === null ? (
                      text
                    ) : (
                      <Link to={{ hash: `#${anchorFor(item.vendor_id, item.param_id)}` }}>
                        {text}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
        <p ref={statusRef} role="status" tabIndex={-1} className={styles.status}>
          {status}
        </p>
      </div>

      <Dialog open={dialog === 'verify'} onClose={closeDialog} labelledBy={verifyTitleId}>
        <h2 id={verifyTitleId} className={styles.dialogTitle}>
          {copy.review.verify.dialogTitle}
        </h2>
        <p className={styles.dialogBody}>{copy.review.verify.dialogBody}</p>
        {verifyFailed !== null ? (
          <p role="alert" className={styles.error}>
            {verifyFailed}
          </p>
        ) : null}
        <div className={styles.dialogActions}>
          <Button variant="secondary" onClick={closeDialog}>
            {copy.review.verify.cancel}
          </Button>
          <Button loading={verify.isPending} onClick={confirmVerify}>
            {copy.review.verify.confirm}
          </Button>
        </div>
      </Dialog>

      <Dialog open={dialog === 'withdraw'} onClose={closeDialog} labelledBy={withdrawTitleId}>
        <h2 id={withdrawTitleId} className={styles.dialogTitle}>
          {copy.review.withdraw.dialogTitle}
        </h2>
        <p className={styles.dialogBody}>{copy.review.withdraw.dialogBody}</p>
        {withdraw.isError ? (
          <p role="alert" className={styles.error}>
            {copy.review.withdraw.failed}
          </p>
        ) : null}
        <div className={styles.dialogActions}>
          <Button variant="secondary" onClick={closeDialog}>
            {copy.review.withdraw.cancel}
          </Button>
          <Button loading={withdraw.isPending} onClick={confirmWithdraw}>
            {copy.review.withdraw.confirm}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
