import { describe, expect, it } from 'vitest'
import { copy } from './copy'

describe('copy', () => {
  it('fills the reversal verdict', () => {
    expect(
      copy.verdict.reversal({
        low: 'VoltSwitch',
        lowBid: '€482,800',
        lowEval: '€547,600',
        winner: 'Deltaport',
        winnerEval: '€512,300',
      }),
    ).toBe(
      'VoltSwitch bid €482,800, the lowest. With its gaps priced in, it costs €547,600. ' +
        'Deltaport is the lowest evaluated bid at €512,300.',
    )
  })

  it('names only the non-zero parts of the caveat', () => {
    expect(copy.verdict.caveat({ unpricedGaps: 2, inspectionItems: 1 })).toBe(
      'This excludes 2 unpriced gaps and 1 item that needs inspection.',
    )
    expect(copy.verdict.caveat({ unpricedGaps: 1, inspectionItems: 0 })).toBe(
      'This excludes 1 unpriced gap.',
    )
    expect(copy.verdict.caveat({ unpricedGaps: 0, inspectionItems: 3 })).toBe(
      'This excludes 3 items that need inspection.',
    )
    expect(copy.verdict.caveat({ unpricedGaps: 0, inspectionItems: 0 })).toBeNull()
  })

  describe('count strings pluralize by n (R12)', () => {
    it('open items', () => {
      expect(copy.review.openItems(1)).toBe('1 item needs you before this can be verified.')
      expect(copy.review.openItems(3)).toBe('3 items need you before this can be verified.')
    })

    it('verify disabled', () => {
      expect(copy.review.verify.disabled(1)).toBe('Resolve 1 open item first')
      expect(copy.review.verify.disabled(3)).toBe('Resolve 3 open items first')
    })

    it('no-gaps verdict', () => {
      expect(copy.verdict.noGaps({ n: 1, low: 'Deltaport', lowBid: '€482,800' })).toBe(
        'The 1 bid meets the spec as written. Deltaport is the lowest at €482,800.',
      )
      expect(copy.verdict.noGaps({ n: 3, low: 'Deltaport', lowBid: '€482,800' })).toBe(
        'All 3 bids meet the spec as written. Deltaport is the lowest at €482,800.',
      )
    })

    it('check-grid heading', () => {
      expect(copy.brief.gridHeading({ requirements: 1, bidders: 1 })).toBe(
        'All checks: 1 requirement × 1 bidder',
      )
      expect(copy.brief.gridHeading({ requirements: 3, bidders: 3 })).toBe(
        'All checks: 3 requirements × 3 bidders',
      )
    })

    it('check-grid cell name: footnote number after the status word, then needs review', () => {
      const cell = { vendor: 'Deltaport', requirement: 'I-FAT', status: 'Gap' }
      expect(copy.brief.gridCell(cell)).toBe('Deltaport, I-FAT: Gap')
      expect(copy.brief.gridCell({ ...cell, footnote: 9 })).toBe('Deltaport, I-FAT: Gap 9')
      expect(copy.brief.gridCell({ ...cell, footnote: 9, needsReview: true })).toBe(
        'Deltaport, I-FAT: Gap 9, needs review',
      )
      expect(copy.brief.gridCell({ ...cell, needsReview: true })).toBe(
        'Deltaport, I-FAT: Gap, needs review',
      )
    })

    it('caveat', () => {
      expect(copy.verdict.caveat({ unpricedGaps: 1, inspectionItems: 1 })).toBe(
        'This excludes 1 unpriced gap and 1 item that needs inspection.',
      )
      expect(copy.verdict.caveat({ unpricedGaps: 3, inspectionItems: 3 })).toBe(
        'This excludes 3 unpriced gaps and 3 items that need inspection.',
      )
    })
  })

  it('builds the mailto subject for the offer and lists checklist items', () => {
    expect(copy.landing.mailto.subject('GIS switchgear')).toBe(
      'Evaluation request: GIS switchgear package',
    )
    expect(copy.landing.offer.whatToSend).toHaveLength(4)
    expect(copy.landing.offer.whatComesBack).toHaveLength(4)
  })
})
