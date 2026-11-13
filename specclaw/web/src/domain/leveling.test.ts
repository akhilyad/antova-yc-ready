import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { DEFAULT_RATES } from '../api/client'
import { Brief, ParityCase, type Extraction, type Rates, type Tender } from '../api/schemas'
import parityCases from '../test/fixtures/parity-cases.json'
import verifiedBrief from '../test/fixtures/verified-brief.json'
import { adderCents, levelTender, lineCents } from './leveling'
import { formatEur } from './money'

const tender = Brief.parse(verifiedBrief).tender
const cases = z.array(ParityCase).parse(parityCases)

/** A tender copy that tests may edit without touching the shared fixture. */
function cloneTender(): Tender {
  return structuredClone(tender)
}

function extraction(overrides: Partial<Extraction>): Extraction {
  const base = tender.parameters[0]?.vendors['vendor-a']
  if (!base) throw new Error('fixture lost PARAM-01 / vendor-a')
  return { ...structuredClone(base), ...overrides }
}

function levelOf(
  rates: Rates,
  vendorId: string,
  overrides: Parameters<typeof levelTender>[2] = [],
) {
  const level = levelTender(tender, rates, overrides).find((v) => v.vendorId === vendorId)
  if (!level) throw new Error(`no level for ${vendorId}`)
  return level
}

describe('levelTender', () => {
  it('matches the Python engine on every parity case', () => {
    expect(cases).toHaveLength(96)
    const mismatches: string[] = []
    cases.forEach((c, index) => {
      const label =
        `case ${String(index)} (copper ${String(c.rates.copper)}, labour ${String(c.rates.labour)}, ` +
        `freight ${String(c.rates.freight)}, ${String(c.overrides.length)} override(s))`
      const levels = levelTender(tender, c.rates, c.overrides)
      const order = levels.map((l) => l.vendorId).join(',')
      const wantOrder = c.expected.map((e) => e.vendor_id).join(',')
      if (order !== wantOrder) mismatches.push(`${label}: vendor order ${order}, want ${wantOrder}`)
      for (const want of c.expected) {
        const got = levels.find((l) => l.vendorId === want.vendor_id)
        if (!got) {
          mismatches.push(`${label} ${want.vendor_id}: missing`)
          continue
        }
        const pairs: [string, number, number][] = [
          ['tech', got.techCents, Math.round(want.total_tech_penalty * 100)],
          ['commercial', got.commercialCents, Math.round(want.total_commercial_adder * 100)],
          // Every parity case is the sample tender, where each vendor has a headline price.
          [
            'evaluated',
            got.evaluatedCents,
            Math.round((want.true_evaluated_price ?? Number.NaN) * 100),
          ],
        ]
        for (const [name, gotCents, wantCents] of pairs) {
          if (gotCents !== wantCents) {
            mismatches.push(
              `${label} ${want.vendor_id} ${name}: TS ${String(gotCents)} cents, Python ${String(wantCents)} cents`,
            )
          }
        }
      }
    })
    expect(mismatches).toEqual([])
  })

  it('VoltSwitch at default rates is €479,650', () => {
    const volt = levelOf(DEFAULT_RATES, 'vendor-b')
    expect(volt.name).toBe('VoltSwitch Industrial')
    expect(volt.headlineCents).toBe(41_800_000)
    expect(volt.techCents).toBe(4_900_000)
    expect(volt.commercialCents).toBe(1_265_000)
    expect(formatEur(volt.evaluatedCents)).toBe('€479,650')
  })

  it('override ignores copper multiplier', () => {
    const override = {
      param_id: 'PARAM-02',
      vendor_id: 'vendor-b',
      adder_eur: '10000.00',
      note: 'Priced from the clarification',
    }
    const low = levelOf({ ...DEFAULT_RATES, copper: 1 }, 'vendor-b', [override])
    const high = levelOf({ ...DEFAULT_RATES, copper: 2.5 }, 'vendor-b', [override])
    const cell = high.cells.find((c) => c.paramId === 'PARAM-02')
    expect(cell).toMatchObject({
      adderCents: 1_000_000,
      overridden: true,
      overrideNote: 'Priced from the clarification',
    })
    expect(high.evaluatedCents).toBe(low.evaluatedCents)
    // Without the override the copper slider does move the price.
    expect(levelOf({ ...DEFAULT_RATES, copper: 2.5 }, 'vendor-b').evaluatedCents).not.toBe(
      levelOf(DEFAULT_RATES, 'vendor-b').evaluatedCents,
    )
  })

  it('keeps vendor order and describes each cell', () => {
    const levels = levelTender(tender, DEFAULT_RATES, [])
    expect(levels.map((l) => l.vendorId)).toEqual(['vendor-a', 'vendor-b', 'vendor-c'])
    const volt = levels[1]
    expect(volt?.cells.map((c) => c.paramId)).toEqual(tender.parameters.map((p) => p.id))
    expect(volt?.cells[0]).toEqual({
      paramId: 'PARAM-01',
      status: 'CONFLICT_DOWNGRADE',
      pricingStatus: 'PRICED',
      adderCents: 1_850_000,
      overridden: false,
      overrideNote: null,
      commercial: false,
    })
    expect(volt?.cells.find((c) => c.paramId === 'PARAM-05')?.commercial).toBe(true)
  })

  it('skips a parameter a vendor has no extraction for', () => {
    const edited = cloneTender()
    const param = edited.parameters[0]
    if (!param) throw new Error('fixture lost PARAM-01')
    delete param.vendors['vendor-b']
    const volt = levelTender(edited, DEFAULT_RATES, []).find((v) => v.vendorId === 'vendor-b')
    expect(volt?.cells.map((c) => c.paramId)).not.toContain('PARAM-01')
    expect(volt?.techCents).toBe(4_900_000 - 1_850_000)
  })

  it('ignores an override for another vendor', () => {
    const override = { param_id: 'PARAM-02', vendor_id: 'vendor-c', adder_eur: '5.00', note: 'n' }
    const volt = levelOf(DEFAULT_RATES, 'vendor-b', [override])
    expect(volt.evaluatedCents).toBe(47_965_000)
    expect(volt.cells.every((c) => !c.overridden)).toBe(true)
  })
})

