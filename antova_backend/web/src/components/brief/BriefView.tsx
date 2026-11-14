import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router'
import { DEFAULT_RATES, type Scope } from '../../api/client'
import type { Brief, VendorFinancials } from '../../api/schemas'
import { copy } from '../../content/copy'
import '../../design/print.css'
import {
  anchorFor,
  defaultSelection,
  footnoteIndex,
  resolveAnchor,
  type CellRef,
} from '../../domain/footnotes'
import { levelTender, type VendorLevel } from '../../domain/leveling'
import { toCents } from '../../domain/money'
import { buildVerdict } from '../../domain/verdict'
import { formatDate } from '../../lib/formatDate'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { usePrinting } from '../../lib/usePrinting'
import { RankingFlip } from '../charts/RankingFlip'
import { BottomSheet } from '../ui/BottomSheet'
import styles from './BriefView.module.css'
import { CheckGrid } from './CheckGrid'
import { Findings } from './Findings'
import { LevelingTable } from './LevelingTable'
import { Masthead } from './Masthead'
import { Method } from './Method'
import { RateSliders, type Priced } from './RateSliders'
import { Sidenote } from './Sidenote'
import { VerdictSentence } from './VerdictSentence'

export type BriefViewProps = {
  brief: Brief
  scope: Scope
  /** Review mode: rendered inside the selected cell's sidenote, after the evidence. */
  reviewSlot?: (cell: CellRef) => ReactNode
  /** Review mode: grid cells to highlight. */
  cellHighlight?: (cell: CellRef) => boolean
}

const WIDE = '(min-width: 960px)'

/**
 * The figures the page shows come from the backend (the brief, or the newest evaluate
 * response); the cells come from the browser's leveling at the same rates, which agrees with
 * the backend to the cent (parity-cases.json). Where both exist, the backend's figure wins.
 */
function withFinancials(
  levels: readonly VendorLevel[],
  financials: readonly VendorFinancials[],
): VendorLevel[] {
  const byVendor = new Map(financials.map((f) => [f.vendor_id, f]))
  return levels.map((level) => {
    const f = byVendor.get(level.vendorId)
    if (f === undefined) return level
    const adders = new Map(f.itemized_breakdown.map((item) => [item.param_id, item.adder_eur]))
    return {
      ...level,
      headlineCents: toCents(f.headline_price ?? 0),
      techCents: toCents(f.total_tech_penalty),
      commercialCents: toCents(f.total_commercial_adder),
      evaluatedCents: toCents(f.true_evaluated_price ?? f.total_adders),
      cells: level.cells.map((cell) => {
        const adder = adders.get(cell.paramId)
        return adder === undefined ? cell : { ...cell, adderCents: toCents(adder) }
      }),
    }
  })
}

/**
 * The verified brief in the "brief with sidenotes" layout (spec §7.3): the argument in the
 * main column, the selected footnote's evidence in a sticky right margin at ≥ 960 px or a
 * bottom sheet below. The selection is the URL hash. Printing renders every footnote's
 * evidence as endnotes (print.css hides the interactive parts).
 */
