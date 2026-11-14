import { useId, useState, type FormEvent, type Ref } from 'react'
import type { IngestInput, IngestMode } from '../../api/queries'
import { copy } from '../../content/copy'
import { Button } from '../ui/Button'
import styles from './RunIngestForm.module.css'

/** The backend's tender folder ID pattern (TENDER_ID_PATTERN). */
const FOLDER_ID = /^[A-Z0-9-]{1,64}$/

const MODES: readonly IngestMode[] = ['auto', 'replay', 'live']

export type RunIngestFormProps = {
  /** Prefills the folder ID (the review brief's own tender). */
  defaultTenderId?: string
  /**
   * A valid folder ID and mode were submitted. The page opens the audit modal in live mode,
   * which starts the job and follows it (useLiveIngest); the form only collects the input.
   */
  onStart: (input: Required<IngestInput>) => void
  /** The folder field, so an empty state can send focus to it. */
  inputRef?: Ref<HTMLInputElement>
  /** The page is checking the target tender before starting (useReingestGuard). */
  busy?: boolean
}

/**
 * *Run ingest* (spec §7.4): a tender folder ID, checked against the backend's pattern before
 * anything is sent, and a mode. The run itself is shown in the audit modal.
 */
export function RunIngestForm({
  defaultTenderId = '',
  onStart,
  inputRef,
  busy = false,
}: RunIngestFormProps) {
  const folderId = useId()
  const helpId = useId()
  const errorId = useId()
  const modeId = useId()
  const [folder, setFolder] = useState(defaultTenderId)
  const [mode, setMode] = useState<IngestMode>('auto')
  const [invalid, setInvalid] = useState(false)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const tenderId = folder.trim()
    if (!FOLDER_ID.test(tenderId)) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onStart({ tenderId, mode })
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate data-print="hide">
      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor={folderId} className={styles.label}>
            {copy.review.ingest.folderLabel}
          </label>
          <input
            ref={inputRef}
            id={folderId}
            className={styles.input}
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${errorId} ${helpId}` : helpId}
          />
          <p id={helpId} className={styles.help}>
            {copy.review.ingest.folderHelp}
          </p>
          {invalid ? (
            <p id={errorId} className={styles.error}>
              {copy.review.ingest.folderError}
            </p>
          ) : null}
        </div>
        <div className={styles.field}>
          <label htmlFor={modeId} className={styles.label}>
            {copy.review.ingest.modeLabel}
          </label>
          <select
            id={modeId}
            className={styles.input}
            value={mode}
            onChange={(event) => setMode(event.target.value as IngestMode)}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {copy.review.ingest.modes[m]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className={styles.footer}>
        {/* aria-disabled, not disabled: the button keeps focus while the lookup runs. */}
        <Button
          type="submit"
          variant="secondary"
          aria-busy={busy || undefined}
          aria-disabled={busy || undefined}
        >
          {busy ? copy.review.ingest.checking : copy.review.ingest.submit}
        </Button>
      </div>
    </form>
  )
}
