import { QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../api/queryClient'
import { copy } from '../content/copy'
import { AppShell } from '../router'
import verifiedJson from '../test/fixtures/verified-brief.json'
import { SHARE_ID } from '../test/msw/handlers'
import { server } from '../test/msw/server'

type BriefJson = typeof verifiedJson

const BRIEF_PATH = `/b/${SHARE_ID}`
const EVALUATE = '/api/briefs/:shareId/evaluate'

/** The viewport the matchMedia stub reports: ≥ 960 px unless a test narrows it. */
let wide = true

beforeEach(() => {
  wide = true
  // jsdom has no matchMedia. Reduced motion keeps MoneyFigure instant (no rAF updates).
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion')
      ? true
      : query.includes('min-width: 960px')
        ? wide
        : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="hash">{location.hash}</span>
}

function renderAt(path = BRIEF_PATH) {
  const client = createQueryClient({ retryDelay: 0 })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppShell />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** The page is a lazy chunk; its first import in a busy run can take over a second. */
async function loaded() {
  return screen.findByRole(
    'heading',
    { level: 1, name: verifiedJson.tender.title },
    { timeout: 5000 },
  )
}

function levelingTable() {
  return screen.getByRole('table', { name: copy.brief.tableCaption })
}

function vendorRow(name: RegExp) {
  return within(levelingTable()).getByRole('row', { name })
}

function margin() {
  return screen.getByRole('complementary', { name: copy.brief.margin.label })
}

/** The fixture's financials with VoltSwitch's evaluated price replaced. */
function financialsWithVoltSwitchAt(evaluatedEur: number) {
  return verifiedJson.financials.map((f) =>
    f.vendor_id === 'vendor-b' ? { ...f, true_evaluated_price: evaluatedEur } : f,
  )
}

function copperSlider() {
  return screen.getByRole('slider', { name: copy.brief.rates.copper })
}

async function sleep(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

/** A copy of the fixture with two more bidders (copies of Deltaport under new IDs). */
function fiveBidderBrief(): BriefJson {
  const brief = structuredClone(verifiedJson)
  const extra = [
    { id: 'vendor-d', name: 'Ostrava Grid Systems' },
    { id: 'vendor-e', name: 'Lumen Switchgear Oy' },
  ]
  const template = brief.tender.vendors.find((v) => v.id === 'vendor-c')!
  const templateFin = brief.financials.find((f) => f.vendor_id === 'vendor-c')!
  for (const [i, v] of extra.entries()) {
    brief.tender.vendors.push({ ...template, id: v.id, name: v.name })
    for (const param of brief.tender.parameters) {
      const cells = param.vendors as Record<string, (typeof param.vendors)['vendor-c']>
      cells[v.id] = structuredClone(cells['vendor-c']!)
    }
    brief.financials.push({
      ...templateFin,
      vendor_id: v.id,
      name: v.name,
      headline_price: templateFin.headline_price + 10000 * (i + 1),
      true_evaluated_price: templateFin.true_evaluated_price + 10000 * (i + 1),
    })
  }
  return brief
}

describe('Brief page', () => {
  it('renders masthead, verdict and all three bidders', async () => {
    renderAt()
    await loaded()
    expect(screen.getByText('Verified brief · TENDER-2026-402')).toBeInTheDocument()
    expect(screen.getByText(verifiedJson.tender.client)).toBeInTheDocument()
    expect(
      screen.getByText(
        'VoltSwitch Industrial bid €418,000, the lowest. With its gaps priced in, it costs €482,800. Nordwerk Schaltanlagen GmbH is the lowest evaluated bid at €452,000.',
      ),
    ).toBeInTheDocument()
    const rows = within(levelingTable()).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Nordwerk Schaltanlagen GmbH')
    expect(rows[1]).toHaveTextContent('VoltSwitch Industrial')
    expect(rows[1]).toHaveTextContent('€418,000')
    expect(rows[1]).toHaveTextContent('€482,800')
    expect(rows[2]).toHaveTextContent('Deltaport Skid Consortium B.V.')
  })

  it('footer links Impressum and Privacy on the brief page', async () => {
    renderAt()
    await loaded()
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByRole('link', { name: copy.legal.impressum })).toHaveAttribute(
      'href',
      '/impressum',
    )
    expect(within(footer).getByRole('link', { name: copy.legal.privacy })).toHaveAttribute(
      'href',
      '/privacy',
    )
  })

  it('table header labels match copy', async () => {
    renderAt()
    await loaded()
    const headers = within(levelingTable())
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
    expect(headers).toEqual(Object.values(copy.brief.table))
  })

  it('opens footnote 1 by default', async () => {
    renderAt()
    await loaded()
    const note = margin()
    expect(
      within(note).getByRole('heading', {
        level: 2,
        name: 'Rated Short-Time Withstand Current (Ik)',
      }),
    ).toBeInTheDocument()
    expect(within(note).getByText('VoltSwitch Industrial')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Footnote 1' })).toHaveAttribute('aria-current', 'true')
  })

  it('selecting a grid cell updates the hash and the sidenote', async () => {
    const user = userEvent.setup()
    renderAt()
    await loaded()
    const grid = screen.getByRole('region', { name: 'All checks: 8 requirements × 3 bidders' })
    await user.click(
      within(grid).getByRole('link', {
        name: 'Deltaport Skid Consortium B.V., IED Protection & Redundant IEC 61850 PRP: Gap 8',
      }),
    )
    expect(screen.getByTestId('hash')).toHaveTextContent('#f-vendor-c-PARAM-04')
    const note = margin()
    expect(
      within(note).getByRole('heading', {
        level: 2,
        name: 'IED Protection & Redundant IEC 61850 PRP',
      }),
    ).toBeInTheDocument()
    expect(within(note).getByText('Deltaport Skid Consortium B.V.')).toBeInTheDocument()

    // A compliant cell opens its sidenote too.
    await user.click(
      within(grid).getByRole('link', {
        name: 'Nordwerk Schaltanlagen GmbH, Rated Voltage (Ur): Meets spec',
      }),
    )
    expect(screen.getByTestId('hash')).toHaveTextContent('#f-vendor-a-PARAM-07')
    expect(
      within(margin()).getByRole('heading', { level: 2, name: 'Rated Voltage (Ur)' }),
    ).toBeInTheDocument()
  })

  it("a numbered grid cell's link name includes the footnote number it shows", async () => {
    // Found by axe in e2e/a11y.spec.ts (label-content-name-mismatch, WCAG 2.5.3 Label in
    // Name): the visible superscript was missing from the aria-label, and the link's text ran
    // the status word and the number together.
    renderAt()
    await loaded()
    const grid = screen.getByRole('region', { name: 'All checks: 8 requirements × 3 bidders' })
    expect(
      within(grid).getByRole('link', {
        name: 'Deltaport Skid Consortium B.V., IED Protection & Redundant IEC 61850 PRP: Gap 8',
      }),
    ).toHaveAttribute('href', '#f-vendor-c-PARAM-04')
    const links = within(grid).getAllByRole('link')
    const numbered = links.filter((link) => link.querySelector('sup') !== null)
    expect(numbered).toHaveLength(10)
    for (const link of numbered) {
      const shown = `${link.querySelector('span span:last-child')?.textContent} ${link.querySelector('sup')?.textContent}`
      expect(link.getAttribute('aria-label')).toMatch(new RegExp(`: ${shown}$`))
      // The text itself keeps a space between them, or "Gap" and "8" read as one word "Gap8".
      expect(link.textContent).toMatch(new RegExp(`${shown}$`))
    }
    // An unnumbered cell's name is unchanged.
    expect(
      within(grid).getByRole('link', {
        name: 'Nordwerk Schaltanlagen GmbH, Rated Voltage (Ur): Meets spec',
      }),
    ).toBeInTheDocument()
  })

  it('keyboard: Enter on a footnote focuses the sidenote heading, Escape returns focus', async () => {
    const user = userEvent.setup()
    renderAt()
    await loaded()
    const ref = screen.getByRole('link', { name: 'Footnote 2' })
    ref.focus()
    await user.keyboard('{Enter}')
    const heading = within(margin()).getByRole('heading', {
      level: 2,
      name: 'Main Busbar Material & Continuous Current',
    })
    expect(heading).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(ref).toHaveFocus()
  })

  it('keyboard below 960 px: Enter opens the sheet on the sidenote heading, Escape returns focus', async () => {
    wide = false
    const user = userEvent.setup()
    renderAt()
    await loaded()
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const ref = screen.getByRole('link', { name: 'Footnote 2' })
    ref.focus()
    await user.keyboard('{Enter}')
    const sheet = screen.getByRole('dialog', { name: 'Main Busbar Material & Continuous Current' })
    expect(within(sheet).getByRole('heading', { level: 2 })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(ref).toHaveFocus()
  })

  it('shows unavailable page on 404', async () => {
    renderAt('/b/no-such-share')
    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: copy.brief.unavailableTitle },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(copy.brief.unavailableBody)).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe(copy.meta.title(copy.brief.titleUnavailable)))
  })

  it('keeps last prices and shows inline note when re-price fails', async () => {
    server.use(http.post(EVALUATE, () => HttpResponse.json({ detail: 'boom' }, { status: 500 })))
    renderAt()
    await loaded()
    fireEvent.change(copperSlider(), { target: { value: '1.5' } })
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.errors.repriceFailed)
    expect(vendorRow(/VoltSwitch/)).toHaveTextContent('€482,800')
  })

  it('keeps the newest re-price when responses arrive out of order', async () => {
    let calls = 0
    server.use(
      http.post(EVALUATE, async () => {
        calls += 1
        if (calls === 1) {
          await delay(300)
          return HttpResponse.json({ financials: financialsWithVoltSwitchAt(111111) })
        }
        return HttpResponse.json({ financials: financialsWithVoltSwitchAt(222222) })
      }),
    )
    renderAt()
    await loaded()
    fireEvent.change(copperSlider(), { target: { value: '1.2' } })
    await sleep(200) // past the 150 ms debounce: the first request is in flight
    fireEvent.change(copperSlider(), { target: { value: '1.4' } })
    await waitFor(() => expect(vendorRow(/VoltSwitch/)).toHaveTextContent('€222,222'))
    await sleep(400) // the delayed first response has had time to land
    expect(calls).toBe(2)
    expect(vendorRow(/VoltSwitch/)).toHaveTextContent('€222,222')
    expect(vendorRow(/VoltSwitch/)).not.toHaveTextContent('€111,111')
  })

  it('opens default footnote for unknown hash', async () => {
    renderAt(`${BRIEF_PATH}#f-vendor-z-PARAM-99`)
    await loaded()
    expect(
      within(margin()).getByRole('heading', {
        level: 2,
        name: 'Rated Short-Time Withstand Current (Ik)',
      }),
    ).toBeInTheDocument()
  })

  it('opens the footnote the hash names', async () => {
    renderAt(`${BRIEF_PATH}#f-vendor-c-PARAM-05`)
    await loaded()
    expect(
      within(margin()).getByRole('heading', {
        level: 2,
        name: 'Witnessed Factory Acceptance Test (I-FAT)',
      }),
    ).toBeInTheDocument()
  })

  it('renders five bidders', async () => {
    const five = fiveBidderBrief()
    server.use(http.get('/api/briefs/:shareId', () => HttpResponse.json(five)))
    renderAt()
    await loaded()
    expect(within(levelingTable()).getAllByRole('row').slice(1)).toHaveLength(5)
    expect(within(levelingTable()).getAllByText('requirements met')).toHaveLength(5)
    const grid = screen.getByRole('region', { name: 'All checks: 8 requirements × 5 bidders' })
    expect(within(grid).getAllByRole('columnheader')).toHaveLength(6) // corner + 5 bidders
    expect(within(grid).getAllByRole('link')).toHaveLength(40)
    expect(within(grid).getByText('Lumen Switchgear Oy')).toBeInTheDocument()
  })

  it('labels synthetic sample and test extraction', async () => {
    renderAt()
    await loaded()
    expect(
      screen.getByText(`${copy.landing.sampleLabel} · ${copy.brief.testExtraction}`),
    ).toBeInTheDocument()
  })

  it('omits the sample and test-extraction labels for a real, live brief', async () => {
    const live = { ...structuredClone(verifiedJson), synthetic: false, ingest_mode: 'live' }
    server.use(http.get('/api/briefs/:shareId', () => HttpResponse.json(live)))
    renderAt()
    await loaded()
    expect(screen.queryByText(new RegExp(copy.landing.sampleLabel))).not.toBeInTheDocument()
    expect(screen.queryByText(/test extraction/i)).not.toBeInTheDocument()
  })

  it('announces re-priced total in a live region', async () => {
    server.use(
      http.post(EVALUATE, async () => {
        await delay(100)
        return HttpResponse.json({ financials: financialsWithVoltSwitchAt(486940) })
      }),
    )
    renderAt()
    await loaded()
    const live = screen.getByRole('status')
    expect(live).toBeEmptyDOMElement()
    fireEvent.change(copperSlider(), { target: { value: '1.3' } })
    await sleep(180) // debounced and requested, not yet answered
    expect(live).toBeEmptyDOMElement()
    await waitFor(() =>
      expect(live).toHaveTextContent('VoltSwitch Industrial evaluated price €486,940'),
    )
  })

  it('sliders expose aria-valuetext', async () => {
    renderAt()
    await loaded()
    const sliders = screen.getAllByRole('slider')
    expect(sliders).toHaveLength(3)
    for (const slider of sliders) expect(slider).toHaveAttribute('aria-valuetext')
    expect(screen.getByRole('slider', { name: copy.brief.rates.labour })).toHaveAttribute(
      'aria-valuetext',
      '€60 per hour',
    )
    fireEvent.change(copperSlider(), { target: { value: '1.5' } })
    expect(copperSlider()).toHaveAttribute('aria-valuetext', '1.50 times the rate table')
  })

  it('check grid scroll region is focusable and labelled', async () => {
    renderAt()
    await loaded()
    const region = screen.getByRole('region', { name: 'All checks: 8 requirements × 3 bidders' })
    expect(region).toHaveAttribute('tabindex', '0')
    expect(region).toHaveAttribute('aria-label', 'All checks: 8 requirements × 3 bidders')
  })

  it('page has header, main, aside and footer landmarks', async () => {
    renderAt()
    await loaded()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('sets document title to "Verified brief · TENDER-2026-402 · Antova"', async () => {
    renderAt()
    await loaded()
    await waitFor(() => expect(document.title).toBe('Verified brief · TENDER-2026-402 · Antova'))
  })

  it('skip link focuses main without touching the footnote hash', async () => {
    const user = userEvent.setup()
    renderAt(`${BRIEF_PATH}#f-vendor-c-PARAM-05`)
    await loaded()
    await user.click(screen.getByRole('link', { name: copy.shell.skipLink }))
    expect(screen.getByRole('main')).toHaveFocus()
    expect(screen.getByTestId('hash')).toHaveTextContent('#f-vendor-c-PARAM-05')
  })

  it('renders every footnote as an endnote when printing', async () => {
    renderAt()
    await loaded()
    expect(screen.queryByRole('region', { name: copy.brief.endnotesHeading })).toBeNull()
    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    const endnotes = screen.getByRole('region', { name: copy.brief.endnotesHeading })
    expect(within(endnotes).getAllByRole('article')).toHaveLength(10)
    expect(within(endnotes).getAllByRole('listitem')[0]).toHaveTextContent('1')
    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(screen.queryByRole('region', { name: copy.brief.endnotesHeading })).toBeNull()
  })

  it('omits an empty verdict sentence and names bids without a price', async () => {
    const brief = structuredClone(verifiedJson)
    for (const v of brief.tender.vendors) if (v.id !== 'vendor-a') v.headline_price = 0
    for (const f of brief.financials) if (f.vendor_id !== 'vendor-a') f.headline_price = 0
    server.use(http.get('/api/briefs/:shareId', () => HttpResponse.json(brief)))
    renderAt()
    await loaded()
    expect(screen.getByText(copy.verdict.missingPrice('VoltSwitch Industrial'))).toBeInTheDocument()
    expect(
      screen.getByText(copy.verdict.missingPrice('Deltaport Skid Consortium B.V.')),
    ).toBeInTheDocument()
    expect(screen.queryByText(/the lowest evaluated bid/)).not.toBeInTheDocument()
  })
})

describe('Brief: search engines', () => {
  it('asks search engines not to index the brief, and removes the tag on leaving', async () => {
    const { unmount } = renderAt()
    await loaded()
    const robots = document.head.querySelectorAll('meta[name="robots"]')
    expect(robots).toHaveLength(1)
    expect(robots[0]).toHaveAttribute('content', 'noindex')
    unmount()
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })
})
