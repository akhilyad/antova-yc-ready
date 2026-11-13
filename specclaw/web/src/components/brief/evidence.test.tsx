import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_RATES, type Scope } from '../../api/client'
import { Brief, type ComplianceStatus, type PricingStatus } from '../../api/schemas'
import { copy } from '../../content/copy'
import { levelTender } from '../../domain/leveling'
import verifiedJson from '../../test/fixtures/verified-brief.json'
import { SHARE_ID, TENDER_ID, TEST_REVIEW_TOKEN } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { CheckStrip } from './CheckStrip'
import { FootnoteRef } from './FootnoteRef'
import { MoneyFigure } from './MoneyFigure'
import { PageCrop } from './PageCrop'
import { Sidenote } from './Sidenote'
import { StatusTag } from './StatusTag'

const brief = Brief.parse(verifiedJson)
const tender = brief.tender
const levels = levelTender(tender, DEFAULT_RATES, [])
const publicScope: Scope = { kind: 'public', shareId: SHARE_ID }
const reviewScope: Scope = { kind: 'review', tenderId: TENDER_ID, token: TEST_REVIEW_TOKEN }

function region(name: string) {
  return screen.getByRole('region', { name })
}

describe('Sidenote', () => {
  it('sidenote shows spec, governing quote, struck cover letter, checks and arithmetic for VoltSwitch PARAM-01', () => {
    const headingRef = createRef<HTMLHeadingElement>()
    render(
      <Sidenote
        tender={tender}
        cell={{ vendorId: 'vendor-b', paramId: 'PARAM-01' }}
        scope={publicScope}
        levels={levels}
        headingRef={headingRef}
      />,
    )

    // Heading: the requirement, focusable for the footnote jump.
    expect(headingRef.current).toHaveTextContent('Rated Short-Time Withstand Current (Ik)')
    expect(headingRef.current).toHaveAttribute('tabindex', '-1')
    expect(screen.getByText('Contradiction')).toBeInTheDocument()

    // Sections in spec §7.3 order.
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual([
      'Your spec',
      'The bid says',
      'Also in the bid',
      'On the page',
      'Checks',
      "How it's priced",
    ])

    expect(
      within(region('Your spec')).getByText(/50 kA RMS for a duration of 3 s/),
    ).toBeInTheDocument()
    expect(within(region('Your spec')).getByText('Spec, p. 5')).toBeInTheDocument()

    const bid = region('The bid says')
    expect(within(bid).getByText(/NOTE 7/)).toBeInTheDocument()
    expect(within(bid).getByText('Drawing, p. 11')).toBeInTheDocument()

    const also = region('Also in the bid')
    const struck = within(also).getByText(/50 kA \/ 3 s/)
    expect(struck.closest('s')).not.toBeNull()
    expect(struck.closest('s')).toHaveTextContent(/^Contradicted:/)
    expect(within(also).getByText('The drawing governs over the cover letter.')).toBeInTheDocument()

    const crop = within(region('On the page')).getByRole('img', { hidden: true })
    expect(crop).toHaveAttribute('alt', expect.stringContaining('NOTE 7'))

    const checks = region('Checks')
    const rows = within(checks).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Fails')
    expect(rows[0]).toHaveTextContent('≥ 50 kA')
    expect(rows[0]).toHaveTextContent('31.5 kA')

    const priced = region("How it's priced")
    expect(within(priced).getByText('11 bays × €1,600')).toBeInTheDocument()
    expect(within(priced).getByText('€17,600')).toBeInTheDocument()
    expect(within(priced).getByText('+€18,500')).toBeInTheDocument()
  })

  it('the arithmetic reads "equals" to assistive tech where it shows "="', () => {
    render(
      <Sidenote
        tender={tender}
        cell={{ vendorId: 'vendor-b', paramId: 'PARAM-01' }}
        scope={publicScope}
        levels={levels}
        headingRef={createRef()}
      />,
    )
    const line = within(region("How it's priced")).getByText('11 bays × €1,600').parentElement
    if (line === null) throw new Error('the arithmetic has no parent')
    expect(within(line).getByText('=')).toHaveAttribute('aria-hidden', 'true')
    // What a screen reader gets: the text without the aria-hidden parts.
    const spoken = line.cloneNode(true) as HTMLElement
    for (const hidden of spoken.querySelectorAll('[aria-hidden="true"]')) hidden.remove()
    expect(spoken.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      `11 bays × €1,600 ${copy.brief.pricing.equals} €17,600`,
    )
  })

  it('compliant cell sidenote shows Meets spec and no arithmetic', () => {
    render(
      <Sidenote
        tender={tender}
        cell={{ vendorId: 'vendor-a', paramId: 'PARAM-01' }}
        scope={publicScope}
        levels={levels}
        headingRef={createRef()}
      />,
    )
    expect(screen.getByText('Meets spec')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: "How it's priced" })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Also in the bid' })).toBeNull()
    expect(screen.queryByText(/×/)).toBeNull()
    expect(within(region('Checks')).getAllByRole('row').slice(1)).toHaveLength(2)
  })

  it("override note appears in How it's priced", () => {
    const overridden = levelTender(tender, DEFAULT_RATES, [
      {
        param_id: 'PARAM-01',
        vendor_id: 'vendor-b',
        adder_eur: '12000.00',
        note: "engineer's estimate",
      },
    ])
    render(
      <Sidenote
        tender={tender}
        cell={{ vendorId: 'vendor-b', paramId: 'PARAM-01' }}
        scope={publicScope}
        levels={overridden}
        headingRef={createRef()}
      />,
    )
    const priced = region("How it's priced")
    expect(within(priced).getByText("Overridden: engineer's estimate")).toBeInTheDocument()
    expect(within(priced).getByText('+€12,000')).toBeInTheDocument()
    // The rate-table figure it replaces is shown struck.
    expect(within(priced).getByText('€18,500').closest('s')).not.toBeNull()
  })

  it('renders the review slot after the evidence', () => {
    render(
      <Sidenote
        tender={tender}
        cell={{ vendorId: 'vendor-b', paramId: 'PARAM-01' }}
        scope={publicScope}
        levels={levels}
        headingRef={createRef()}
      >
        <p>review slot</p>
      </Sidenote>,
    )
    expect(screen.getByText('review slot')).toBeInTheDocument()
  })
})

