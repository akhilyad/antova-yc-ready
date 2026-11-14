/**
 * Bid order vs evaluated order (spec §9): who the apparent low bidder is, who wins once gaps
 * are priced, how each vendor's rank moves, and where the RankingFlip chart puts each label.
 * A vendor whose bid price wasn't found (`headlineCents === 0`) takes no part in any ranking.
 */
import type { VendorLevel } from './leveling'

export type RankRow = {
  vendorId: string
  /** 1 = lowest bid price; tied prices share a rank. Null without a bid price. */
  bidRank: number | null
  /** 1 = lowest evaluated price; tied prices share a rank. Null without a bid price. */
  evalRank: number | null
  /** The vendor ranks lower once its gaps are priced. */
  worsened: boolean
}

/** Vendors with a bid price, in tender order. */
export function pricedLevels(levels: readonly VendorLevel[]): VendorLevel[] {
  return levels.filter((l) => l.headlineCents > 0)
}

/** Competition rank ("1, 1, 3"): one plus the number of strictly lower values. */
function rankOf(value: number, all: readonly number[]): number {
  return 1 + all.filter((v) => v < value).length
}

/** Each vendor's bid rank and evaluated rank, in the order given. */
export function rankChanges(levels: readonly VendorLevel[]): RankRow[] {
  const priced = pricedLevels(levels)
  const bids = priced.map((l) => l.headlineCents)
  const evals = priced.map((l) => l.evaluatedCents)
  return levels.map((l) => {
    if (l.headlineCents <= 0) {
      return { vendorId: l.vendorId, bidRank: null, evalRank: null, worsened: false }
    }
    const bidRank = rankOf(l.headlineCents, bids)
    const evalRank = rankOf(l.evaluatedCents, evals)
    return { vendorId: l.vendorId, bidRank, evalRank, worsened: evalRank > bidRank }
  })
}

/**
 * The apparent low bidder: the lowest bid price among priced vendors. A tie on bid price goes
 * to the lower evaluated price, then to tender order. Null when no vendor has a price.
 */
export function apparentLowBidder(levels: readonly VendorLevel[]): VendorLevel | null {
  let best: VendorLevel | null = null
  for (const l of pricedLevels(levels)) {
    if (
      best === null ||
      l.headlineCents < best.headlineCents ||
      (l.headlineCents === best.headlineCents && l.evaluatedCents < best.evaluatedCents)
    ) {
      best = l
    }
  }
  return best
}

/** Every priced vendor at the lowest evaluated price, in tender order (more than one = a tie). */
export function lowestEvaluated(levels: readonly VendorLevel[]): VendorLevel[] {
  const priced = pricedLevels(levels)
  const min = Math.min(...priced.map((l) => l.evaluatedCents))
  return priced.filter((l) => l.evaluatedCents === min)
}

/**
 * Label y positions for one RankingFlip column. Values sit on a linear scale over
 * `[0, heightPx]`, cheapest at the top (y = 0) and dearest at the bottom; a single value or
 * all-equal values start at the middle. Labels are then pushed apart, in price order (ties in
 * input order), so neighbours are at least `minGapPx` apart without leaving `[0, heightPx]`.
 * When that many gaps can't fit, labels are spread evenly over the height instead.
 * Returns one y per input value, in input order.
 */
export function layoutFlip(valuesCents: number[], heightPx: number, minGapPx: number): number[] {
  const n = valuesCents.length
  if (n === 0) return []
  const min = Math.min(...valuesCents)
  const range = Math.max(...valuesCents) - min
  const raw = valuesCents.map((v) => (range === 0 ? heightPx / 2 : ((v - min) / range) * heightPx))

  // Indices in chart order, top to bottom; a stable sort keeps ties in input order.
  const order = valuesCents.map((_, i) => i).sort((a, b) => (raw[a] ?? 0) - (raw[b] ?? 0))
  const ys = new Array<number>(n)

  // n ≥ 2 here: a single label needs no gap.
  if ((n - 1) * minGapPx > heightPx) {
    order.forEach((index, k) => {
      ys[index] = (k * heightPx) / (n - 1)
    })
    return ys
  }

  // Push down from the top, then back up from the bottom: every gap ≥ minGapPx, all within bounds.
  const sorted = order.map((index) => raw[index] ?? 0)
  for (let k = 1; k < n; k++) {
    sorted[k] = Math.max(sorted[k] ?? 0, (sorted[k - 1] ?? 0) + minGapPx)
  }
  sorted[n - 1] = Math.min(sorted[n - 1] ?? 0, heightPx)
  for (let k = n - 2; k >= 0; k--) {
    sorted[k] = Math.min(sorted[k] ?? 0, (sorted[k + 1] ?? 0) - minGapPx)
  }
  order.forEach((index, k) => {
    ys[index] = sorted[k] ?? 0
  })
  return ys
}
