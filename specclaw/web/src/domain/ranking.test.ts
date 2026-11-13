import { describe, expect, it } from 'vitest'
import { DEFAULT_RATES } from '../api/client'
import { Brief } from '../api/schemas'
import verifiedBrief from '../test/fixtures/verified-brief.json'
import { levelTender, type VendorLevel } from './leveling'
import { apparentLowBidder, layoutFlip, lowestEvaluated, rankChanges } from './ranking'

const tender = Brief.parse(verifiedBrief).tender
const levels = levelTender(tender, DEFAULT_RATES, [])

/** A hand-built level: only the price fields matter to ranking. */
function level(vendorId: string, headlineCents: number, evaluatedCents: number): VendorLevel {
  return {
    vendorId,
    name: vendorId,
    headlineCents,
    techCents: evaluatedCents - headlineCents,
    commercialCents: 0,
    evaluatedCents,
    cells: [],
  }
}

/** Sorted ascending, every adjacent pair is at least `gap` apart. */
function minAdjacentGap(ys: number[]): number {
  const sorted = [...ys].sort((a, b) => a - b)
  let min = Infinity
  for (let i = 1; i < sorted.length; i++) {
    min = Math.min(min, (sorted[i] ?? 0) - (sorted[i - 1] ?? 0))
  }
  return min
}

describe('rankChanges', () => {
  it('rankChanges marks VoltSwitch worsened', () => {
    expect(rankChanges(levels)).toEqual([
      { vendorId: 'vendor-a', bidRank: 3, evalRank: 1, worsened: false },
      { vendorId: 'vendor-b', bidRank: 1, evalRank: 3, worsened: true },
      { vendorId: 'vendor-c', bidRank: 2, evalRank: 2, worsened: false },
    ])
  })

  it('gives a vendor without a bid price null ranks and ranks the rest without it', () => {
    const rows = rankChanges([level('a', 0, 5_000), level('b', 200, 300), level('c', 100, 400)])
    expect(rows).toEqual([
      { vendorId: 'a', bidRank: null, evalRank: null, worsened: false },
      { vendorId: 'b', bidRank: 2, evalRank: 1, worsened: false },
      { vendorId: 'c', bidRank: 1, evalRank: 2, worsened: true },
    ])
  })

  it('ties share a rank and the next rank is skipped', () => {
    const rows = rankChanges([level('a', 100, 500), level('b', 100, 500), level('c', 300, 400)])
    expect(rows.map((r) => [r.bidRank, r.evalRank])).toEqual([
      [1, 2],
      [1, 2],
      [3, 1],
    ])
    expect(rows.map((r) => r.worsened)).toEqual([true, true, false])
  })

  it('returns nothing for no vendors', () => {
    expect(rankChanges([])).toEqual([])
  })
})

describe('apparentLowBidder and lowestEvaluated', () => {
  it('pick VoltSwitch and Nordwerk for the sample', () => {
    expect(apparentLowBidder(levels)?.vendorId).toBe('vendor-b')
    expect(lowestEvaluated(levels).map((l) => l.vendorId)).toEqual(['vendor-a'])
  })

  it('break a bid-price tie by evaluated price, then tender order', () => {
    expect(apparentLowBidder([level('a', 100, 500), level('b', 100, 400)])?.vendorId).toBe('b')
    expect(apparentLowBidder([level('a', 100, 400), level('b', 100, 400)])?.vendorId).toBe('a')
  })

  it('ignore vendors without a bid price', () => {
    expect(apparentLowBidder([level('a', 0, 0)])).toBeNull()
    expect(lowestEvaluated([level('a', 0, 0), level('b', 0, 0)])).toEqual([])
    expect(lowestEvaluated([level('a', 0, 0), level('b', 5, 9)]).map((l) => l.vendorId)).toEqual([
      'b',
    ])
  })

  it('lowestEvaluated returns every vendor tied at the lowest, in tender order', () => {
    const tied = lowestEvaluated([level('a', 1, 9), level('b', 2, 5), level('c', 3, 5)])
    expect(tied.map((l) => l.vendorId)).toEqual(['b', 'c'])
  })
})

describe('layoutFlip', () => {
  it('layoutFlip separates close values', () => {
    const [a, b] = layoutFlip([45_200_000, 45_400_000], 200, 18)
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    expect(Math.abs((b ?? 0) - (a ?? 0))).toBeGreaterThanOrEqual(18)
    // The higher price sits lower on the chart.
    expect(b).toBeGreaterThan(a ?? 0)
  })

  it('places values on a linear scale, cheapest at the top', () => {
    expect(layoutFlip([100, 300, 200], 200, 10)).toEqual([0, 200, 100])
  })

  it('keeps every position within [0, heightPx]', () => {
    const ys = layoutFlip([0, 1, 2, 1_000], 100, 30)
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(100)
    }
    expect(minAdjacentGap(ys)).toBeGreaterThanOrEqual(30)
  })

  it('handles a single value', () => {
    expect(layoutFlip([45_200_000], 200, 18)).toEqual([100])
  })

  it('handles all-equal values without dividing by zero', () => {
    const ys = layoutFlip([45_200_000, 45_200_000, 45_200_000], 200, 18)
    for (const y of ys) {
      expect(Number.isFinite(y)).toBe(true)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(200)
    }
    expect(minAdjacentGap(ys)).toBeGreaterThanOrEqual(18)
    // Equal values keep their input order top to bottom.
    expect(ys).toEqual([...ys].sort((a, b) => a - b))
  })

  it('separates five close values without overlap', () => {
    const values = [45_500_000, 45_200_000, 48_280_000, 45_400_000, 45_300_000]
    const ys = layoutFlip(values, 200, 18)
    expect(ys).toHaveLength(5)
    expect(minAdjacentGap(ys)).toBeGreaterThanOrEqual(18)
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(200)
    }
    // Order on the chart follows price.
    const byY = values.map((v, i) => ({ v, y: ys[i] ?? 0 })).sort((p, q) => p.y - q.y)
    expect(byY.map((p) => p.v)).toEqual([...values].sort((a, b) => a - b))
  })

  it('distributes evenly over the height when the gap cannot fit', () => {
    expect(layoutFlip([5, 4, 3, 2, 1], 40, 18)).toEqual([40, 30, 20, 10, 0])
  })

  it('returns nothing for no values', () => {
    expect(layoutFlip([], 200, 18)).toEqual([])
  })
})
