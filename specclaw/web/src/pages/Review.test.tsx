import { QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useDeleteOverride,
  useReviewBrief,
  useReviewTenders,
  useVerify,
  useWithdraw,
} from '../api/queries'
import { createQueryClient } from '../api/queryClient'
import { copy } from '../content/copy'
import { AppShell } from '../router'
import draftJson from '../test/fixtures/draft-brief.json'
import { draftWithoutOverrides } from '../test/fixtures/draftWithoutOverrides'
import jobsJson from '../test/fixtures/jobs.json'
import reviewList from '../test/fixtures/review-list.json'
import { SHARE_ID, TENDER_ID, TEST_REVIEW_TOKEN } from '../test/msw/handlers'
import { server } from '../test/msw/server'

type BriefJson = typeof draftJson

const TOKEN_KEY = 'antova.reviewToken'
const BRIEF_PATH = `/review/${TENDER_ID}`
const NOTE = 'Two extra FAT days at tariff'

let reducedMotion = true

beforeEach(() => {
  reducedMotion = true
  // jsdom has no matchMedia: report a wide viewport, and reduced motion unless a test clears it.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion')
      ? reducedMotion
      : query.includes('min-width: 960px'),
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
  sessionStorage.clear()
  localStorage.clear()
})

/** Exposes the router's current pathname to the tests, in an attribute so no text query sees it. */
function LocationProbe() {
  const { pathname } = useLocation()
  return <span data-testid="location" data-pathname={pathname} hidden />
}

function currentPath() {
  return screen.getByTestId('location').dataset.pathname
}

