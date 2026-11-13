import { describe, expect, it } from 'vitest'
import { DEFAULT_RATES } from '../api/client'
import { Brief } from '../api/schemas'
import verifiedJson from '../test/fixtures/verified-brief.json'
import { levelTender, type VendorLevel } from './leveling'
import { receiptFor } from './receipt'

const brief = Brief.parse(verifiedJson)
const levels = levelTender(brief.tender, DEFAULT_RATES, brief.overrides)

describe('receiptFor', () => {
  it("lists VoltSwitch's priced gaps, technical then commercial, with their footnotes", () => {
    const receipt = receiptFor(brief.tender, levels, 'vendor-b')
    expect(receipt).not.toBeNull()
    expect(receipt?.name).toBe('VoltSwitch Industrial')
    expect(receipt?.bidCents).toBe(41_800_000)
    expect(receipt?.technical.map((l) => [l.paramId, l.adderCents, l.footnote?.number])).toEqual([
      ['PARAM-01', 1_850_000, 1],
      ['PARAM-02', 1_420_000, 2],
      ['PARAM-03', 890_000, 3],
      ['PARAM-04', 740_000, 4],
    ])
    expect(receipt?.commercial.map((l) => [l.paramId, l.adderCents, l.footnote?.number])).toEqual([
      ['PARAM-05', 650_000, 5],
      ['PARAM-06', 930_000, 6],
    ])
    expect(receipt?.technical[0]?.name).toBe('Rated Short-Time Withstand Current (Ik)')
    expect(receipt?.technical[0]?.footnote?.anchor).toBe('f-vendor-b-PARAM-01')
  })

  it('adds up: bid plus every line is the evaluated price, and each group its subtotal', () => {
    for (const level of levels) {
      const receipt = receiptFor(brief.tender, levels, level.vendorId)!
      const sum = (lines: { adderCents: number }[]) => lines.reduce((s, l) => s + l.adderCents, 0)
      expect(sum(receipt.technical)).toBe(receipt.techCents)
      expect(sum(receipt.commercial)).toBe(receipt.commercialCents)
      expect(receipt.bidCents + receipt.techCents + receipt.commercialCents).toBe(
        receipt.evaluatedCents,
      )
    }
  })

  it('leaves out a fully compliant vendor’s lines', () => {
    const receipt = receiptFor(brief.tender, levels, 'vendor-a')
    expect(receipt?.technical).toEqual([])
    expect(receipt?.commercial).toEqual([])
    expect(receipt?.evaluatedCents).toBe(receipt?.bidCents)
  })

  it('is null for a vendor the levels do not have', () => {
    expect(receiptFor(brief.tender, levels, 'vendor-x')).toBeNull()
  })

  it('names an unknown parameter by its ID and leaves an unnumbered cell without a footnote', () => {
    const volt = levels.find((l) => l.vendorId === 'vendor-b')!
    // A priced cell the tender neither names nor footnotes (not a real brief; the fallbacks).
    const odd: VendorLevel = {
      ...volt,
      cells: [
        {
          paramId: 'PARAM-99',
          status: 'COMPLIANT',
          pricingStatus: 'PRICED',
          adderCents: 100,
          overridden: false,
          overrideNote: null,
          commercial: false,
        },
      ],
    }
    const receipt = receiptFor(brief.tender, [odd], 'vendor-b')
    expect(receipt?.technical).toEqual([
      { paramId: 'PARAM-99', name: 'PARAM-99', adderCents: 100, footnote: null },
    ])
  })
})
