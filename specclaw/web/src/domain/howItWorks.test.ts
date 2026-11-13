import { describe, expect, it } from 'vitest'
import { DEFAULT_RATES } from '../api/client'
import { Brief } from '../api/schemas'
import verifiedJson from '../test/fixtures/verified-brief.json'
import { checkSpecimen, priceSpecimen, readSpecimen } from './howItWorks'
import { levelTender } from './leveling'

const sample = () => Brief.parse(verifiedJson)
const volt01 = (brief: Brief) =>
  brief.tender.parameters.find((p) => p.id === 'PARAM-01')!.vendors['vendor-b']!

describe('readSpecimen', () => {
  it("pairs the spec's requirement with the sentence VoltSwitch's bid answers it with", () => {
    const specimen = readSpecimen(sample())
    expect(specimen?.vendorName).toBe('VoltSwitch Industrial')
    expect(specimen?.requirement).toMatchObject({
      filename: 'MR-33kV-GIS-Rev4.pdf',
      page: 5,
      quote: 'Rated short-time withstand current Ik shall be 50 kA RMS for a duration of 3 s.',
    })
    expect(specimen?.found).toMatchObject({
      page: 11,
      section: 'drawing',
      bbox: [56, 65.2, 509.5, 79],
    })
  })

  it('is null without the requirement or the answer on record', () => {
    const noRequirement = sample()
    noRequirement.tender.parameters.find((p) => p.id === 'PARAM-01')!.requirement_citation = null
    expect(readSpecimen(noRequirement)).toBeNull()
    const noAnswer = sample()
    volt01(noAnswer).citation = null
    expect(readSpecimen(noAnswer)).toBeNull()
  })

  it('is null for a tender without a contradiction', () => {
    const brief = sample()
    for (const p of brief.tender.parameters) {
      for (const cell of Object.values(p.vendors)) cell.conflict_note = null
    }
    expect(readSpecimen(brief)).toBeNull()
    expect(priceSpecimen(brief, DEFAULT_RATES)).toBeNull()
  })
})

describe('checkSpecimen', () => {
  it("shows Deltaport's 104 °F read as 40 °C against the ≥ 40 °C limit, and the quote count", () => {
    const specimen = checkSpecimen(sample())
    expect(specimen).toMatchObject({
      vendorName: 'Deltaport Skid Consortium B.V.',
      paramName: 'Max Ambient Temperature (No Derating)',
      check: { offered: '104 °F', offered_canonical: '40 °C', operator: 'ge', required: '40 °C' },
      verified: { found: 36, total: 36 },
    })
  })

  it('has no quote count without a recorded run', () => {
    const brief = sample()
    brief.ingest_stats = null
    expect(checkSpecimen(brief)?.verified).toBeNull()
  })

  it('is null when no value was converted', () => {
    const brief = sample()
    for (const p of brief.tender.parameters) {
      for (const cell of Object.values(p.vendors)) {
        for (const check of cell.checks) check.offered_canonical = check.offered
      }
    }
    expect(checkSpecimen(brief)).toBeNull()
  })
})

describe('priceSpecimen', () => {
  it("prices VoltSwitch's PARAM-01 gap line by line, to the adder the brief shows", () => {
    const brief = sample()
    const specimen = priceSpecimen(brief, DEFAULT_RATES)
    expect(specimen?.paramName).toBe('Rated Short-Time Withstand Current (Ik)')
    expect(specimen?.lines).toEqual([
      {
        label: 'Vacuum breaker & CT core upgrade to 50 kA / 3 s',
        qty: '11',
        unit: 'bays',
        rateCents: 160_000,
        cents: 1_760_000,
      },
      { label: 'Type-test documentation', qty: '1', unit: 'lot', rateCents: 90_000, cents: 90_000 },
    ])
    const levels = levelTender(brief.tender, DEFAULT_RATES, brief.overrides)
    const adder = levels
      .find((l) => l.vendorId === 'vendor-b')
      ?.cells.find((c) => c.paramId === 'PARAM-01')?.adderCents
    expect(specimen?.totalCents).toBe(adder)
  })

  it('is null when the gap has no cost lines, or an override priced it', () => {
    const bare = sample()
    volt01(bare).cost_lines = []
    expect(priceSpecimen(bare, DEFAULT_RATES)).toBeNull()
    const overridden = sample()
    overridden.overrides = [
      { param_id: 'PARAM-01', vendor_id: 'vendor-b', adder_eur: '12000.00', note: 'Quoted' },
    ]
    expect(priceSpecimen(overridden, DEFAULT_RATES)).toBeNull()
    // An override elsewhere leaves this gap's lines in charge.
    overridden.overrides = [
      { param_id: 'PARAM-02', vendor_id: 'vendor-b', adder_eur: '12000.00', note: 'Quoted' },
    ]
    expect(priceSpecimen(overridden, DEFAULT_RATES)?.totalCents).toBe(1_850_000)
  })
})