export function BriefView({ brief, scope, reviewSlot, cellHighlight }: BriefViewProps) {
  const { tender } = brief
  const location = useLocation()
  const navigate = useNavigate()
  const wide = useMediaQuery(WIDE, true)
  const printing = usePrinting()
  const sheetHeadingId = useId()
  const endnotesHeadingId = useId()

  // null: the brief's own financials, priced at the default rates.
  const [priced, setPriced] = useState<Priced | null>(null)
  const rates = priced?.rates ?? DEFAULT_RATES
  const levels = withFinancials(
    levelTender(tender, rates, brief.overrides),
    priced?.financials ?? brief.financials,
  )
  const footnotes = footnoteIndex(tender, levels)
  const cells = levels.flatMap((l) => l.cells)
  const verdict = buildVerdict(levels, {
    unpriced: cells.filter((c) => c.pricingStatus === 'UNPRICED' && !c.overridden).length,
    inspection: cells.filter((c) => c.status === 'MANUAL_INSPECTION_REQUIRED' && !c.overridden)
      .length,
  })

  const fallback = defaultSelection(tender, levels, verdict)
  const selected =
    resolveAnchor(tender, location.hash) ??
    (fallback === null ? null : resolveAnchor(tender, fallback))
  const selectedAnchor = selected ? anchorFor(selected.vendorId, selected.paramId) : null

  const headingRef = useRef<HTMLHeadingElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  /** The anchor whose sidenote heading should take focus once it is on screen. */
  const pendingFocus = useRef<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [, setActivations] = useState(0)

  // After a footnote jump, focus the sidenote heading once the selected sidenote is the one on
  // screen (the router applies the new hash in a later render). Effects run child-first, so
  // this also wins over the bottom sheet's own first focus on its Close button.
  useEffect(() => {
    if (pendingFocus.current === null || pendingFocus.current !== selectedAnchor) return
    if (!wide && !sheetOpen) return
    pendingFocus.current = null
    headingRef.current?.focus()
  })

  // Footnote refs and grid cells are plain links to "#f-…". Take them over, so the selection
  // goes through the router, the page does not jump, and focus moves to the evidence.
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = event.target instanceof Element ? event.target.closest('a[href^="#f-"]') : null
    if (!(link instanceof HTMLAnchorElement)) return
    const hash = link.getAttribute('href') ?? ''
    const cell = resolveAnchor(tender, hash)
    if (cell === null) return
    event.preventDefault()
    openerRef.current = link
    pendingFocus.current = anchorFor(cell.vendorId, cell.paramId)
    if (location.hash !== hash) {
      navigate({ pathname: location.pathname, search: location.search, hash })
    }
    if (!wide) setSheetOpen(true)
    // Re-render even when the same footnote is chosen again, so the focus effect runs.
    setActivations((n) => n + 1)
  }

  // Escape in the margin returns focus to the footnote that opened it.
  const onMarginKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape') return
    const opener = openerRef.current
    if (opener?.isConnected) {
      event.preventDefault()
      opener.focus()
    }
  }

  const sidenote = (cell: CellRef, headingId?: string) => (
    <Sidenote
      key={anchorFor(cell.vendorId, cell.paramId)}
      tender={tender}
      cell={cell}
      scope={scope}
      levels={levels}
      rates={rates}
      headingRef={headingRef}
      headingId={headingId}
    >
      {reviewSlot?.(cell)}
    </Sidenote>
  )

  const verifiedOn = brief.verified_at ? formatDate(brief.verified_at) : null
  // The printed brief names where it is shared: its public link, never the page it was printed
  // from (in review mode that is /review/:tenderId). An unshared brief prints no link.
  const shareUrl =
    brief.status === 'VERIFIED'
      ? `${window.location.origin}/b/${encodeURIComponent(brief.share_id)}`
      : null

  return (
    <div
      className={`${styles.brief} ${wide ? styles.wide : ''}`}
      onClick={onClick}
      data-print="layout"
    >
      <div className={styles.column}>
        <Masthead brief={brief} levels={levels} />
        <VerdictSentence verdict={verdict} />
        <RankingFlip levels={levels} />
        <LevelingTable levels={levels} />
        <Findings tender={tender} levels={levels} footnotes={footnotes} selected={selectedAnchor} />
        <RateSliders scope={scope} onPriced={setPriced} />
        <CheckGrid
          tender={tender}
          levels={levels}
          footnotes={footnotes}
          selected={selectedAnchor}
          cellHighlight={cellHighlight}
        />
        <Method brief={brief} />

        {printing ? (
          <section aria-labelledby={endnotesHeadingId} data-print="only">
            <h2 id={endnotesHeadingId}>{copy.brief.endnotesHeading}</h2>
            <ol className={styles.endnotes}>
              {footnotes.map((note) => (
                <li key={note.anchor} className={styles.endnote} data-print="endnote">
                  <span className={styles.endnoteNumber}>{note.number}</span>
                  <Sidenote
                    tender={tender}
                    cell={note}
                    scope={scope}
                    levels={levels}
                    rates={rates}
                    headingRef={null}
                  />
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {verifiedOn && shareUrl ? (
          <p className={styles.colophon}>
            {copy.brief.colophon({ date: verifiedOn, url: shareUrl })}
          </p>
        ) : null}
      </div>

      {wide ? (
        <aside
          aria-label={copy.brief.margin.label}
          className={styles.margin}
          onKeyDown={onMarginKeyDown}
          data-print="hide"
        >
          {selected ? sidenote(selected) : <p className={styles.hint}>{copy.brief.margin.hint}</p>}
        </aside>
      ) : (
        <BottomSheet
          open={sheetOpen && selected !== null}
          onClose={() => setSheetOpen(false)}
          labelledBy={sheetHeadingId}
        >
          {selected ? sidenote(selected, sheetHeadingId) : null}
        </BottomSheet>
      )}
    </div>
  )
}
