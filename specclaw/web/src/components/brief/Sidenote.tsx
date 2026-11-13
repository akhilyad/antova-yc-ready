import { useId, type ReactNode, type Ref } from 'react'
import { DEFAULT_RATES, type Scope } from '../../api/client'
import type { CostLine, Rates, Tender } from '../../api/schemas'
import { copy } from '../../content/copy'
import type { CellRef } from '../../domain/footnotes'
import { adderCents, lineCents, type VendorLevel } from '../../domain/leveling'
import { formatEur, toCents } from '../../domain/money'
import { CheckRow } from './CheckRow'
import { MoneyFigure } from './MoneyFigure'
import { PageCrop } from './PageCrop'
import { Quote } from './Quote'
import styles from './Sidenote.module.css'
import { StatusTag } from './StatusTag'

export type SidenoteProps = {
  tender: Tender
  cell: CellRef
  scope: Scope
  levels: readonly VendorLevel[]
  /** The sidenote's heading (focusable), so a footnote jump can move focus to it. */
  headingRef: Ref<HTMLHeadingElement>
  /** An id for the heading, when something outside names itself by it (the bottom sheet). */
  headingId?: string
  /** The slider rates the levels were priced at; each cost line is shown at them. */
  rates?: Rates
  /** The review slot (OverrideForm), after the evidence. */
  children?: ReactNode
}

/** "1480" → "1,480"; decimals are kept as the backend wrote them. */
function formatQty(qty: string): string {
  const [whole = '', fraction] = qty.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction === undefined ? grouped : `${grouped}.${fraction}`
}

/**
 * "11 bays × €1,600". A labour line's rate is the site labour slider; a copper or freight
 * line shows its multiplier when it isn't 1, so the visible sum is the one that was done.
 */
function arithmetic(line: CostLine, rates: Rates): string {
  const qty = `${formatQty(line.qty)} ${line.unit}`
  if (line.driver === 'labour') return `${qty} × ${formatEur(toCents(rates.labour))}`
  const rate = `${qty} × ${formatEur(toCents(line.rate))}`
  const multiplier =
    line.driver === 'copper' ? rates.copper : line.driver === 'freight' ? rates.freight : 1
  return multiplier === 1 ? rate : `${rate} × ${multiplier}`
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={styles.section}>
      <h3 id={id} className={styles.sectionTitle}>
        {title}
      </h3>
      {children}
    </section>
  )
}

/**
 * The evidence for one requirement × bidder cell, in spec §7.3 order: Your spec · The bid
 * says · Also in the bid · On the page · Checks · How it's priced. Sections with nothing to
 * show are left out (a compliant cell has no pricing). Renders nothing for an unknown cell.
 */
