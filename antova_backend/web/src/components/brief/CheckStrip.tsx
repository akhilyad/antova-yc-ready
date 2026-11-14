import { copy } from '../../content/copy'
import type { CellLevel } from '../../domain/leveling'
import { statusTag } from '../../domain/status'
import styles from './CheckStrip.module.css'

export type CheckStripProps = { cells: readonly CellLevel[] }

/**
 * One mark per requirement (✓ met, ✗ not), then "2 of 8"; screen readers hear
 * "2 of 8 requirements met" and skip the marks. A cell is met when its tag reads as passing.
 */
export function CheckStrip({ cells }: CheckStripProps) {
  const met = cells.map((c) => statusTag(c.status, c.pricingStatus, c.overridden).severity === 'ok')
  const count = met.filter(Boolean).length
  return (
    <span className={styles.strip}>
      <span className={styles.marks} aria-hidden="true">
        {cells.map((cell, i) => (
          <span key={cell.paramId} className={met[i] ? styles.met : styles.unmet}>
            {met[i] ? '✓' : '✗'}
          </span>
        ))}
      </span>
      <span className={styles.count}>
        {copy.brief.checkStrip.count({ met: count, total: cells.length })}
        <span className="visually-hidden"> {copy.brief.checkStrip.suffix}</span>
      </span>
    </span>
  )
}