function renderAt(path: string, { token }: { token?: string } = {}) {
  if (token !== undefined) sessionStorage.setItem(TOKEN_KEY, token)
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

/** The pages are lazy chunks; the first import in a busy run can take over a second. */
const SLOW = { timeout: 5000 }

async function gate() {
  return screen.findByRole('heading', { level: 1, name: copy.review.gate.title }, SLOW)
}

async function tenderTable() {
  return screen.findByRole('table', { name: copy.review.index.caption }, SLOW)
}

async function briefLoaded() {
  return screen.findByRole('heading', { level: 1, name: draftJson.tender.title }, SLOW)
}

function margin() {
  return screen.getByRole('complementary', { name: copy.brief.margin.label })
}

function levelingRow(name: RegExp) {
  const table = screen.getByRole('table', { name: copy.brief.tableCaption })
  return within(table).getByRole('row', { name })
}

function gridCell(vendor: string, requirement: string) {
  const grid = screen.getByRole('region', { name: /^All checks/ })
  const link = within(grid).getByRole('link', { name: new RegExp(`^${vendor}, ${requirement}`) })
  return link.closest('td')!
}

function verifyButton() {
  return screen.getByRole('button', { name: copy.review.verify.button })
}

/**
 * Server state for one test: the draft fixture, plus an override on Deltaport's unpriced
 * I-FAT cell once one is PUT (open items then clear, its adder joins the totals), and the
 * brief's status. Evaluate answers with the current state's financials.
 */
function statefulReview(initial: { override?: number | null; status?: 'DRAFT' | 'VERIFIED' } = {}) {
  const state = {
    override: initial.override ?? null,
    note: NOTE,
    status: initial.status ?? 'DRAFT',
    calls: { put: [] as unknown[], del: 0, verify: 0, withdraw: 0, evaluate: 0 },
  }

  const brief = (): BriefJson => {
    const b = draftWithoutOverrides()
    b.status = state.status
    ;(b as { verified_at: string | null }).verified_at =
      state.status === 'VERIFIED' ? '2026-11-06T00:00:00+00:00' : null
    if (state.override !== null) {
      const eur = state.override
      ;(b.overrides as unknown[]).push({
        param_id: 'PARAM-05',
        vendor_id: 'vendor-c',
        adder_eur: eur.toFixed(2),
        note: state.note,
      })
      b.open_items = []
      const f = b.financials.find((x) => x.vendor_id === 'vendor-c')!
      const item = f.itemized_breakdown.find((x) => x.param_id === 'PARAM-05')!
      item.adder_eur = eur
      item.is_overridden = true
      ;(item as { override_note: string | null }).override_note = state.note
      f.total_commercial_adder += eur
      f.total_adders += eur
      f.true_evaluated_price += eur
    }
    return b
  }

  server.use(
    http.get(`/api/review/tenders/${TENDER_ID}`, () => HttpResponse.json(brief())),
    http.post(`/api/review/tenders/${TENDER_ID}/evaluate`, () => {
      state.calls.evaluate += 1
      return HttpResponse.json({ financials: brief().financials })
    }),
    http.put(
      `/api/review/tenders/${TENDER_ID}/overrides/:paramId/:vendorId`,
      async ({ request, params }) => {
        const body = (await request.json()) as { adder_eur: string; note: string }
        state.calls.put.push({ params: { ...params }, body })
        state.override = Number(body.adder_eur)
        state.note = body.note
        return new HttpResponse(null, { status: 204 })
      },
    ),
    http.delete(`/api/review/tenders/${TENDER_ID}/overrides/:paramId/:vendorId`, () => {
      state.calls.del += 1
      state.override = null
      return new HttpResponse(null, { status: 204 })
    }),
    http.post(`/api/review/tenders/${TENDER_ID}/verify`, () => {
      state.calls.verify += 1
      state.status = 'VERIFIED'
      return HttpResponse.json({
        share_id: draftJson.share_id,
        verified_at: '2026-11-06T00:00:00+00:00',
      })
    }),
    http.post(`/api/review/tenders/${TENDER_ID}/withdraw`, () => {
      state.calls.withdraw += 1
      state.status = 'DRAFT'
      return HttpResponse.json({ status: 'DRAFT' })
    }),
  )
  return state
}

async function saveOverride(user: UserEvent, amount: string, note = NOTE) {
  const note$ = within(margin())
  await user.type(note$.getByLabelText(copy.review.override.label), amount)
  await user.type(note$.getByLabelText(copy.review.override.why), note)
  await user.click(note$.getByRole('button', { name: copy.review.override.save }))
}

describe('Review: token gate', () => {
  it('trims pasted token', async () => {
    const user = userEvent.setup()
    const sent: (string | null)[] = []
    server.use(
      http.get('/api/review/tenders', ({ request }) => {
        sent.push(request.headers.get('X-Antova-Review-Token'))
        return undefined
      }),
    )
    renderAt('/review')
    await gate()
    await user.click(screen.getByLabelText(copy.review.gate.label))
    await user.paste(`  ${TEST_REVIEW_TOKEN}\n`)
    await user.click(screen.getByRole('button', { name: copy.review.gate.submit }))
    await tenderTable()
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe(TEST_REVIEW_TOKEN)
    expect(sent).toEqual([TEST_REVIEW_TOKEN])
    expect(localStorage.length).toBe(0)
  })

  it('shows error on 401', async () => {
    const user = userEvent.setup()
    renderAt('/review')
    await gate()
    await user.type(screen.getByLabelText(copy.review.gate.label), 'not-the-token')
    await user.click(screen.getByRole('button', { name: copy.review.gate.submit }))
    expect(await screen.findByText("That token didn't work.", {}, SLOW)).toBeInTheDocument()
    expect(screen.getByLabelText(copy.review.gate.label)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('table', { name: copy.review.index.caption })).toBeNull()
    // A rejected token is not kept for the next visit.
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('keeps the gate and the typed token while a new token is checked', async () => {
    const user = userEvent.setup()
    renderAt('/review')
    await gate()
    const field = screen.getByLabelText(copy.review.gate.label)
    await user.type(field, 'not-the-token')
    await user.click(screen.getByRole('button', { name: copy.review.gate.submit }))
    // Before the server answers: still the gate, never the tender list.
    expect(screen.queryByRole('heading', { name: copy.review.index.heading })).toBeNull()
    expect(await screen.findByText("That token didn't work.", {}, SLOW)).toBeInTheDocument()
    // The same field, keeping what was typed, selected for the next paste.
    expect(screen.getByLabelText(copy.review.gate.label)).toBe(field)
    expect(field).toHaveValue('not-the-token')
    expect(field).toHaveFocus()
  })

  it('shows not-configured message on 503', async () => {
    server.use(
      http.get('/api/review/tenders', () =>
        HttpResponse.json({ detail: 'Review token not configured' }, { status: 503 }),
      ),
    )
    renderAt('/review', { token: TEST_REVIEW_TOKEN })
    expect(
      await screen.findByText('Review is not configured on this server.', {}, SLOW),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: copy.review.index.caption })).toBeNull()
  })

  it('sign out clears token and shows the gate', async () => {
    const user = userEvent.setup()
    renderAt('/review', { token: TEST_REVIEW_TOKEN })
    await tenderTable()
    await user.click(screen.getByRole('button', { name: 'Sign out of review' }))
    await gate()
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
  })
})

describe('Review: index', () => {
  it('lists tenders with open-item counts', async () => {
    const second = {
      ...reviewList[0]!,
      tender_id: 'TENDER-2026-417',
      title: 'Battery yard 11 kV ring main units',
      status: 'VERIFIED',
      open_items: 2,
      verified_at: '2026-11-06T00:00:00+00:00',
    }
    server.use(http.get('/api/review/tenders', () => HttpResponse.json([...reviewList, second])))
    renderAt('/review', { token: TEST_REVIEW_TOKEN })
    const table = await tenderTable()
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent(TENDER_ID)
    expect(rows[0]).toHaveTextContent(reviewList[0]!.title)
    expect(rows[0]).toHaveTextContent('Draft')
    expect(rows[0]).toHaveTextContent('1 item')
    expect(rows[0]).not.toHaveTextContent('1 items')
    expect(rows[0]).toHaveTextContent('5 November 2026')
    expect(rows[1]).toHaveTextContent('2 items')
    expect(rows[1]).toHaveTextContent('6 November 2026')
    expect(within(rows[0]!).getByRole('link', { name: TENDER_ID })).toHaveAttribute(
      'href',
      `/review/${TENDER_ID}`,
    )
    await waitFor(() => expect(document.title).toBe(`${copy.review.index.heading} · SpecClaw`))
  })

  it('empty list says how to ingest', async () => {
    server.use(http.get('/api/review/tenders', () => HttpResponse.json([])))
    renderAt('/review', { token: TEST_REVIEW_TOKEN })
    expect(await screen.findByText(copy.review.indexEmpty.command, {}, SLOW)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: copy.review.index.caption })).toBeNull()
  })

  it('run ingest validates folder id', async () => {
    const user = userEvent.setup()
    const started: unknown[] = []
    server.use(
      http.post('/api/jobs/ingest', async ({ request }) => {
        started.push(await request.json())
        return undefined
      }),
    )
    renderAt('/review', { token: TEST_REVIEW_TOKEN })
    await tenderTable()
    const folder = screen.getByLabelText(copy.review.ingest.folderLabel)
    await user.type(folder, 'tender 402')
    await user.click(screen.getByRole('button', { name: copy.review.ingest.submit }))
    expect(folder).toHaveAttribute('aria-invalid', 'true')
    expect(folder).toHaveAccessibleDescription(
      expect.stringContaining(copy.review.ingest.folderError),
    )
    expect(started).toEqual([])

    await user.clear(folder)
    await user.type(folder, TENDER_ID)
    await user.selectOptions(screen.getByLabelText(copy.review.ingest.modeLabel), 'live')
    await user.click(screen.getByRole('button', { name: copy.review.ingest.submit }))
    await waitFor(() => expect(started).toEqual([{ tender_id: TENDER_ID, mode: 'live' }]))
    // The audit modal follows the job live; once it completes, *Open the brief* opens the
    // tender's brief, explaining the re-ingest.
    const modal = await screen.findByRole('dialog', { name: copy.modal.liveTitle(TENDER_ID) })
    const openBrief = await within(modal).findByRole('button', { name: copy.modal.openBrief }, SLOW)
    // The job is done but the modal is open: the page waits, so the findings stay readable.
    expect(currentPath()).toBe('/review')
    await user.click(openBrief)
    expect(await screen.findByText(copy.review.reingested, {}, SLOW)).toBeInTheDocument()
    await briefLoaded()
    expect(currentPath()).toBe(BRIEF_PATH)
  })

  it('a live job completing after the modal was closed opens the brief (R22)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const job: { current: object } = { current: jobsJson.processing[2]! }
      server.use(http.get('/api/jobs/:jobId', () => HttpResponse.json(job.current)))
      renderAt('/review', { token: TEST_REVIEW_TOKEN })
      await tenderTable()
      await user.type(screen.getByLabelText(copy.review.ingest.folderLabel), TENDER_ID)
      await user.click(screen.getByRole('button', { name: copy.review.ingest.submit }))
      const modal = await screen.findByRole('dialog', { name: copy.modal.liveTitle(TENDER_ID) })
      // Locate reported: the run is under way (PROCESSING).
      await waitFor(() =>
        expect(within(modal).getByText(copy.modal.stages[2]!).closest('li')).toHaveTextContent(
          copy.modal.stageState.active,
        ),
      )
      await user.click(within(modal).getByRole('button', { name: copy.ui.close }))
      expect(screen.queryByRole('dialog')).toBeNull()

      // Still PROCESSING: the founder stays on the list.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500)
      })
      expect(currentPath()).toBe('/review')

      job.current = jobsJson.completed
      await act(async () => {
        await vi.advanceTimersByTimeAsync(750)
      })
      await waitFor(() => expect(currentPath()).toBe(BRIEF_PATH), SLOW)
      expect(await screen.findByText(copy.review.reingested, {}, SLOW)).toBeInTheDocument()
      await briefLoaded()
      expect(screen.queryByRole('dialog')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  }, 15_000)
})

