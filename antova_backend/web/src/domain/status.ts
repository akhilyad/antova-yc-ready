/**
 * The glyph, word and severity a requirement × bidder cell shows (spec §8.2). Every status is
 * a glyph plus a word, never colour alone; the strings live in the copy deck.
 */
import type { ComplianceStatus, PricingStatus } from '../api/schemas'
import { copy } from '../content/copy'

/** `open` items block verification until a reviewer resolves them. */
export type StatusSeverity = 'ok' | 'gap' | 'open'

export interface StatusTagView {
  glyph: string
  word: string
  severity: StatusSeverity
}

/** The status row for each compliance status that is not itself an open condition. */
const ROWS: Record<Exclude<ComplianceStatus, 'MANUAL_INSPECTION_REQUIRED'>, StatusTagView> = {
  COMPLIANT: { ...copy.status.meets, severity: 'ok' },
  DEVIATION_UPGRADE: { ...copy.status.exceeds, severity: 'ok' },
  DEVIATION_DOWNGRADE: { ...copy.status.gap, severity: 'gap' },
  CONFLICT_DOWNGRADE: { ...copy.status.contradiction, severity: 'gap' },
  OMITTED: { ...copy.status.missing, severity: 'gap' },
}

/**
 * Ruling R15: an open condition wins over the status row. A non-overridden UNPRICED cell is
 * `€? Unpriced` (open) whatever its status; a non-overridden MANUAL_INSPECTION_REQUIRED is
 * `! Needs inspection` (open). Once overridden, an UNPRICED cell shows its status row, and a
 * MANUAL_INSPECTION_REQUIRED cell keeps `! Needs inspection` with severity `gap`.
 */
export function statusTag(
  status: ComplianceStatus,
  pricingStatus: PricingStatus,
  overridden: boolean,
): StatusTagView {
  if (pricingStatus === 'UNPRICED' && !overridden) {
    return { ...copy.status.unpriced, severity: 'open' }
  }
  if (status === 'MANUAL_INSPECTION_REQUIRED') {
    return { ...copy.status.needsInspection, severity: overridden ? 'gap' : 'open' }
  }
  return { ...ROWS[status] }
}