describe('adderCents', () => {
  const rates: Rates = { copper: 2, labour: 75, freight: 3 }

  it('prices each driver', () => {
    const line = { label: 'x', unit: 'u', qty: '10', rate: '1.50' }
    expect(adderCents(extraction({ cost_lines: [{ ...line, driver: 'fixed' }] }), rates)).toBe(
      1_500,
    )
    expect(adderCents(extraction({ cost_lines: [{ ...line, driver: 'copper' }] }), rates)).toBe(
      3_000,
    )
    // Labour lines store hours; the rate is the slider's €/h, not the line's rate.
    expect(adderCents(extraction({ cost_lines: [{ ...line, driver: 'labour' }] }), rates)).toBe(
      75_000,
    )
    expect(adderCents(extraction({ cost_lines: [{ ...line, driver: 'freight' }] }), rates)).toBe(
      4_500,
    )
  })

  it('sums the lines unrounded, then rounds half-up to cents', () => {
    const tiny = { label: 'x', unit: 'u', qty: '1', rate: '0.004', driver: 'fixed' as const }
    // 0.004 + 0.004 = 0.008 → 1 cent; rounding each line first would give 0.
    expect(adderCents(extraction({ cost_lines: [tiny, tiny] }), rates)).toBe(1)
    const half = { ...tiny, rate: '0.005' }
    expect(adderCents(extraction({ cost_lines: [half] }), rates)).toBe(1)
  })

  it('takes multipliers by their decimal string, not their binary value', () => {
    // 0.7 × 1.15 as floats is 0.8049999999999999 (→ 0.80); as decimals it is 0.805 (→ 0.81).
    const line = { label: 'x', unit: 'u', qty: '1', rate: '0.70', driver: 'copper' as const }
    expect(adderCents(extraction({ cost_lines: [line] }), { ...rates, copper: 1.15 })).toBe(81)
  })

  it('uses cost_adder when there are no cost lines', () => {
    expect(adderCents(extraction({ cost_lines: [], cost_adder: 1234.5 }), rates)).toBe(123_450)
  })
})

describe('lineCents', () => {
  it('prices one line under the sliders, rounded on its own', () => {
    const rates: Rates = { copper: 2, labour: 75, freight: 3 }
    const line = { label: 'x', unit: 'u', qty: '10', rate: '1.50' }
    expect(lineCents({ ...line, driver: 'fixed' }, rates)).toBe(1_500)
    expect(lineCents({ ...line, driver: 'copper' }, rates)).toBe(3_000)
    expect(lineCents({ ...line, driver: 'labour' }, rates)).toBe(75_000)
    expect(lineCents({ ...line, driver: 'freight' }, rates)).toBe(4_500)
    // A line alone rounds half-up: 0.005 → 1 cent.
    expect(lineCents({ ...line, qty: '1', rate: '0.005', driver: 'fixed' }, rates)).toBe(1)
  })
})