describe('Review: brief', () => {
  it('draft banner and highlighted open cells', async () => {
    renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    expect(screen.getByText('Draft. Only you can see this.')).toBeInTheDocument()
    expect(screen.getByText(`Draft brief · ${TENDER_ID}`)).toBeInTheDocument()
    expect(screen.getByText(copy.review.openItems(1))).toBeInTheDocument()
    // Unpriced, and a conflict read at confidence 0.9: highlighted. A compliant cell: not.
    expect(gridCell('Deltaport Skid Consortium B.V.', 'Witnessed Factory')).toHaveAttribute(
      'data-highlight',
      'true',
    )
    expect(gridCell('VoltSwitch Industrial', 'Rated Short-Time')).toHaveAttribute(
      'data-highlight',
      'true',
    )
    expect(gridCell('Nordwerk Schaltanlagen GmbH', 'Rated Short-Time')).not.toHaveAttribute(
      'data-highlight',
    )
    await waitFor(() => expect(document.title).toBe(`Draft brief · ${TENDER_ID} · SpecClaw`))
  })

  it('highlighted cells say "needs review" in their accessible name; others do not', async () => {
    renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    const grid = screen.getByRole('region', { name: /^All checks/ })
    // Conflict read at confidence 0.9: its status tag alone would not say why it is flagged.
    expect(
      gridCell('VoltSwitch Industrial', 'Rated Short-Time').querySelector('a'),
    ).toHaveAccessibleName(
      /^VoltSwitch Industrial, Rated Short-Time .*: Contradiction 1, needs review$/,
    )
    expect(
      gridCell('Deltaport Skid Consortium B.V.', 'Witnessed Factory').querySelector('a'),
    ).toHaveAccessibleName(/, needs review$/)
    const compliant = gridCell('Nordwerk Schaltanlagen GmbH', 'Rated Short-Time').querySelector('a')
    expect(compliant).toHaveAccessibleName(
      /^Nordwerk Schaltanlagen GmbH, Rated Short-Time .*: Meets spec$/,
    )
    const flagged = within(grid)
      .getAllByRole('link')
      .filter((link) => link.closest('td')?.hasAttribute('data-highlight'))
    const named = within(grid).getAllByRole('link', { name: /, needs review$/ })
    expect(named).toEqual(flagged)
  })

  it('the public brief grid never says "needs review"', async () => {
    renderAt(`/b/${SHARE_ID}`)
    const grid = await screen.findByRole('region', { name: /^All checks/ }, SLOW)
    expect(within(grid).getAllByRole('link').length).toBeGreaterThan(0)
    expect(within(grid).queryAllByRole('link', { name: /needs review/ })).toEqual([])
  })

  it('saving an override sends PUT and re-renders the adder with the override badge', async () => {
    const user = userEvent.setup()
    const state = statefulReview()
    renderAt(`${BRIEF_PATH}#f-vendor-c-PARAM-05`, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    expect(levelingRow(/Deltaport/)).toHaveTextContent('€451,400')

    // Move a slider first, so the totals on screen come from an evaluate response.
    fireEvent.change(screen.getByRole('slider', { name: copy.brief.rates.copper }), {
      target: { value: '1.2' },
    })
    await waitFor(() => expect(state.calls.evaluate).toBe(1))

    await saveOverride(user, '2600')
    await waitFor(() =>
      expect(state.calls.put).toEqual([
        {
          params: { paramId: 'PARAM-05', vendorId: 'vendor-c' },
          body: { adder_eur: '2600.00', note: NOTE },
        },
      ]),
    )
    expect(await within(margin()).findByText(`Overridden: ${NOTE}`)).toBeInTheDocument()
    // The totals are the new brief's, not the prices settled before the override.
    await waitFor(() => expect(levelingRow(/Deltaport/)).toHaveTextContent('€454,000'))
    expect(
      within(margin()).getByRole('button', { name: copy.review.override.remove }),
    ).toBeInTheDocument()
  })

  it('removing an override sends DELETE and the totals drop back', async () => {
    const user = userEvent.setup()
    const state = statefulReview({ override: 2600 })
    renderAt(`${BRIEF_PATH}#f-vendor-c-PARAM-05`, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    expect(levelingRow(/Deltaport/)).toHaveTextContent('€454,000')
    fireEvent.change(screen.getByRole('slider', { name: copy.brief.rates.copper }), {
      target: { value: '1.2' },
    })
    await waitFor(() => expect(state.calls.evaluate).toBe(1))
    await user.click(within(margin()).getByRole('button', { name: copy.review.override.remove }))
    await waitFor(() => expect(state.calls.del).toBe(1))
    await waitFor(() => expect(levelingRow(/Deltaport/)).toHaveTextContent('€451,400'))
    expect(within(margin()).queryByText(`Overridden: ${NOTE}`)).toBeNull()
  })

  it('Mark verified is aria-disabled, focusable, and describes the open items until they are resolved', async () => {
    const user = userEvent.setup()
    const state = statefulReview()
    renderAt(`${BRIEF_PATH}#f-vendor-c-PARAM-05`, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    const button = verifyButton()
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    button.focus()
    expect(button).toHaveFocus()
    expect(button).toHaveAccessibleDescription('Resolve 1 open item first')
    await user.click(button)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(state.calls.verify).toBe(0)

    await saveOverride(user, '2600')
    await waitFor(() => expect(verifyButton()).not.toHaveAttribute('aria-disabled'))
    expect(verifyButton()).not.toHaveAccessibleDescription('Resolve 1 open item first')
    expect(screen.queryByText(copy.review.openItems(1))).toBeNull()
  })

  it('verify confirmation copy and copies share link', async () => {
    const user = userEvent.setup()
    const state = statefulReview({ override: 2600 })
    renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    await user.click(verifyButton())
    const dialog = screen.getByRole('dialog', { name: 'Share this brief?' })
    expect(dialog).toHaveTextContent('Anyone with the link will see vendor names and prices.')
    expect(within(dialog).getByRole('button', { name: 'Keep as draft' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Keep as draft' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(state.calls.verify).toBe(0)

    await user.click(verifyButton())
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark verified' }),
    )
    expect(await screen.findByText('Verified. Share link copied.')).toBeInTheDocument()
    expect(state.calls.verify).toBe(1)
    const shareUrl = `${window.location.origin}/b/${draftJson.share_id}`
    expect(await navigator.clipboard.readText()).toBe(shareUrl)
    expect(await screen.findByText('Verified · shared')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: shareUrl })).toHaveAttribute('href', shareUrl)
    expect(screen.getByRole('button', { name: copy.review.withdraw.button })).toBeInTheDocument()
    // Reduced motion: no stamp.
    expect(screen.queryByTestId('verified-stamp')).toBeNull()
  })

  it('verify names the ingest run on screen, so the server can refuse a different one', async () => {
    const user = userEvent.setup()
    statefulReview({ override: 2600 })
    let body: unknown
    server.use(
      http.post(`/api/review/tenders/${TENDER_ID}/verify`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({
          share_id: draftJson.share_id,
          verified_at: '2026-11-06T00:00:00+00:00',
        })
      }),
    )
    renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    await user.click(verifyButton())
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark verified' }),
    )
    await screen.findByText('Verified. Share link copied.')
    expect(body).toEqual({ run_id: draftJson.ingest_stats.run_id })
  })

  it('explains a verify refused because the tender was ingested again after the page loaded', async () => {
    const user = userEvent.setup()
    statefulReview({ override: 2600 })
    server.use(
      http.post(`/api/review/tenders/${TENDER_ID}/verify`, () =>
        HttpResponse.json(
          { detail: 'This tender was ingested again.', code: 'run_changed' },
          { status: 409 },
        ),
      ),
    )
    renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    await user.click(verifyButton())
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark verified' }),
    )
    expect(
      await within(screen.getByRole('dialog')).findByText(copy.review.verify.runChanged),
    ).toBeInTheDocument()
    expect(screen.queryByText('Verified · shared')).toBeNull()
  })

  it('shows the verified stamp once when motion is allowed', async () => {
    reducedMotion = false
    const user = userEvent.setup()
    statefulReview({ override: 2600 })
    renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    expect(screen.queryByTestId('verified-stamp')).toBeNull()
    await user.click(verifyButton())
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark verified' }),
    )
    expect(await screen.findByTestId('verified-stamp')).toHaveAttribute('aria-hidden', 'true')
  })

  it('withdraw confirmation', async () => {
    const user = userEvent.setup()
    const state = statefulReview({ override: 2600, status: 'VERIFIED' })
    renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    expect(screen.getByText('Verified · shared')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Withdraw brief' }))
    const dialog = screen.getByRole('dialog', { name: 'Withdraw this brief?' })
    expect(dialog).toHaveTextContent('The share link will stop working until you verify it again.')
    await user.click(within(dialog).getByRole('button', { name: 'Keep shared' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(state.calls.withdraw).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Withdraw brief' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Withdraw' }))
    await waitFor(() => expect(state.calls.withdraw).toBe(1))
    expect(await screen.findByText('Draft. Only you can see this.')).toBeInTheDocument()
    expect(screen.getByText(copy.review.withdraw.success)).toBeInTheDocument()
  })

  it('overrides are locked while the brief is verified', async () => {
    statefulReview({ override: 2600, status: 'VERIFIED' })
    renderAt(`${BRIEF_PATH}#f-vendor-c-PARAM-05`, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    const note = within(margin())
    expect(note.getByText('Withdraw the brief before changing overrides')).toBeInTheDocument()
    expect(note.getByLabelText(copy.review.override.label)).toBeDisabled()
    expect(note.getByRole('button', { name: copy.review.override.save })).toBeDisabled()
  })

  it('prints the public share URL in the colophon, never the review URL', async () => {
    statefulReview({ override: 2600, status: 'VERIFIED' })
    renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    const shareUrl = `${window.location.origin}/b/${draftJson.share_id}`
    expect(screen.getByText(`Verified 6 November 2026. ${shareUrl}`)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(`/review/${TENDER_ID}`))).toBeNull()
  })

  it('after a live ingest the re-ingested banner shows', async () => {
    const user = userEvent.setup()
    let briefGets = 0
    server.use(
      http.get(`/api/review/tenders/${TENDER_ID}`, () => {
        briefGets += 1
        return undefined
      }),
    )
    renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    expect(screen.queryByText(copy.review.reingested)).toBeNull()
    await user.click(screen.getByText(copy.review.ingest.heading, { selector: 'summary' }))
    expect(screen.getByLabelText(copy.review.ingest.folderLabel)).toHaveValue(TENDER_ID)
    await user.selectOptions(screen.getByLabelText(copy.review.ingest.modeLabel), 'live')
    await user.click(screen.getByRole('button', { name: copy.review.ingest.submit }))
    // The run opens in the audit modal; the banner shows behind it once the job completes.
    const modal = await screen.findByRole('dialog', { name: copy.modal.liveTitle(TENDER_ID) })
    expect(await screen.findByText(copy.review.reingested)).toBeInTheDocument()
    // Fetched on load, by the re-ingest check (always from the server, R28), and again after
    // the re-ingest.
    await waitFor(() => expect(briefGets).toBe(3))
    await user.click(within(modal).getByRole('button', { name: copy.modal.openBrief }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText(copy.review.reingested)).toBeInTheDocument()
  })

  it('the re-ingested banner appears after a live job goes PENDING → PROCESSING → COMPLETED', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const sequence = [jobsJson.queued, ...jobsJson.processing, jobsJson.completed]
      const polled: string[] = []
      server.use(
        http.get('/api/jobs/:jobId', () => {
          const job = sequence[Math.min(polled.length, sequence.length - 1)]!
          polled.push(job.status)
          return HttpResponse.json(job)
        }),
      )
      renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
      await briefLoaded()
      await user.click(screen.getByText(copy.review.ingest.heading, { selector: 'summary' }))
      await user.click(screen.getByRole('button', { name: copy.review.ingest.submit }))
      const modal = await screen.findByRole('dialog', { name: copy.modal.liveTitle(TENDER_ID) })
      expect(await within(modal).findByText(copy.modal.queued)).toBeInTheDocument()
      expect(screen.queryByText(copy.review.reingested)).toBeNull()

      for (let tick = 0; tick < 30 && !polled.includes('COMPLETED'); tick += 1) {
        expect(screen.queryByText(copy.review.reingested)).toBeNull()
        await act(async () => {
          await vi.advanceTimersByTimeAsync(750)
        })
      }
      expect(polled).toEqual([
        'PENDING',
        ...jobsJson.processing.map(() => 'PROCESSING'),
        'COMPLETED',
      ])
      expect(await screen.findByText(copy.review.reingested)).toBeInTheDocument()
      expect(within(modal).getByRole('button', { name: copy.modal.openBrief })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a tender migrated from v2 (no recorded run) still opens in review (R27)', async () => {
    // The v2 → v3 migration fills ingest_stats with {} and stage_log with [].
    const migrated = draftWithoutOverrides() as Record<string, unknown>
    migrated.ingest_stats = {}
    migrated.stage_log = []
    server.use(http.get(`/api/review/tenders/${TENDER_ID}`, () => HttpResponse.json(migrated)))
    renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    expect(
      screen.getByText('Gaps are priced from rate table mv_gis_switchgear_v2.'),
    ).toBeInTheDocument()
  })

  it('unknown tender says so', async () => {
    renderAt('/review/TENDER-0000-000', { token: TEST_REVIEW_TOKEN })
    expect(
      await screen.findByText(copy.review.missingTender('TENDER-0000-000'), {}, SLOW),
    ).toBeInTheDocument()
  })

  it('shows the token gate on the brief page without a token', async () => {
    renderAt(BRIEF_PATH)
    await gate()
  })
})

describe('Review: cache invalidation', () => {
  it('verify, withdraw and delete-override each refetch the review brief and the tender list', async () => {
    const gets = { brief: 0, list: 0 }
    server.use(
      http.get('/api/review/tenders', () => {
        gets.list += 1
        return undefined
      }),
      http.get(`/api/review/tenders/${TENDER_ID}`, () => {
        gets.brief += 1
        return undefined
      }),
      http.post(`/api/review/tenders/${TENDER_ID}/verify`, () =>
        HttpResponse.json({ share_id: draftJson.share_id, verified_at: '2026-11-06T00:00:00Z' }),
      ),
    )
    const client = createQueryClient({ retryDelay: 0 })
    const { result } = renderHook(
      () => ({
        list: useReviewTenders(TEST_REVIEW_TOKEN),
        brief: useReviewBrief(TENDER_ID, TEST_REVIEW_TOKEN),
        verify: useVerify(TENDER_ID, TEST_REVIEW_TOKEN),
        withdraw: useWithdraw(TENDER_ID, TEST_REVIEW_TOKEN),
        del: useDeleteOverride(TENDER_ID, TEST_REVIEW_TOKEN),
      }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    )
    await waitFor(() =>
      expect(result.current.brief.isSuccess && result.current.list.isSuccess).toBe(true),
    )
    expect(gets).toEqual({ brief: 1, list: 1 })

    await act(() => result.current.verify.mutateAsync())
    await waitFor(() => expect(gets).toEqual({ brief: 2, list: 2 }))

    await act(() => result.current.withdraw.mutateAsync())
    await waitFor(() => expect(gets).toEqual({ brief: 3, list: 3 }))

    await act(() => result.current.del.mutateAsync({ paramId: 'PARAM-05', vendorId: 'vendor-c' }))
    await waitFor(() => expect(gets).toEqual({ brief: 4, list: 4 }))
  })
})

describe('Review: search engines', () => {
  it('the gate, the index and a review brief ask not to be indexed', async () => {
    const robots = () => document.head.querySelector('meta[name="robots"]')
    const first = renderAt('/review')
    await gate()
    expect(robots()).toHaveAttribute('content', 'noindex')
    first.unmount()
    expect(robots()).toBeNull()

    const second = renderAt('/review', { token: TEST_REVIEW_TOKEN })
    await tenderTable()
    expect(robots()).toHaveAttribute('content', 'noindex')
    second.unmount()

    renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    expect(robots()).toHaveAttribute('content', 'noindex')
  })
})

describe('Review: re-ingesting a brief (F2)', () => {
  /** The override jobs.completed reports as cleared, as the banner lists it. */
  const CLEARED = copy.review.clearedOverride({
    vendor: 'VoltSwitch Industrial',
    requirement: 'Main Busbar Material & Continuous Current',
    amount: '+€10,000',
    note: jobsJson.completed.result!.overrides_cleared[0]!.note,
  })

  async function submitIngest(user: UserEvent) {
    await user.click(screen.getByText(copy.review.ingest.heading, { selector: 'summary' }))
    await user.click(screen.getByRole('button', { name: copy.review.ingest.submit }))
  }

  function countStarts() {
    const started: unknown[] = []
    server.use(
      http.post('/api/jobs/ingest', async ({ request }) => {
        started.push(await request.json())
        return undefined
      }),
    )
    return started
  }

  /** A second tender, VERIFIED with two overrides, that only the lookup's GET knows. */
  const OTHER_ID = 'TENDER-2026-417'
  function serveVerifiedOther() {
    const other = draftWithoutOverrides()
    other.tender.id = OTHER_ID
    other.status = 'VERIFIED'
    ;(other as { verified_at: string | null }).verified_at = '2026-11-06T00:00:00+00:00'
    ;(other.overrides as unknown[]).push(
      { param_id: 'PARAM-05', vendor_id: 'vendor-c', adder_eur: '2600.00', note: NOTE },
      { param_id: 'PARAM-01', vendor_id: 'vendor-a', adder_eur: '100.00', note: NOTE },
    )
    other.open_items = []
    const gets = { count: 0 }
    server.use(
      http.get(`/api/review/tenders/${OTHER_ID}`, () => {
        gets.count += 1
        return HttpResponse.json(other)
      }),
    )
    return gets
  }

  async function runFromList(user: UserEvent, tenderId: string) {
    await user.type(screen.getByLabelText(copy.review.ingest.folderLabel), tenderId)
    await user.click(screen.getByRole('button', { name: copy.review.ingest.submit }))
  }

  it('from the tender list, asks before re-ingesting a verified tender (R28)', async () => {
    const user = userEvent.setup()
    serveVerifiedOther()
    const started = countStarts()
    renderAt('/review', { token: TEST_REVIEW_TOKEN })
    await tenderTable()
    await runFromList(user, OTHER_ID)

    const title = copy.review.reingestConfirm.title(OTHER_ID)
    const confirm = await screen.findByRole('dialog', { name: title })
    expect(confirm).toHaveTextContent(
      copy.review.reingestConfirm.body({ verified: true, overrides: 2 }),
    )
    await user.click(
      within(confirm).getByRole('button', { name: copy.review.reingestConfirm.cancel }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(started).toEqual([])

    await user.click(screen.getByRole('button', { name: copy.review.ingest.submit }))
    await user.click(
      within(await screen.findByRole('dialog', { name: title })).getByRole('button', {
        name: copy.review.reingestConfirm.confirm,
      }),
    )
    await waitFor(() => expect(started).toEqual([{ tender_id: OTHER_ID, mode: 'auto' }]))
    expect(screen.getByRole('dialog', { name: copy.modal.liveTitle(OTHER_ID) })).toBeInTheDocument()
    expect(started).toHaveLength(1)
  })

  it('from the tender list, a new tender (404) starts at once (R28)', async () => {
    const user = userEvent.setup()
    const started = countStarts()
    renderAt('/review', { token: TEST_REVIEW_TOKEN })
    await tenderTable()
    await runFromList(user, 'TENDER-2026-999')
    await waitFor(() => expect(started).toEqual([{ tender_id: 'TENDER-2026-999', mode: 'auto' }]))
    expect(
      screen.getByRole('dialog', { name: copy.modal.liveTitle('TENDER-2026-999') }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('dialog', { name: copy.review.reingestConfirm.title('TENDER-2026-999') }),
    ).toBeNull()
  })

  it("on a draft's brief, another tender's ID asks with that tender's facts (R28)", async () => {
    const user = userEvent.setup()
    serveVerifiedOther()
    const started = countStarts()
    renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    await user.click(screen.getByText(copy.review.ingest.heading, { selector: 'summary' }))
    const folder = screen.getByLabelText(copy.review.ingest.folderLabel)
    await user.clear(folder)
    await user.type(folder, OTHER_ID)
    await user.click(screen.getByRole('button', { name: copy.review.ingest.submit }))

    const confirm = await screen.findByRole('dialog', {
      name: copy.review.reingestConfirm.title(OTHER_ID),
    })
    expect(confirm).toHaveTextContent('share link stops working')
    expect(confirm).toHaveTextContent('2 overrides on this brief')
    expect(started).toEqual([])
  })

  it('a second submit while the lookup runs starts nothing more (R28)', async () => {
    const user = userEvent.setup()
    const gets = serveVerifiedOther()
    renderAt('/review', { token: TEST_REVIEW_TOKEN })
    await tenderTable()
    await user.type(screen.getByLabelText(copy.review.ingest.folderLabel), OTHER_ID)
    const submit = screen.getByRole('button', { name: copy.review.ingest.submit })
    fireEvent.click(submit)
    fireEvent.click(submit)
    await screen.findByRole('dialog', { name: copy.review.reingestConfirm.title(OTHER_ID) })
    expect(gets.count).toBe(1)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('re-checks a cached brief that was verified elsewhere before re-ingesting (R28)', async () => {
    const user = userEvent.setup()
    const started = countStarts()
    renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    // Another tab verifies the brief: this tab's cache still holds the draft.
    const verified = draftWithoutOverrides()
    verified.status = 'VERIFIED'
    ;(verified as { verified_at: string | null }).verified_at = '2026-11-06T00:00:00+00:00'
    verified.open_items = []
    server.use(http.get(`/api/review/tenders/${TENDER_ID}`, () => HttpResponse.json(verified)))
    await submitIngest(user)

    const confirm = await screen.findByRole('dialog', {
      name: copy.review.reingestConfirm.title(TENDER_ID),
    })
    expect(confirm).toHaveTextContent('share link stops working')
    expect(started).toEqual([])
  })

  it('asks before re-ingesting a verified brief with overrides; cancel starts nothing', async () => {
    const user = userEvent.setup()
    statefulReview({ override: 2600, status: 'VERIFIED' })
    const started = countStarts()
    renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    await submitIngest(user)

    const confirm = await screen.findByRole('dialog', {
      name: copy.review.reingestConfirm.title(TENDER_ID),
    })
    expect(confirm).toHaveTextContent(
      copy.review.reingestConfirm.body({ verified: true, overrides: 1 }),
    )
    expect(confirm).toHaveTextContent('share link stops working')
    expect(confirm).toHaveTextContent('1 override on this brief')
    await user.click(
      within(confirm).getByRole('button', { name: copy.review.reingestConfirm.cancel }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(started).toEqual([])

    await user.click(screen.getByRole('button', { name: copy.review.ingest.submit }))
    await user.click(
      within(
        await screen.findByRole('dialog', { name: copy.review.reingestConfirm.title(TENDER_ID) }),
      ).getByRole('button', { name: copy.review.reingestConfirm.confirm }),
    )
    await waitFor(() => expect(started).toEqual([{ tender_id: TENDER_ID, mode: 'auto' }]))
    expect(
      screen.getByRole('dialog', { name: copy.modal.liveTitle(TENDER_ID) }),
    ).toBeInTheDocument()
  })

  it('asks before re-ingesting a draft that has overrides, without the share-link warning', async () => {
    const user = userEvent.setup()
    statefulReview({ override: 2600 })
    renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    await submitIngest(user)
    const confirm = await screen.findByRole('dialog', {
      name: copy.review.reingestConfirm.title(TENDER_ID),
    })
    expect(confirm).toHaveTextContent('1 override on this brief')
    expect(confirm).not.toHaveTextContent('share link')
  })

  it('lists the cleared overrides in the banner until the founder dismisses it', async () => {
    const user = userEvent.setup()
    renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    await submitIngest(user)
    // A draft with no overrides starts at once: no confirmation.
    const modal = await screen.findByRole('dialog', { name: copy.modal.liveTitle(TENDER_ID) })
    expect(await screen.findByText(CLEARED)).toBeInTheDocument()
    expect(screen.getByText(copy.review.reingestedCleared(1))).toBeInTheDocument()
    await user.click(within(modal).getByRole('button', { name: copy.modal.openBrief }))
    expect(screen.getByText(copy.review.reingested)).toBeInTheDocument()
    expect(screen.getByText(CLEARED)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: copy.review.reingestedDismiss }))
    expect(screen.queryByText(copy.review.reingested)).toBeNull()
    expect(screen.queryByText(CLEARED)).toBeNull()
  })

  it('saving an override clears the re-ingested banner', async () => {
    const user = userEvent.setup()
    statefulReview()
    renderAt(`${BRIEF_PATH}#f-vendor-c-PARAM-05`, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    await submitIngest(user)
    const modal = await screen.findByRole('dialog', { name: copy.modal.liveTitle(TENDER_ID) })
    expect(await screen.findByText(CLEARED)).toBeInTheDocument()
    await user.click(within(modal).getByRole('button', { name: copy.modal.openBrief }))

    await saveOverride(user, '2600')
    expect(await within(margin()).findByText(`Overridden: ${NOTE}`)).toBeInTheDocument()
    expect(screen.queryByText(copy.review.reingested)).toBeNull()
    expect(screen.queryByText(CLEARED)).toBeNull()
  })

  it('a lookup that fails asks with the generic warning', async () => {
    const user = userEvent.setup()
    const started = countStarts()
    renderAt('/review', { token: TEST_REVIEW_TOKEN })
    await tenderTable()
    server.use(http.get(`/api/review/tenders/${TENDER_ID}`, () => HttpResponse.error()))
    await user.type(screen.getByLabelText(copy.review.ingest.folderLabel), TENDER_ID)
    await user.click(screen.getByRole('button', { name: copy.review.ingest.submit }))
    const confirm = await screen.findByRole('dialog', {
      name: copy.review.reingestConfirm.title(TENDER_ID),
    })
    expect(confirm).toHaveTextContent(copy.review.reingestConfirm.unknownBody)
    expect(started).toEqual([])
  })

  it('a failed lookup on the brief page leaves the loaded brief without an error banner', async () => {
    const user = userEvent.setup()
    const started = countStarts()
    renderAt(BRIEF_PATH, { token: TEST_REVIEW_TOKEN })
    await briefLoaded()
    server.use(http.get(`/api/review/tenders/${TENDER_ID}`, () => HttpResponse.error()))
    await submitIngest(user)
    await screen.findByRole('dialog', { name: copy.review.reingestConfirm.title(TENDER_ID) })
    expect(screen.queryByText(copy.errors.apiUnreachable)).toBeNull()
    expect(started).toEqual([])
  })

  it('shows the form busy while the lookup runs', async () => {
    const user = userEvent.setup()
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    renderAt('/review', { token: TEST_REVIEW_TOKEN })
    await tenderTable()
    server.use(
      http.get(`/api/review/tenders/${TENDER_ID}`, async () => {
        await held
        return HttpResponse.error()
      }),
    )
    await user.type(screen.getByLabelText(copy.review.ingest.folderLabel), TENDER_ID)
    await user.click(screen.getByRole('button', { name: copy.review.ingest.submit }))
    const busy = await screen.findByRole('button', { name: copy.review.ingest.checking })
    expect(busy).toHaveAttribute('aria-busy', 'true')
    release()
    await screen.findByRole('dialog', { name: copy.review.reingestConfirm.title(TENDER_ID) })
    expect(screen.getByRole('button', { name: copy.review.ingest.submit })).not.toHaveAttribute(
      'aria-busy',
    )
  })

  it('a token refused during the lookup returns to the token gate', async () => {
    const user = userEvent.setup()
    const started = countStarts()
    renderAt('/review', { token: TEST_REVIEW_TOKEN })
    await tenderTable()
    server.use(
      http.get(`/api/review/tenders/${TENDER_ID}`, () => new HttpResponse(null, { status: 401 })),
      http.get('/api/review/tenders', () => new HttpResponse(null, { status: 401 })),
    )
    await user.type(screen.getByLabelText(copy.review.ingest.folderLabel), TENDER_ID)
    await user.click(screen.getByRole('button', { name: copy.review.ingest.submit }))
    expect(await screen.findByLabelText(copy.review.gate.label)).toBeInTheDocument()
    expect(
      screen.queryByRole('dialog', { name: copy.review.reingestConfirm.title(TENDER_ID) }),
    ).toBeNull()
    expect(started).toEqual([])
  })

  it('an ingest run from the tender list carries the cleared overrides to the brief', async () => {
    const user = userEvent.setup()
    renderAt('/review', { token: TEST_REVIEW_TOKEN })
    await tenderTable()
    await user.type(screen.getByLabelText(copy.review.ingest.folderLabel), TENDER_ID)
    await user.click(screen.getByRole('button', { name: copy.review.ingest.submit }))
    const modal = await screen.findByRole('dialog', { name: copy.modal.liveTitle(TENDER_ID) })
    await user.click(await within(modal).findByRole('button', { name: copy.modal.openBrief }, SLOW))
    await briefLoaded()
    expect(screen.getByText(copy.review.reingested)).toBeInTheDocument()
    expect(screen.getByText(CLEARED)).toBeInTheDocument()
  })
})
