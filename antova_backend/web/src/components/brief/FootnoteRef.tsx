import { copy } from '../../content/copy'
import type { Footnote } from '../../domain/footnotes'
import styles from './FootnoteRef.module.css'

export type FootnoteRefProps = {
  footnote: Footnote
  /** This footnote's cell is the one the sidenote shows. */
  selected: boolean
}

/**
 * A superscript link to a cell's stable anchor. The URL hash is the selection, so a plain
 * link is enough. Padding gives a ≥ 24 × 24 px target without moving the line.
 */
export function FootnoteRef({ footnote, selected }: FootnoteRefProps) {
  return (
    <a
      href={`#${footnote.anchor}`}
      className={`${styles.ref} ${styles.hitArea}`}
      aria-current={selected ? 'true' : undefined}
      aria-label={copy.brief.footnoteLabel(footnote.number)}
    >
      <sup className={styles.number}>{footnote.number}</sup>
    </a>
  )
}
