import { describe, expect, it } from 'vitest'
import { DEFAULT_RATES } from '../api/client'
import { Brief, type Tender } from '../api/schemas'
import verifiedBrief from '../test/fixtures/verified-brief.json'
import { anchorFor, defaultSelection, footnoteIndex, resolveAnchor } from './footnotes'
import { levelTender } from './leveling'
import { buildVerdict } from './verdict'

const tender = Brief.parse(verifiedBrief).tender
const levels = levelTender(tender, DEFAULT_RATES, [])
const NO_OPEN = { unpriced: 0, inspection: 0 }

function cloneTender(): Tender {
  return structuredClone(tender)
}

describe('anchorFor', () => {
  it('is f-{vendor_id}-{param_id}', () => {
    expect(anchorFor('vendor-b', 'PARAM-01')).toBe('f-vendor-b-PARAM-01')
  })
})

describe('footnoteIndex', () => {
  it('numbers ten footnotes in vendor then parameter order', () => {
    const notes = footnoteIndex(tender, levels)
    expect(notes).toHaveLength(10)
    expect(notes.map((n) => n.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(notes.map((n) => `${n.vendorId}/${n.paramId}`)).toEqual([
      'vendor-b/PARAM-01',
      'vendor-b/PARAM-02',
      'vendor-b/PARAM-03',
      'vendor-b/PARAM-04',
      'vendor-b/PARAM-05',
      'vendor-b/PARAM-06',
      'vendor-c/PARAM-01',
      'vendor-c/PARAM-04',
      'vendor-c/PARAM-05',
      'vendor-c/PARAM-06',
    ])
    expect(notes[0]?.anchor).toBe('f-vendor-b-PARAM-01')
  })

  it('numbers an overridden compliant cell and skips upgrades', () => {
    const t = cloneTender()
    const p7 = t.parameters.find((p) => p.id === 'PARAM-07')
    const upgraded = p7?.vendors['vendor-a']
    if (!upgraded) throw new Error('fixture lost PARAM-07 / vendor-a')
    upgraded.status = 'DEVIATION_UPGRADE'
    const overridden = levelTender(t, DEFAULT_RATES, [
      { param_id: 'PARAM-08', vendor_id: 'vendor-a', adder_eur: '1000', note: 'site survey' },
    ])
    const notes = footnoteIndex(t, overridden)
    expect(notes[0]).toEqual({
      number: 1,
      vendorId: 'vendor-a',
      paramId: 'PARAM-08',
      anchor: 'f-vendor-a-PARAM-08',
    })
    expect(notes).toHaveLength(11)
  })

  it('skips a parameter the vendor has no cell for', () => {
    const t = cloneTender()
    const p1 = t.parameters.find((p) => p.id === 'PARAM-01')
    if (!p1) throw new Error('fixture lost PARAM-01')
    delete p1.vendors['vendor-b']
    const notes = footnoteIndex(t, levelTender(t, DEFAULT_RATES, []))
    expect(notes).toHaveLength(9)
    expect(notes[0]?.paramId).toBe('PARAM-02')
  })
})

describe('resolveAnchor', () => {
  it('finds a cell by its anchor, with or without the hash', () => {
    expect(resolveAnchor(tender, '#f-vendor-b-PARAM-01')).toEqual({
      vendorId: 'vendor-b',
      paramId: 'PARAM-01',
    })
    expect(resolveAnchor(tender, 'f-vendor-c-PARAM-08')).toEqual({
      vendorId: 'vendor-c',
      paramId: 'PARAM-08',
    })
  })

  it('resolves compliant cells too', () => {
    expect(resolveAnchor(tender, '#f-vendor-a-PARAM-07')).toEqual({
      vendorId: 'vendor-a',
      paramId: 'PARAM-07',
    })
  })

  it('ignores unknown anchors', () => {
    expect(resolveAnchor(tender, '#f-garbage')).toBeNull()
    expect(resolveAnchor(tender, '')).toBeNull()
    expect(resolveAnchor(tender, '#')).toBeNull()
    expect(resolveAnchor(tender, '#f-vendor-z-PARAM-01')).toBeNull()
    expect(resolveAnchor(tender, '#f-vendor-a-PARAM-99')).toBeNull()
  })

  it('survives a malformed percent-encoding', () => {
    expect(resolveAnchor(tender, '#f-%E0%A4%A')).toBeNull()
  })

  it('decodes a percent-encoded hash', () => {
    expect(resolveAnchor(tender, '#f-vendor%2Db-PARAM-01')).toEqual({
      vendorId: 'vendor-b',
      paramId: 'PARAM-01',
    })
  })

  it('returns null for a well-formed anchor whose cell no longer exists', () => {
    const t = cloneTender()
    const p1 = t.parameters.find((p) => p.id === 'PARAM-01')
    if (!p1) throw new Error('fixture lost PARAM-01')
    delete p1.vendors['vendor-b']
    expect(resolveAnchor(t, '#f-vendor-b-PARAM-01')).toBeNull()
    // The cell next to it still resolves.
    expect(resolveAnchor(t, '#f-vendor-b-PARAM-02')).toEqual({
      vendorId: 'vendor-b',
      paramId: 'PARAM-02',
    })
  })

  it('looks up IDs containing dashes instead of splitting', () => {
    const t = cloneTender()
    const vendor = t.vendors.find((v) => v.id === 'vendor-b')
    const p1 = t.parameters.find((p) => p.id === 'PARAM-01')
    const cell = p1?.vendors['vendor-b']
    if (!vendor || !p1 || !cell) throw new Error('fixture lost vendor-b / PARAM-01')
    vendor.id = 'volt-switch-ind'
    p1.vendors['volt-switch-ind'] = cell
    expect(resolveAnchor(t, '#f-volt-switch-ind-PARAM-01')).toEqual({
      vendorId: 'volt-switch-ind',
      paramId: 'PARAM-01',
    })
  })
})

describe('defaultSelection', () => {
  it('default selection is VoltSwitch PARAM-01', () => {
    const verdict = buildVerdict(levels, NO_OPEN)
    expect(defaultSelection(tender, levels, verdict)).toBe('f-vendor-b-PARAM-01')
  })

  it("picks the low bidder's first numbered cell on a reversal, not the first overall", () => {
    // Deltaport becomes the apparent low bidder; VoltSwitch's cells come first in order.
    const t = cloneTender()
    const volt = t.vendors.find((v) => v.id === 'vendor-b')
    if (!volt) throw new Error('fixture lost vendor-b')
    volt.headline_price = 445_000
    const lv = levelTender(t, DEFAULT_RATES, [])
    const verdict = buildVerdict(lv, NO_OPEN)
    expect(verdict.kind).toBe('reversal')
    expect(defaultSelection(t, lv, verdict)).toBe('f-vendor-c-PARAM-01')
  })

  it('falls back to the first numbered cell when the verdict is not a reversal', () => {
    const t = cloneTender()
    const volt = t.vendors.find((v) => v.id === 'vendor-b')
    if (!volt) throw new Error('fixture lost vendor-b')
    volt.headline_price = 380_000
    const lv = levelTender(t, DEFAULT_RATES, [])
    const verdict = buildVerdict(lv, NO_OPEN)
    expect(verdict.kind).toBe('holds')
    expect(defaultSelection(t, lv, verdict)).toBe('f-vendor-b-PARAM-01')
  })

  it('falls back to the first numbered cell when the low bidder has none', () => {
    const verdict = buildVerdict(levels, NO_OPEN)
    const t = cloneTender()
    for (const param of t.parameters) {
      const cell = param.vendors['vendor-b']
      if (cell) cell.status = 'COMPLIANT'
    }
    expect(defaultSelection(t, levels, verdict)).toBe('f-vendor-c-PARAM-01')
  })

  it('is null when no cell is numbered', () => {
    const t = cloneTender()
    for (const param of t.parameters) {
      for (const cell of Object.values(param.vendors)) cell.status = 'COMPLIANT'
    }
    const lv = levelTender(t, DEFAULT_RATES, [])
    expect(defaultSelection(t, lv, buildVerdict(lv, NO_OPEN))).toBeNull()
  })
})
