import { copy } from '../../content/copy'
import styles from './DocCard.module.css'
import type { StageState } from './StageList'

export type DocCardProps = {
  /** What the document is: "Spec (what you asked to buy)", "VoltSwitch Industrial bid". */
  title: string
  filename: string
  pages: number
  /** Follows the reading stage: being read while it runs, read (✓) once it is done. */
  state: StageState
}

const MARKS: Partial<Record<StageState, string>> = { done: '✓', failed: '✗' }

/** One input document in the audit modal (spec §7.2), as a list item. */
export function DocCard({ title, filename, pages, state }: DocCardProps) {
  const mark = MARKS[state]
  return (
    <li className={styles.card} data-state={state}>
      <p className={styles.title}>
        <span>
          <span className="visually-hidden">{copy.modal.stageState[state]}: </span>
          {title}
        </span>
        {mark ? (
          <span className={styles.mark} aria-hidden="true">
            {mark}
          </span>
        ) : null}
      </p>
      <p className={styles.filename}>{filename}</p>
      <p className={styles.pages}>{copy.modal.documents.pages(pages)}</p>
    </li>
  )
}
