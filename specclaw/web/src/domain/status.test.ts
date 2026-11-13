import { describe, expect, it } from 'vitest'
import { copy } from '../content/copy'
import { statusTag } from './status'

describe('statusTag: one case per §8.2 row', () => {
  it('COMPLIANT → ✓ Meets spec, ok', () => {
    expect(statusTag('COMPLIANT', 'NONE', false)).toEqual({
      glyph: '✓',
      word: 'Meets spec',
      severity: 'ok',
    })
  })

  it('DEVIATION_UPGRADE → ↑ Exceeds spec, ok', () => {
    expect(statusTag('DEVIATION_UPGRADE', 'NONE', false)).toEqual({
      glyph: '↑',
      word: 'Exceeds spec',
      severity: 'ok',
    })
  })

  it('DEVIATION_DOWNGRADE → ✗ Gap, gap', () => {
    expect(statusTag('DEVIATION_DOWNGRADE', 'PRICED', false)).toEqual({
      glyph: '✗',
      word: 'Gap',
      severity: 'gap',
    })
  })

  it('CONFLICT_DOWNGRADE → ⇄ Contradiction, gap', () => {
    expect(statusTag('CONFLICT_DOWNGRADE', 'PRICED', false)).toEqual({
      glyph: '⇄',
      word: 'Contradiction',
      severity: 'gap',
    })
  })

  it('OMITTED → ∅ Missing, gap', () => {
    expect(statusTag('OMITTED', 'PRICED', false)).toEqual({
      glyph: '∅',
      word: 'Missing',
      severity: 'gap',
    })
  })

  it('UNPRICED, not overridden → €? Unpriced, open', () => {
    expect(statusTag('OMITTED', 'UNPRICED', false)).toEqual({
      glyph: '€?',
      word: 'Unpriced',
      severity: 'open',
    })
  })

  it('MANUAL_INSPECTION_REQUIRED, not overridden → ! Needs inspection, open', () => {
    expect(statusTag('MANUAL_INSPECTION_REQUIRED', 'NONE', false)).toEqual({
      glyph: '!',
      word: 'Needs inspection',
      severity: 'open',
    })
  })
})

describe('statusTag: precedence (ruling R15)', () => {
  it('an open UNPRICED wins over a DEVIATION_DOWNGRADE status', () => {
    expect(statusTag('DEVIATION_DOWNGRADE', 'UNPRICED', false)).toEqual({
      glyph: '€?',
      word: 'Unpriced',
      severity: 'open',
    })
  })

  it('an open UNPRICED wins over MANUAL_INSPECTION_REQUIRED', () => {
    expect(statusTag('MANUAL_INSPECTION_REQUIRED', 'UNPRICED', false)).toEqual({
      glyph: '€?',
      word: 'Unpriced',
      severity: 'open',
    })
  })

  it('an overridden UNPRICED cell shows its status row', () => {
    expect(statusTag('DEVIATION_DOWNGRADE', 'UNPRICED', true)).toEqual({
      glyph: '✗',
      word: 'Gap',
      severity: 'gap',
    })
    expect(statusTag('OMITTED', 'UNPRICED', true)).toEqual({
      glyph: '∅',
      word: 'Missing',
      severity: 'gap',
    })
  })

  it('an overridden MANUAL_INSPECTION_REQUIRED shows ! Needs inspection, gap', () => {
    expect(statusTag('MANUAL_INSPECTION_REQUIRED', 'PRICED', true)).toEqual({
      glyph: '!',
      word: 'Needs inspection',
      severity: 'gap',
    })
    expect(statusTag('MANUAL_INSPECTION_REQUIRED', 'UNPRICED', true)).toEqual({
      glyph: '!',
      word: 'Needs inspection',
      severity: 'gap',
    })
  })

  it('an override does not change a non-open status row', () => {
    expect(statusTag('COMPLIANT', 'NONE', true)).toEqual({
      glyph: '✓',
      word: 'Meets spec',
      severity: 'ok',
    })
  })
})

describe('statusTag: copy source', () => {
  it('takes its words and glyphs from the copy deck', () => {
    const tag = statusTag('CONFLICT_DOWNGRADE', 'PRICED', false)
    expect(tag.word).toBe(copy.status.contradiction.word)
    expect(tag.glyph).toBe(copy.status.contradiction.glyph)
  })
})