describe('PageCrop', () => {
  it('crop failure shows exact-quote note', async () => {
    server.use(
      http.get('/api/review/tenders/:tenderId/evidence/:paramId/:source/:which', () =>
        HttpResponse.json({ detail: 'Not found' }, { status: 404 }),
      ),
    )
    render(
      <PageCrop
        scope={reviewScope}
        paramId="PARAM-01"
        source="vendor-b"
        which="primary"
        alt="NOTE 7"
      />,
    )
    expect(screen.getByText('Loading the page image')).toBeInTheDocument()
    expect(
      await screen.findByText('Page image unavailable. The quote above is exact.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows a public crop from its plain URL', () => {
    render(
      <PageCrop
        scope={publicScope}
        paramId="PARAM-01"
        source="vendor-b"
        which="primary"
        alt="NOTE 7"
      />,
    )
    const img = screen.getByRole('img', { hidden: true })
    expect(img).toHaveAttribute(
      'src',
      `/api/briefs/${SHARE_ID}/evidence/PARAM-01/vendor-b/primary.png`,
    )
    expect(img).toHaveAttribute('alt', 'NOTE 7')
  })

  it('a loaded crop links to its full-size image in a new tab', () => {
    const src = `/api/briefs/${SHARE_ID}/evidence/PARAM-01/vendor-b/primary.png`
    render(
      <PageCrop
        scope={publicScope}
        paramId="PARAM-01"
        source="vendor-b"
        which="primary"
        alt="NOTE 7"
      />,
    )
    expect(screen.queryByRole('link')).toBeNull()
    fireEvent.load(screen.getByRole('img', { hidden: true }))
    const link = screen.getByRole('link', { name: /Open full size \(opens in a new tab\)/ })
    expect(link).toHaveAttribute('href', src)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    // The label names the link; the image inside it is decorative (the quote says what it shows).
    const image = link.querySelector('img')
    expect(image).toHaveAttribute('src', src)
    expect(image).toHaveAttribute('alt', '')
  })

  it('a public crop that fails to load shows the exact-quote note', () => {
    render(
      <PageCrop scope={publicScope} paramId="PARAM-01" source="mr" which="primary" alt="quote" />,
    )
    fireEvent.error(screen.getByRole('img', { hidden: true }))
    expect(
      screen.getByText('Page image unavailable. The quote above is exact.'),
    ).toBeInTheDocument()
  })

  it('a review crop is fetched with the token and its object URL revoked on unmount', async () => {
    // jsdom has no object URLs; stub both for this test only.
    const created = vi.fn(() => 'blob:crop')
    const revoked = vi.fn()
    const originals = {
      createObjectURL: Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
      revokeObjectURL: Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL'),
    }
    const stub = { configurable: true, writable: true }
    Object.defineProperty(URL, 'createObjectURL', { ...stub, value: created })
    Object.defineProperty(URL, 'revokeObjectURL', { ...stub, value: revoked })
    try {
      const { unmount } = render(
        <PageCrop
          scope={reviewScope}
          paramId="PARAM-01"
          source="vendor-b"
          which="primary"
          alt="NOTE 7"
        />,
      )
      await waitFor(() => {
        expect(screen.getByRole('img', { hidden: true })).toHaveAttribute('src', 'blob:crop')
      })
      fireEvent.load(screen.getByRole('img'))
      expect(screen.queryByText('Loading the page image')).toBeNull()
      // A blob: URL dies with the crop, so a review crop offers no "Open full size" tab.
      expect(screen.queryByRole('link')).toBeNull()
      expect(screen.getByRole('img', { name: 'NOTE 7' })).toBeInTheDocument()
      unmount()
      expect(revoked).toHaveBeenCalledWith('blob:crop')
    } finally {
      for (const [name, original] of Object.entries(originals)) {
        if (original) Object.defineProperty(URL, name, original)
        else Reflect.deleteProperty(URL, name)
      }
    }
  })
})

describe('MoneyFigure', () => {
  it('formats each variant through money.ts', () => {
    render(
      <>
        <MoneyFigure cents={48280000} variant="headline" />
        <MoneyFigure cents={1850000} variant="adder" />
        <MoneyFigure cents={41800000} variant="struck" />
        <MoneyFigure cents={45400050} variant="total" />
      </>,
    )
    expect(screen.getByText('€482,800')).toBeInTheDocument()
    expect(screen.getByText('+€18,500')).toBeInTheDocument()
    expect(screen.getByText('€418,000').closest('s')).not.toBeNull()
    expect(screen.getByText('€454,000.50')).toBeInTheDocument()
  })

  it('settles on the new value when it changes', async () => {
    const { rerender } = render(<MoneyFigure cents={100000} variant="total" />)
    rerender(<MoneyFigure cents={250000} variant="total" />)
    expect(await screen.findByText('€2,500')).toBeInTheDocument()
  })

  it('jumps straight to the new value under reduced motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: query.includes('reduce'), media: query })),
    )
    try {
      const { rerender } = render(<MoneyFigure cents={100000} variant="total" />)
      rerender(<MoneyFigure cents={250000} variant="total" />)
      expect(screen.getByText('€2,500')).toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('StatusTag', () => {
  const cases: [ComplianceStatus, PricingStatus, boolean, string, string][] = [
    ['COMPLIANT', 'NONE', false, '✓', 'Meets spec'],
    ['DEVIATION_DOWNGRADE', 'PRICED', false, '✗', 'Gap'],
    ['CONFLICT_DOWNGRADE', 'PRICED', false, '⇄', 'Contradiction'],
    ['OMITTED', 'PRICED', false, '∅', 'Missing'],
    ['DEVIATION_UPGRADE', 'NONE', false, '↑', 'Exceeds spec'],
    ['DEVIATION_DOWNGRADE', 'UNPRICED', false, '€?', 'Unpriced'],
    ['MANUAL_INSPECTION_REQUIRED', 'NONE', false, '!', 'Needs inspection'],
  ]

  it.each(cases)(
    'status tags render glyph and word for every status (%s, %s)',
    (status, pricing, overridden, glyph, word) => {
      const { container } = render(
        <StatusTag status={status} pricingStatus={pricing} overridden={overridden} />,
      )
      expect(container).toHaveTextContent(`${glyph}${word}`)
    },
  )

  it('status glyphs are aria-hidden and the word is announced', () => {
    render(<StatusTag status="DEVIATION_DOWNGRADE" pricingStatus="PRICED" overridden={false} />)
    expect(screen.getByText('✗')).toHaveAttribute('aria-hidden', 'true')
    const word = screen.getByText('Gap')
    expect(word).not.toHaveAttribute('aria-hidden')
    expect(word.closest('[aria-hidden="true"]')).toBeNull()
  })
})

describe('CheckStrip', () => {
  it('check strip text equivalent', () => {
    const voltSwitch = levels.find((l) => l.vendorId === 'vendor-b')
    if (!voltSwitch) throw new Error('fixture lacks vendor-b')
    const { container } = render(<CheckStrip cells={voltSwitch.cells} />)
    expect(container).toHaveTextContent('2 of 8 requirements met')
    // The eight marks are decoration; the sentence carries the meaning.
    const marks = container.querySelector('[aria-hidden="true"]')
    expect(marks?.textContent).toBe('✗✗✗✗✗✗✓✓')
  })
})

describe('FootnoteRef', () => {
  const footnote = {
    number: 3,
    vendorId: 'vendor-b',
    paramId: 'PARAM-01',
    anchor: 'f-vendor-b-PARAM-01',
  }

  it('links to the cell anchor with a superscript number', () => {
    render(<FootnoteRef footnote={footnote} selected={false} />)
    const link = screen.getByRole('link', { name: 'Footnote 3' })
    expect(link).toHaveAttribute('href', '#f-vendor-b-PARAM-01')
    expect(link.querySelector('sup')).toHaveTextContent('3')
    expect(link).not.toHaveAttribute('aria-current')
  })

  it('marks the selected footnote', () => {
    render(<FootnoteRef footnote={footnote} selected />)
    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'true')
  })

  it('footnote ref has a padded hit area class', () => {
    render(<FootnoteRef footnote={footnote} selected={false} />)
    expect(screen.getByRole('link').className).toMatch(/hitArea/)
  })
})
