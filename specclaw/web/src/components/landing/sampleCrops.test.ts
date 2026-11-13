import { describe, expect, it } from 'vitest'
import { Brief } from '../../api/schemas'
import verifiedJson from '../../test/fixtures/verified-brief.json'
import { landingCrops, sampleCropPath } from './sampleCrops'

// That the committed crops exist for the committed snapshot: scripts/snapshot-sample.test.ts.

describe('landingCrops', () => {
  it("names both quotes of the sample's contradiction", () => {
    expect(landingCrops(Brief.parse(verifiedJson))).toEqual([
      { paramId: 'PARAM-01', source: 'vendor-b', which: 'primary' },
      { paramId: 'PARAM-01', source: 'vendor-b', which: 'secondary' },
    ])
  })

  it("follows the replay's contradiction: without PARAM-01's second quote, the next one", () => {
    const brief = Brief.parse(verifiedJson)
    const cell = brief.tender.parameters.find((p) => p.id === 'PARAM-01')!.vendors['vendor-b']!
    cell.secondary_citation = null
    expect(landingCrops(brief).map((c) => c.paramId)).toEqual(['PARAM-04', 'PARAM-04'])
  })

  it('is empty when the contradiction lacks its governing quote', () => {
    const brief = Brief.parse(verifiedJson)
    const cell = brief.tender.parameters.find((p) => p.id === 'PARAM-01')!.vendors['vendor-b']!
    cell.citation = null
    expect(landingCrops(brief)).toEqual([])
  })

  it('serves each crop at the evidence path, under /sample', () => {
    expect(sampleCropPath({ paramId: 'PARAM-01', source: 'vendor-b', which: 'secondary' })).toBe(
      '/sample/evidence/PARAM-01/vendor-b/secondary.png',
    )
  })
})
