import { describe, expect, it } from 'vitest'
import { DEFAULT_RATES } from '../api/client'
import { Brief, type Tender } from '../api/schemas'
import verifiedBrief from '../test/fixtures/verified-brief.json'
import { levelTender } from './leveling'
import { buildVerdict } from './verdict'

const tender = Brief.parse(verifiedBrief).tender
const NO_OPEN = { unpriced: 0, inspection: 0 }

/** Levels a deep copy of the sample after `edit` changes it; the shared fixture stays intact. */
function levelsAfter(edit: (t: Tender) => void) {
  const copy = structuredClone(tender)
  edit(copy)
  return levelTender(copy, DEFAULT_RATES, [])
}

function setHeadline(t: Tender, vendorId: string, euros: number): void {
  const vendor = t.vendors.find((v) => v.id === vendorId)
  if (!vendor) throw new Error(`fixture lost ${vendorId}`)
  vendor.headline_price = euros
}

/** Every cell COMPLIANT, unpriced-free and with a €0 adder. */
function makeAllCompliant(t: Tender): void {
  for (const param of t.parameters) {
    for (const extraction of Object.values(param.vendors)) {
      extraction.status = 'COMPLIANT'
      extraction.pricing_status = 'NONE'
      extraction.cost_lines = []
      extraction.cost_adder = 0
    }
  }
}

