import { useId, useLayoutEffect, useRef } from 'react'
import { copy } from '../../content/copy'
import type { VendorLevel } from '../../domain/leveling'
import { formatAdder, formatEur } from '../../domain/money'
import { pricedLevels } from '../../domain/ranking'
import { settleMs } from '../../lib/settleMs'
import { MoneyFigure } from '../brief/MoneyFigure'
import styles from './SensitivityBars.module.css'

export type SensitivityBarsProps = {
  levels: readonly VendorLevel[]
  /**
   * The cents a full-width bar stands for. Fixed by the caller (the dearest any bid can get),
   * so a bar only changes length when its own price moves.
   */
  scaleCents: number
}

/** The spec's easing, `--ease`. */
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

type Segment = { key: 'bid' | 'technical' | 'commercial'; cents: number }

function segmentsOf(l: VendorLevel): Segment[] {
  return [
    { key: 'bid', cents: l.headlineCents },
    { key: 'technical', cents: l.techCents },
    { key: 'commercial', cents: l.commercialCents },
  ]
}

/**
 * Evaluated price per bidder as one stacked bar (spec §7.1): the bid, then what its technical
 * gaps cost, then its commercial gaps, on a zero baseline. Rows sit cheapest first; when the
 * order changes, each row slides to its new place over `--duration-settle` (no movement under
 * reduced motion). Only the gap segments are oxblood, technical solid and commercial hatched,
 * so the two never rest on colour alone. The drawing is hidden from screen readers; an
 * ordered list carries the same order and prices. Vendors without a bid price take no part.
 */
export function SensitivityBars({ levels, scaleCents }: SensitivityBarsProps) {
  const listId = useId()
  // Array.prototype.sort is stable: equal prices keep tender order.
  const rows = [...pricedLevels(levels)].sort((a, b) => a.evaluatedCents - b.evaluatedCents)
  const order = rows.map((l) => l.vendorId).join('\n')

  const elements = useRef(new Map<string, HTMLLIElement>())
  const offsets = useRef(new Map<string, number>())

  // FLIP: after a re-sort, start each row where it was and let it slide to where it is now.
  useLayoutEffect(() => {
    const ms = settleMs()
    const next = new Map<string, number>()
    for (const [vendorId, element] of elements.current) {
      const top = element.offsetTop
      next.set(vendorId, top)
      const before = offsets.current.get(vendorId)
      if (
        ms > 0 &&
        before !== undefined &&
        before !== top &&
        typeof element.animate === 'function'
      ) {
        element.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'none' }], {
          duration: ms,
          easing: EASE,
        })
      }
    }
    offsets.current = next
  }, [order])

  const width = (cents: number) => `${Math.min(100, (cents / Math.max(scaleCents, 1)) * 100)}%`
  const legend = [
    { key: 'bid', label: copy.brief.table.bidPrice },
    { key: 'technical', label: copy.brief.table.technicalGaps },
    { key: 'commercial', label: copy.brief.table.commercialGaps },
  ] as const

  return (
    <figure className={styles.figure}>
      <div aria-hidden="true" data-testid="sensitivity-bars">
        <ul className={styles.legend}>
          {legend.map(({ key, label }) => (
            <li key={key} className={styles.legendItem}>
              <span className={`${styles.swatch} ${styles[key]}`} />
              {label}
            </li>
          ))}
        </ul>
        <ol className={styles.rows}>
          {rows.map((l) => (
            <li
              key={l.vendorId}
              data-vendor={l.vendorId}
              className={styles.row}
              ref={(element) => {
                if (element) elements.current.set(l.vendorId, element)
                return () => {
                  elements.current.delete(l.vendorId)
                }
              }}
            >
              <span className={styles.name}>{l.name}</span>
              <MoneyFigure cents={l.evaluatedCents} variant="total" />
              <span className={styles.track}>
                {segmentsOf(l)
                  .filter((s) => s.cents > 0)
                  .map((s) => (
                    <span
                      key={s.key}
                      className={`${styles.segment} ${styles[s.key]}`}
                      style={{ width: width(s.cents) }}
                    />
                  ))}
              </span>
              <span className={styles.breakdown}>
                {copy.landing.sandbox.breakdown({
                  bid: formatEur(l.headlineCents),
                  technical: formatAdder(l.techCents),
                  commercial: formatAdder(l.commercialCents),
                })}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="visually-hidden">
        <p id={listId}>{copy.brief.ranking.evaluatedOrder}</p>
        <ol aria-labelledby={listId}>
          {rows.map((l) => (
            <li key={l.vendorId}>
              {copy.brief.ranking.item({ name: l.name, price: formatEur(l.evaluatedCents) })}
            </li>
          ))}
        </ol>
      </div>
    </figure>
  )
}
