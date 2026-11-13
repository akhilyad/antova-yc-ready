import { useId } from 'react'
import type { Brief } from '../../api/schemas'
import { copy } from '../../content/copy'
import { formatDate } from '../../lib/formatDate'
import styles from './Method.module.css'

export type MethodProps = { brief: Brief }

/**
 * How this brief was made: the rate table, every adder's cost lines with what moves each one,
 * who did what (the model located quotes; code did every sum), and how the quotes were found.
 */
export function Method({ brief }: MethodProps) {
  const headingId = useId()
  const { tender } = brief
  const cols = copy.brief.method.columns
  const recorded = brief.ingest_stats?.rate_table_effective_date
  const effective = recorded === undefined ? null : formatDate(recorded)
  const rows = tender.vendors.flatMap((vendor) =>
    tender.parameters.flatMap((param) => {
      const extraction = Object.hasOwn(param.vendors, vendor.id)
        ? param.vendors[vendor.id]
        : undefined
      return (extraction?.cost_lines ?? []).map((line, i) => ({
        key: `${vendor.id}/${param.id}/${i}`,
        vendor: vendor.name,
        requirement: param.name,
        line,
      }))
    }),
  )

  return (
    <section aria-labelledby={headingId} className={styles.method}>
      <h2 id={headingId}>{copy.brief.methodHeading}</h2>
      <p className={styles.lead}>{copy.brief.method.division}</p>
      <p>{copy.brief.method.rateTable(tender.rate_table_version, effective)}</p>
      {rows.length > 0 ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{cols.bidder}</th>
              <th scope="col">{cols.requirement}</th>
              <th scope="col">{cols.line}</th>
              <th scope="col">{cols.driver}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.vendor}</td>
                <td>{row.requirement}</td>
                <td>{row.line.label}</td>
                <td className={styles.driver}>{copy.brief.pricing.drivers[row.line.driver]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className={styles.ingest}>{copy.brief.method.ingest(brief.ingest_mode)}</p>
    </section>
  )
}