describe('buildVerdict', () => {
  it('reversal sentence for the sample', () => {
    const verdict = buildVerdict(levelTender(tender, DEFAULT_RATES, []), NO_OPEN)
    expect(verdict.kind).toBe('reversal')
    expect(verdict.sentence).toBe(
      'VoltSwitch Industrial bid €418,000, the lowest. With its gaps priced in, it costs €479,650. Nordwerk Schaltanlagen GmbH is the lowest evaluated bid at €452,000.',
    )
    expect(verdict.caveat).toBeNull()
    expect(verdict.missingPrice).toEqual([])
  })

  it('holds when the low bidder stays lowest once its gaps are priced', () => {
    const levels = levelsAfter((t) => {
      setHeadline(t, 'vendor-b', 380_000)
    })
    const verdict = buildVerdict(levels, NO_OPEN)
    expect(verdict.kind).toBe('holds')
    expect(verdict.sentence).toBe(
      'VoltSwitch Industrial is the lowest bid at €380,000 and stays lowest once its gaps are priced: €441,650.',
    )
  })

  it('no_gaps when every priced bid meets the spec', () => {
    const levels = levelsAfter(makeAllCompliant)
    const verdict = buildVerdict(levels, NO_OPEN)
    expect(verdict.kind).toBe('no_gaps')
    expect(verdict.sentence).toBe(
      'All 3 bids meet the spec as written. VoltSwitch Industrial is the lowest at €418,000.',
    )
  })

  it('an unpriced gap with a €0 adder is never "meets the spec" (R17)', () => {
    const levels = levelsAfter((t) => {
      makeAllCompliant(t)
      const cell = t.parameters.find((p) => p.id === 'PARAM-01')?.vendors['vendor-b']
      if (!cell) throw new Error('fixture lost PARAM-01 / vendor-b')
      cell.status = 'DEVIATION_DOWNGRADE'
      cell.pricing_status = 'UNPRICED'
    })
    expect(levels.every((l) => l.techCents + l.commercialCents === 0)).toBe(true)
    const verdict = buildVerdict(levels, { unpriced: 1, inspection: 0 })
    expect(verdict.kind).toBe('holds')
    expect(verdict.sentence).toBe(
      'VoltSwitch Industrial is the lowest bid at €418,000 and stays lowest once its gaps are priced: €418,000.',
    )
    expect(verdict.caveat).toBe('This excludes 1 unpriced gap.')
  })

  it('an overridden compliant cell with an adder is not no_gaps', () => {
    const t = structuredClone(tender)
    makeAllCompliant(t)
    const levels = levelTender(t, DEFAULT_RATES, [
      { param_id: 'PARAM-08', vendor_id: 'vendor-b', adder_eur: '1000', note: 'site survey' },
    ])
    expect(buildVerdict(levels, NO_OPEN).kind).toBe('holds')
  })

  it('tie when two bids share the lowest evaluated price', () => {
    // Deltaport's gaps add €15,000; a €437,000 bid lands on Nordwerk's €452,000.
    const levels = levelsAfter((t) => {
      setHeadline(t, 'vendor-c', 437_000)
    })
    const verdict = buildVerdict(levels, NO_OPEN)
    expect(verdict.kind).toBe('tie')
    expect(verdict.sentence).toBe(
      'Nordwerk Schaltanlagen GmbH and Deltaport Skid Consortium B.V. tie at €452,000 evaluated.',
    )
  })

  it('tie names every tied bidder', () => {
    const levels = levelsAfter((t) => {
      for (const param of t.parameters) {
        for (const extraction of Object.values(param.vendors)) {
          extraction.cost_lines = []
          extraction.cost_adder = 0
        }
      }
      for (const vendor of t.vendors) vendor.headline_price = 450_000
    })
    const verdict = buildVerdict(levels, NO_OPEN)
    expect(verdict.kind).toBe('tie')
    expect(verdict.sentence).toBe(
      'Nordwerk Schaltanlagen GmbH, VoltSwitch Industrial and Deltaport Skid Consortium B.V. tie at €450,000 evaluated.',
    )
  })

  it('missing price excluded', () => {
    const levels = levelsAfter((t) => {
      setHeadline(t, 'vendor-b', 0)
    })
    const verdict = buildVerdict(levels, NO_OPEN)
    expect(verdict.missingPrice).toEqual(['VoltSwitch Industrial'])
    expect(verdict.kind).toBe('reversal')
    expect(verdict.sentence).toBe(
      'Deltaport Skid Consortium B.V. bid €439,000, the lowest. With its gaps priced in, it costs €454,000. Nordwerk Schaltanlagen GmbH is the lowest evaluated bid at €452,000.',
    )
  })

  it('no_prices when fewer than two bids have a price', () => {
    const levels = levelsAfter((t) => {
      setHeadline(t, 'vendor-a', 0)
      setHeadline(t, 'vendor-c', 0)
    })
    const verdict = buildVerdict(levels, NO_OPEN)
    expect(verdict.kind).toBe('no_prices')
    expect(verdict.missingPrice).toEqual([
      'Nordwerk Schaltanlagen GmbH',
      'Deltaport Skid Consortium B.V.',
    ])
    // R18: the page renders the missingPrice lines itself, so the sentence stays empty.
    expect(verdict.sentence).toBe('')
  })

  it('no_prices for an empty tender has an empty sentence', () => {
    const verdict = buildVerdict([], NO_OPEN)
    expect(verdict).toEqual({ kind: 'no_prices', sentence: '', caveat: null, missingPrice: [] })
  })

  it('caveat lists only non-zero parts', () => {
    const levels = levelTender(tender, DEFAULT_RATES, [])
    expect(buildVerdict(levels, { unpriced: 2, inspection: 0 }).caveat).toBe(
      'This excludes 2 unpriced gaps.',
    )
    expect(buildVerdict(levels, { unpriced: 0, inspection: 1 }).caveat).toBe(
      'This excludes 1 item that needs inspection.',
    )
    expect(buildVerdict(levels, { unpriced: 1, inspection: 3 }).caveat).toBe(
      'This excludes 1 unpriced gap and 3 items that need inspection.',
    )
    expect(buildVerdict(levels, NO_OPEN).caveat).toBeNull()
  })

  it('leaves the shared fixture untouched', () => {
    expect(Brief.parse(verifiedBrief).tender).toEqual(tender)
    expect(tender.vendors.map((v) => v.headline_price)).toEqual([452_000, 418_000, 439_000])
  })
})
