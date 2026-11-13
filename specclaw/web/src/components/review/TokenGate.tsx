import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { copy } from '../../content/copy'
import { Button } from '../ui/Button'
import styles from './TokenGate.module.css'

export type TokenGateProps = {
  /** Called with the pasted token as typed; the caller stores it trimmed (review/token.ts). */
  onSubmit: (token: string) => void
  /** The server refused the last token: "That token didn't work." */
  rejected?: boolean
}

/**
 * Review access (spec §7.4): one field for the review token. A refused token comes back here
 * with the error announced and the field focused and selected, ready for another paste.
 */
export function TokenGate({ onSubmit, rejected = false }: TokenGateProps) {
  const headingId = useId()
  const inputId = useId()
  const helpId = useId()
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [empty, setEmpty] = useState(false)
  const error = empty ? copy.review.gate.empty : rejected ? copy.review.gate.error : null

  useEffect(() => {
    if (rejected) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [rejected])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (value.trim() === '') {
      setEmpty(true)
      inputRef.current?.focus()
      return
    }
    setEmpty(false)
    onSubmit(value)
  }

  return (
    <section className={styles.gate} aria-labelledby={headingId}>
      <h1 id={headingId} className={styles.heading}>
        {copy.review.gate.title}
      </h1>
      <form className={styles.form} onSubmit={submit} noValidate>
        <label htmlFor={inputId} className={styles.label}>
          {copy.review.gate.label}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className={styles.input}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={error !== null || undefined}
          aria-describedby={error !== null ? `${errorId} ${helpId}` : helpId}
        />
        <p id={helpId} className={styles.help}>
          {copy.review.gate.help}
        </p>
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
        <Button type="submit" className={styles.submit}>
          {copy.review.gate.submit}
        </Button>
      </form>
    </section>
  )
}
