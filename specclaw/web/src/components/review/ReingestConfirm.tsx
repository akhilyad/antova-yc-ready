import { useId } from 'react'
import { copy } from '../../content/copy'
import type { ReingestGuard } from '../../review/reingest'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import styles from './ReingestConfirm.module.css'

/**
 * Asks before a re-ingest that takes a brief back to draft or clears its overrides (spec
 * §7.4), naming the tender being re-ingested and what it loses, or giving a generic warning
 * when its brief couldn't be read. Open while a run is pending (useReingestGuard).
 */
export function ReingestConfirm({ pending, onConfirm, onCancel }: ReingestGuard['confirm']) {
  const titleId = useId()
  return (
    <Dialog open={pending !== null} onClose={onCancel} labelledBy={titleId}>
      {pending !== null ? (
        <>
          <h2 id={titleId} className={styles.title}>
            {copy.review.reingestConfirm.title(pending.tenderId)}
          </h2>
          <p className={styles.body}>
            {pending.risk === 'unknown'
              ? copy.review.reingestConfirm.unknownBody
              : copy.review.reingestConfirm.body(pending.risk)}
          </p>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onCancel}>
              {copy.review.reingestConfirm.cancel}
            </Button>
            <Button onClick={onConfirm}>{copy.review.reingestConfirm.confirm}</Button>
          </div>
        </>
      ) : null}
    </Dialog>
  )
}
