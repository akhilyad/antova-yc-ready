import { useId, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { useDeleteOverride, usePutOverride } from '../../api/queries'
import type { OverrideEntry } from '../../api/schemas'
import { copy } from '../../content/copy'
import type { CellRef } from '../../domain/footnotes'
import { toDecimalString } from '../../domain/money'
import { Button } from '../ui/Button'
import styles from './OverrideForm.module.css'

const AMOUNT = /^\d{1,8}(\.\d{1,2})?$/

/**
 * A typed euro amount to integer cents: digits, optionally a dot and one or two decimals.
 * Commas, a three-digit decimal part ("18.500") and anything else are refused rather than
 * guessed at. No floating point: the two parts are read as integers.
 */
export function parseEuroInput(
  raw: string,
): { ok: true; cents: number } | { ok: false; message: string } {
  const value = raw.trim()
  if (!AMOUNT.test(value)) return { ok: false, message: copy.review.override.amountError }
  const [whole = '0', fraction = ''] = value.split('.')
  return { ok: true, cents: Number(whole) * 100 + Number(fraction.padEnd(2, '0')) }
}

export type OverrideFormProps = {
  tenderId: string
  token: string
  cell: CellRef
  /** The cell's current override, if it has one. */
  override: OverrideEntry | undefined
  /** The brief is verified: overrides can't change until it is withdrawn (ruling R10). */
  locked: boolean
  /** The override was saved (the review page then drops its re-ingested banner). */
  onSaved?: () => void
}

type Errors = { amount?: string; note?: string }

function failureMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.kind === 'conflict'
    ? copy.review.override.locked
    : fallback
}

/**
 * The founder's override for one cell, in its sidenote (spec §7.3): a euro adder and a
 * required note. Saving replaces the rate table's adder for this cell; removing restores it.
 */
export function OverrideForm({
  tenderId,
  token,
  cell,
  override,
  locked,
  onSaved,
}: OverrideFormProps) {
  const headingId = useId()
  const amountId = useId()
  const noteId = useId()
  const amountErrorId = useId()
  const noteErrorId = useId()
  const lockedId = useId()
  const amountRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLInputElement>(null)

  const [amount, setAmount] = useState(override?.adder_eur ?? '')
  const [note, setNote] = useState(override?.note ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [status, setStatus] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const put = usePutOverride(tenderId, token)
  const remove = useDeleteOverride(tenderId, token)
  const busy = put.isPending || remove.isPending

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (locked || busy) return
    const parsed = parseEuroInput(amount)
    const next: Errors = {}
    if (!parsed.ok) next.amount = parsed.message
    if (note.trim() === '') next.note = copy.review.override.noteError
    setErrors(next)
    setStatus(null)
    setFailure(null)
    if (!parsed.ok || next.note !== undefined) {
      const first = next.amount !== undefined ? amountRef : noteRef
      first.current?.focus()
      return
    }
    put.mutate(
      { ...cell, adderEur: toDecimalString(parsed.cents), note: note.trim() },
      {
        onSuccess: () => {
          setStatus(copy.review.override.saved)
          onSaved?.()
        },
        onError: (error) => setFailure(failureMessage(error, copy.review.override.saveFailed)),
      },
    )
  }

  const clear = () => {
    if (locked || busy) return
    setStatus(null)
    setFailure(null)
    remove.mutate(cell, {
      onSuccess: () => {
        setAmount('')
        setNote('')
        setErrors({})
        setStatus(copy.review.override.removed)
      },
      onError: (error) => setFailure(failureMessage(error, copy.review.override.removeFailed)),
    })
  }

  return (
    <section aria-labelledby={headingId} className={styles.override} data-print="hide">
      <h3 id={headingId} className={styles.title}>
        {copy.review.override.heading}
      </h3>
      <form onSubmit={save} noValidate>
        <fieldset
          className={styles.fields}
          disabled={locked}
          aria-describedby={locked ? lockedId : undefined}
        >
          {locked ? (
            <p id={lockedId} className={styles.locked}>
              {copy.review.override.locked}
            </p>
          ) : null}
          <div className={styles.field}>
            <label htmlFor={amountId} className={styles.label}>
              {copy.review.override.label}
            </label>
            <input
              ref={amountRef}
              id={amountId}
              className={styles.input}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={errors.amount !== undefined || undefined}
              aria-describedby={errors.amount !== undefined ? amountErrorId : undefined}
            />
            {errors.amount !== undefined ? (
              <p id={amountErrorId} className={styles.error}>
                {errors.amount}
              </p>
            ) : null}
          </div>
          <div className={styles.field}>
            <label htmlFor={noteId} className={styles.label}>
              {copy.review.override.why}
            </label>
            <input
              ref={noteRef}
              id={noteId}
              className={styles.input}
              type="text"
              maxLength={500}
              autoComplete="off"
              placeholder={copy.review.override.whyPlaceholder}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              aria-invalid={errors.note !== undefined || undefined}
              aria-describedby={errors.note !== undefined ? noteErrorId : undefined}
            />
            {errors.note !== undefined ? (
              <p id={noteErrorId} className={styles.error}>
                {errors.note}
              </p>
            ) : null}
          </div>
          <div className={styles.actions}>
            <Button type="submit" loading={put.isPending} disabled={remove.isPending}>
              {copy.review.override.save}
            </Button>
            {override ? (
              <Button
                variant="secondary"
                loading={remove.isPending}
                disabled={put.isPending}
                onClick={clear}
              >
                {copy.review.override.remove}
              </Button>
            ) : null}
          </div>
        </fieldset>
      </form>
      {failure !== null ? (
        <p role="alert" className={styles.error}>
          {failure}
        </p>
      ) : null}
      <p role="status" className={styles.status}>
        {status}
      </p>
    </section>
  )
}
