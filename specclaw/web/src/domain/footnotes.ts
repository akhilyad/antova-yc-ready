/**
 * Footnotes (spec §7.3). Every requirement × vendor cell has a stable anchor
 * `f-{vendor_id}-{param_id}`; display numbers are derived and can change, anchors never do.
 * Numbered cells are those whose status is not COMPLIANT or DEVIATION_UPGRADE, plus any
 * overridden cell, ordered by vendor position then parameter position in the tender.
 */
import type { ComplianceStatus, Tender } from '../api/schemas'
import type { VendorLevel } from './leveling'
import { apparentLowBidder } from './ranking'
import type { Verdict } from './verdict'

export type Footnote = { number: number; vendorId: string; paramId: string; anchor: string }

export type CellRef = { vendorId: string; paramId: string }

/** Statuses that meet the spec and so get no footnote unless overridden. */
const UNNUMBERED: ReadonlySet<ComplianceStatus> = new Set(['COMPLIANT', 'DEVIATION_UPGRADE'])

export function anchorFor(vendorId: string, paramId: string): string {
  return `f-${vendorId}-${paramId}`
}

/** Every cell of the tender, vendor position then parameter position, with its status. */
function cells(tender: Tender): (CellRef & { status: ComplianceStatus })[] {
  const out: (CellRef & { status: ComplianceStatus })[] = []
  for (const vendor of tender.vendors) {
    for (const param of tender.parameters) {
      // hasOwn: a vendor ID such as "constructor" must not reach Object.prototype.
      const extraction = Object.hasOwn(param.vendors, vendor.id)
        ? param.vendors[vendor.id]
        : undefined
      if (extraction === undefined) continue
      out.push({ vendorId: vendor.id, paramId: param.id, status: extraction.status })
    }
  }
  return out
}

/** The numbered cells, in display order; `levels` supplies which cells are overridden. */
export function footnoteIndex(tender: Tender, levels: readonly VendorLevel[]): Footnote[] {
  const overridden = new Set<string>()
  for (const level of levels) {
    for (const cell of level.cells) {
      if (cell.overridden) overridden.add(anchorFor(level.vendorId, cell.paramId))
    }
  }
  const notes: Footnote[] = []
  for (const cell of cells(tender)) {
    const anchor = anchorFor(cell.vendorId, cell.paramId)
    if (UNNUMBERED.has(cell.status) && !overridden.has(anchor)) continue
    notes.push({ number: notes.length + 1, vendorId: cell.vendorId, paramId: cell.paramId, anchor })
  }
  return notes
}

/** `decodeURIComponent`, or null for a malformed escape such as `%E0%A4%A`. */
function tryDecode(s: string): string | null {
  try {
    return decodeURIComponent(s)
  } catch {
    return null
  }
}

/**
 * The cell a URL hash points at (`#f-…` or `f-…`, raw or percent-encoded), or null when no
 * cell of this tender has that anchor: a mistyped, malformed or stale link never throws.
 * Vendor and parameter IDs both contain "-", so this compares against every cell's anchor
 * rather than splitting the hash.
 */
export function resolveAnchor(tender: Tender, hash: string): CellRef | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (raw === '') return null
  const wanted = new Set([raw, tryDecode(raw)])
  for (const cell of cells(tender)) {
    if (wanted.has(anchorFor(cell.vendorId, cell.paramId))) {
      return { vendorId: cell.vendorId, paramId: cell.paramId }
    }
  }
  return null
}

/**
 * The anchor selected when the brief opens without one: the apparent low bidder's first
 * numbered cell when the verdict is a reversal, otherwise the first numbered cell, otherwise
 * null (the margin explains how to read the brief).
 */
export function defaultSelection(
  tender: Tender,
  levels: readonly VendorLevel[],
  verdict: Verdict,
): string | null {
  const notes = footnoteIndex(tender, levels)
  if (verdict.kind === 'reversal') {
    const lowId = apparentLowBidder(levels)?.vendorId
    const own = notes.find((n) => n.vendorId === lowId)
    if (own) return own.anchor
  }
  return notes[0]?.anchor ?? null
}
