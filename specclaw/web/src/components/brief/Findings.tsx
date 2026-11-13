import { useId } from 'react'
import type { Tender } from '../../api/schemas'
import { copy } from '../../content/copy'
import type { Footnote } from '../../domain/footnotes'
import type { VendorLevel } from '../../domain/leveling'
import { formatAdder } from '../../domain/money'
import styles from './Findings.module.css'
import { FootnoteRef } from './FootnoteRef'
import { MoneyFigure } from './MoneyFigure'
import { StatusTag } from './StatusTag'

export type FindingsProps = {
  tender: Tender
  levels: readonly VendorLevel[]
  footnotes: readonly Footnote[]
  /** The selected cell's anchor. */
  selected: string | null
}

function VendorFindings({
  tender,
  level,
  notes,
  selected,
}: {
  tender: Tender
  level: VendorLevel
  notes: readonly Footnote[]
  selected: string | null
}) {
  const headingId = useId()
  const cols = copy.brief.findingsColumns
  return (
    <section aria-labelledby={headingId} className={styles.vendor}>
      <h3 id={headingId} className={styles.vendorHeading}>
        {copy.brief.findingsVendor({
          name: level.name,
          gaps: notes.length,
          adder: formatAdder(level.techCents + level.commercialCents),
        })}
      </h3>
      {notes.length === 0 ? (
        <p className={styles.none}>{copy.brief.findingsNone}</p>
      ) : (
        <table className={styles.rows}>
          <thead className="visually-hidden">
            <tr>
              <th scope="col">{cols.footnote}</th>
              <th scope="col">{cols.requirement}</th>
              <th scope="col">{cols.offered}</th>
              <th scope="col">{cols.status}</th>
              <th scope="col">{cols.adder}</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((note) => {
              const param = tender.parameters.find((p) => p.id === note.paramId)
              const cell = level.cells.find((c) => c.paramId === note.paramId)
              const extraction =
                param && Object.hasOwn(param.vendors, level.vendorId)
                  ? param.vendors[level.vendorId]
                  : undefined
              if (!param || !cell || !extraction) return null
              const isSelected = note.anchor === selected
              return (
                <tr key={note.anchor} className={isSelected ? styles.selected : undefined}>
                  <td className={styles.ref}>
                    <FootnoteRef footnote={note} selected={isSelected} />
                  </td>
                  <th scope="row" className={styles.requirement}>
                    {param.name}
                  </th>
                  <td className={styles.offered}>{extraction.extracted_text}</td>
                  <td className={styles.status}>
                    <StatusTag
                      status={cell.status}
                      pricingStatus={cell.pricingStatus}
                      overridden={cell.overridden}
                    />
                  </td>
                  <td className={styles.adder}>
                    <MoneyFigure cents={cell.adderCents} variant="adder" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}

/**
 * What we found in each bid: per bidder, "VoltSwitch Industrial · 6 gaps · +€64,800", then a
 * row per footnoted cell (number, requirement, what the bid offers, status, adder).
 */
export function Findings({ tender, levels, footnotes, selected }: FindingsProps) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={styles.findings}>
      <h2 id={headingId}>{copy.brief.findingsHeading}</h2>
      {levels.map((level) => (
        <VendorFindings
          key={level.vendorId}
          tender={tender}
          level={level}
          notes={footnotes.filter((n) => n.vendorId === level.vendorId)}
          selected={selected}
        />
      ))}
    </section>
  )
}