export function Sidenote({
  tender,
  cell,
  scope,
  levels,
  headingRef,
  headingId: givenHeadingId,
  rates = DEFAULT_RATES,
  children,
}: SidenoteProps) {
  const ownHeadingId = useId()
  const headingId = givenHeadingId ?? ownHeadingId
  const param = tender.parameters.find((p) => p.id === cell.paramId)
  const vendor = tender.vendors.find((v) => v.id === cell.vendorId)
  const extraction =
    param && Object.hasOwn(param.vendors, cell.vendorId) ? param.vendors[cell.vendorId] : undefined
  const level = levels
    .find((l) => l.vendorId === cell.vendorId)
    ?.cells.find((c) => c.paramId === cell.paramId)
  if (!param || !vendor || !extraction || !level) return null

  const { citation, secondary_citation: secondary } = extraction
  const label = (field: string) => param.checks_spec.find((s) => s.field === field)?.label
  const unpriced = extraction.pricing_status === 'UNPRICED' && !level.overridden
  const showPricing =
    level.overridden || unpriced || extraction.cost_lines.length > 0 || level.adderCents !== 0

  return (
    <article className={styles.sidenote} aria-labelledby={headingId}>
      <div className={styles.header}>
        <p className={styles.vendor}>{vendor.name}</p>
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.heading}>
          {param.name}
        </h2>
        <StatusTag
          status={level.status}
          pricingStatus={level.pricingStatus}
          overridden={level.overridden}
        />
      </div>

      <Section title={copy.brief.sidenote.yourSpec}>
        {param.requirement_citation ? (
          <Quote variant="requirement" citation={param.requirement_citation} />
        ) : (
          <p className={styles.plain}>{param.mr_requirement}</p>
        )}
      </Section>

      <Section title={copy.brief.sidenote.theBidSays}>
        {citation ? (
          <Quote variant="governing" citation={citation} />
        ) : (
          <p className={styles.plain}>{extraction.extracted_text}</p>
        )}
      </Section>

      {secondary ? (
        <Section title={copy.brief.sidenote.alsoInTheBid}>
          <Quote variant="superseded" citation={secondary} />
          {citation ? (
            <p className={styles.note}>
              {copy.brief.superseded({
                governing: copy.brief.sectionName(citation.section).toLowerCase(),
                other: copy.brief.sectionName(secondary.section).toLowerCase(),
              })}
            </p>
          ) : null}
        </Section>
      ) : null}

      {citation ? (
        <Section title={copy.brief.sidenote.onThePage}>
          <PageCrop
            key={`${cell.vendorId}/${cell.paramId}`}
            scope={scope}
            paramId={cell.paramId}
            source={cell.vendorId}
            which="primary"
            alt={citation.quote}
          />
        </Section>
      ) : null}

      {extraction.checks.length > 0 ? (
        <Section title={copy.brief.sidenote.checks}>
          <table className={styles.checks}>
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">{copy.brief.checks.result}</span>
                </th>
                <th scope="col">{copy.brief.checks.requirement}</th>
                <th scope="col">{copy.brief.checks.required}</th>
                <th scope="col">{copy.brief.checks.offered}</th>
                <th scope="col">{copy.brief.checks.readAs}</th>
              </tr>
            </thead>
            <tbody>
              {extraction.checks.map((check) => (
                <CheckRow key={check.field} check={check} label={label(check.field)} />
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      {showPricing ? (
        <Section title={copy.brief.sidenote.howItsPriced}>
          {extraction.cost_lines.length > 0 ? (
            <ul className={styles.lines}>
              {extraction.cost_lines.map((line) => (
                <li key={line.label} className={styles.line}>
                  <span className={styles.lineLabel}>{line.label}</span>
                  <span className={styles.sum}>
                    <span>{arithmetic(line, rates)}</span>
                    <span aria-hidden="true"> = </span>
                    <span className="visually-hidden"> {copy.brief.pricing.equals} </span>
                    <span className={styles.amount}>{formatEur(lineCents(line, rates))}</span>
                  </span>
                  <span className={styles.driver}>{copy.brief.pricing.drivers[line.driver]}</span>
                </li>
              ))}
            </ul>
          ) : extraction.adder_formula !== '' ? (
            <p className={styles.plain}>{extraction.adder_formula}</p>
          ) : null}

          {unpriced ? <p className={styles.note}>{copy.brief.pricing.unpriced}</p> : null}

          {level.overridden ? (
            <>
              <p className={styles.override}>
                {copy.review.override.badge(level.overrideNote ?? '')}
              </p>
              <p className={styles.row}>
                <span>{copy.brief.pricing.rateTable}</span>
                <MoneyFigure cents={adderCents(extraction, rates)} variant="struck" />
              </p>
            </>
          ) : null}

          {unpriced ? null : (
            <p className={`${styles.row} ${styles.total}`}>
              <span>{copy.brief.pricing.total}</span>
              <MoneyFigure cents={level.adderCents} variant="adder" />
            </p>
          )}
        </Section>
      ) : null}

      {children}
    </article>
  )
}
