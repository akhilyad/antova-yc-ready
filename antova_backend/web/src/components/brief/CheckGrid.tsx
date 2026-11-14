import type { Tender } from '../../api/schemas'
import { copy } from '../../content/copy'
import { anchorFor, type CellRef, type Footnote } from '../../domain/footnotes'
import type { VendorLevel } from '../../domain/leveling'
import { statusTag } from '../../domain/status'
import styles from './CheckGrid.module.css'
import { StatusTag } from './StatusTag'

export type CheckGridProps = {
  tender: Tender
  levels: readonly VendorLevel[]
  footnotes: readonly Footnote[]
  /** The selected cell's anchor. */
  selected: string | null
  /** Review mode: cells that need the founder's attention. */
  cellHighlight?: (cell: CellRef) => boolean
}

/**
 * All checks: requirements down, bidders across. Every cell, compliant ones included, is a
 * link to its anchor and opens its sidenote. The table scrolls sideways inside a focusable,
 * labelled region, so keyboard users can scroll it too.
 */
export function CheckGrid({ tender, levels, footnotes, selected, cellHighlight }: CheckGridProps) {
  const title = copy.brief.gridHeading({
    requirements: tender.parameters.length,
    bidders: levels.length,
  })
  const numbers = new Map(footnotes.map((n) => [n.anchor, n.number]))

  return (
    // A plain div: the scroll region below carries the name, so the section isn't announced twice.
    <div className={styles.section}>
      <h2>{title}</h2>
      <div className={styles.scroll} role="region" aria-label={title} tabIndex={0}>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th scope="col" className={styles.corner}>
                {copy.brief.gridCorner}
              </th>
              {levels.map((level) => (
                <th key={level.vendorId} scope="col" className={styles.vendor}>
                  {level.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tender.parameters.map((param) => (
              <tr key={param.id}>
                <th scope="row" className={styles.param}>
                  {param.name}
                </th>
                {levels.map((level) => {
                  const cell = level.cells.find((c) => c.paramId === param.id)
                  if (!cell) return <td key={level.vendorId} />
                  const anchor = anchorFor(level.vendorId, param.id)
                  const tag = statusTag(cell.status, cell.pricingStatus, cell.overridden)
                  const number = numbers.get(anchor)
                  const isSelected = anchor === selected
                  const highlighted =
                    cellHighlight?.({ vendorId: level.vendorId, paramId: param.id }) ?? false
                  const className = [
                    styles.cell,
                    tag.severity === 'ok' ? '' : styles.wrong,
                    isSelected ? styles.selected : '',
                    highlighted ? styles.highlight : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <td
                      key={level.vendorId}
                      className={className}
                      data-highlight={highlighted ? 'true' : undefined}
                    >
                      <a
                        href={`#${anchor}`}
                        className={styles.link}
                        aria-current={isSelected ? 'true' : undefined}
                        aria-label={copy.brief.gridCell({
                          vendor: level.name,
                          requirement: param.name,
                          status: tag.word,
                          // The superscript is visible, so the name says it too.
                          footnote: number,
                          // Review mode: the highlight is an outline, so say it too.
                          needsReview: highlighted,
                        })}
                      >
                        <StatusTag
                          status={cell.status}
                          pricingStatus={cell.pricingStatus}
                          overridden={cell.overridden}
                        />
                        {number !== undefined ? (
                          // The flex row doesn't render the space; it keeps "Gap" and "8" two
                          // words in the link's text, as they look on screen.
                          <>
                            {' '}
                            <sup className={styles.number} aria-hidden="true">
                              {number}
                            </sup>
                          </>
                        ) : null}
                      </a>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
