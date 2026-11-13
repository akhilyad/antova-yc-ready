import { copy } from '../../content/copy'
import type { VendorLevel } from '../../domain/leveling'
import { CheckStrip } from './CheckStrip'
import styles from './LevelingTable.module.css'
import { MoneyFigure } from './MoneyFigure'

export type LevelingTableProps = { levels: readonly VendorLevel[] }

/**
 * Bidder · Bid price · Technical gaps · Commercial gaps · Evaluated price · Requirements met,
 * one row per bidder in tender order. A bid without a price says so instead of showing €0.
 */
export function LevelingTable({ levels }: LevelingTableProps) {
  const head = copy.brief.table
  return (
    // Scrolls sideways on narrow screens; focusable so keyboard users can scroll it too.
    <div className={styles.scroll} role="region" aria-label={copy.brief.tableCaption} tabIndex={0}>
      <table className={styles.table}>
        <caption className="visually-hidden">{copy.brief.tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{head.bidder}</th>
            <th scope="col" className={styles.num}>
              {head.bidPrice}
            </th>
            <th scope="col" className={styles.num}>
              {head.technicalGaps}
            </th>
            <th scope="col" className={styles.num}>
              {head.commercialGaps}
            </th>
            <th scope="col" className={styles.num}>
              {head.evaluatedPrice}
            </th>
            <th scope="col">{head.requirementsMet}</th>
          </tr>
        </thead>
        <tbody>
          {levels.map((level) => {
            const priced = level.headlineCents > 0
            return (
              <tr key={level.vendorId}>
                <th scope="row" className={styles.bidder}>
                  {level.name}
                </th>
                <td className={styles.num}>
                  {priced ? (
                    <MoneyFigure cents={level.headlineCents} variant="headline" />
                  ) : (
                    <span className={styles.missing}>{copy.brief.noPrice}</span>
                  )}
                </td>
                <td className={styles.num}>
                  <MoneyFigure cents={level.techCents} variant="adder" />
                </td>
                <td className={styles.num}>
                  <MoneyFigure cents={level.commercialCents} variant="adder" />
                </td>
                <td className={styles.num}>
                  {priced ? <MoneyFigure cents={level.evaluatedCents} variant="total" /> : null}
                </td>
                <td>
                  <CheckStrip cells={level.cells} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
