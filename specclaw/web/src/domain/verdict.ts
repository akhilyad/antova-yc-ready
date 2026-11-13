/**
 * The brief's one-sentence verdict (spec §7.3, wording in §10 via the copy deck). Variants, in
 * order of precedence:
 * - `no_prices`: fewer than two bids have a price, so there is nothing to compare; the
 *   sentence is empty and the page renders the `missingPrice` lines instead (ruling R18);
 * - `tie`: two or more bids share the lowest evaluated price;
 * - `reversal`: the apparent low bidder is not the lowest once gaps are priced;
 * - `no_gaps`: no priced bid has an adder, and every cell of every priced bid is an `ok` status
 *   tag (ruling R17: an unpriced gap or open inspection with a €0 adder is still a gap);
 * - `holds`: the apparent low bidder stays lowest once its gaps are priced.
 * A bid without a price (`headlineCents === 0`) is listed in `missingPrice` and left out of
 * every comparison.
 */
import { copy } from '../content/copy'
import type { VendorLevel } from './leveling'
import { formatEur } from './money'
import { apparentLowBidder, lowestEvaluated, pricedLevels } from './ranking'
import { statusTag } from './status'

export type VerdictKind = 'reversal' | 'holds' | 'no_gaps' | 'tie' | 'no_prices'

export type Verdict = {
  kind: VerdictKind
  sentence: string
  /** "This excludes …" when open items exist; null when there are none. */
  caveat: string | null
  /** Names of vendors whose bid price wasn't found, in tender order. */
  missingPrice: string[]
}

/** "A and B", "A, B and C". */
function joinNames(names: readonly string[]): { a: string; b: string } {
  return { a: names.slice(0, -1).join(', '), b: names.at(-1) ?? '' }
}

function sentenceFor(levels: readonly VendorLevel[]): { kind: VerdictKind; sentence: string } {
  const priced = pricedLevels(levels)
  const low = apparentLowBidder(levels)
  // Ruling R18: no sentence; the page renders `missingPrice` with copy.verdict.missingPrice.
  if (priced.length < 2 || low === null) return { kind: 'no_prices', sentence: '' }

  const winners = lowestEvaluated(levels)
  const winner = winners[0] ?? low
  if (winners.length > 1) {
    const { a, b } = joinNames(winners.map((l) => l.name))
    return {
      kind: 'tie',
      sentence: copy.verdict.tie({ a, b, evaluated: formatEur(winner.evaluatedCents) }),
    }
  }

  const lowBid = formatEur(low.headlineCents)
  if (winner.vendorId !== low.vendorId) {
    return {
      kind: 'reversal',
      sentence: copy.verdict.reversal({
        low: low.name,
        lowBid,
        lowEval: formatEur(low.evaluatedCents),
        winner: winner.name,
        winnerEval: formatEur(winner.evaluatedCents),
      }),
    }
  }

  const meetsSpec = (l: VendorLevel) =>
    l.techCents + l.commercialCents === 0 &&
    l.cells.every((c) => statusTag(c.status, c.pricingStatus, c.overridden).severity === 'ok')
  if (priced.every(meetsSpec)) {
    return {
      kind: 'no_gaps',
      sentence: copy.verdict.noGaps({ n: priced.length, low: low.name, lowBid }),
    }
  }

  return {
    kind: 'holds',
    sentence: copy.verdict.lowBidHolds({
      low: low.name,
      lowBid,
      lowEval: formatEur(low.evaluatedCents),
    }),
  }
}

/** Picks the verdict variant for the leveled bids and fills it from the copy deck. */
export function buildVerdict(
  levels: readonly VendorLevel[],
  counts: { unpriced: number; inspection: number },
): Verdict {
  const missingPrice = levels.filter((l) => l.headlineCents <= 0).map((l) => l.name)
  return {
    ...sentenceFor(levels),
    caveat: copy.verdict.caveat({
      unpricedGaps: counts.unpriced,
      inspectionItems: counts.inspection,
    }),
    missingPrice,
  }
}
