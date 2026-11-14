import { focusManager, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../../api/queryClient'
import { Brief, type Job } from '../../api/schemas'
import { copy } from '../../content/copy'
import { anchorFor } from '../../domain/footnotes'
import { buildReplay } from '../../domain/replay'
import draftJson from '../../test/fixtures/draft-brief.json'
import jobs from '../../test/fixtures/jobs.json'
import verifiedJson from '../../test/fixtures/verified-brief.json'
import { TENDER_ID, TEST_REVIEW_TOKEN } from '../../test/msw/handlers'
import { server } from '../../test/msw/server'
import { AuditModal } from './AuditModal'

const TRIGGER = 'Watch it check a tender'
const BRIEF_HREF = `/b/${verifiedJson.share_id}`

let reducedMotion = false

function stubMatchMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reducedMotion : true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

function sample(): Brief {
  return Brief.parse(verifiedJson)
}

function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => createQueryClient({ retryDelay: 0 }))
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

function ReplayHarness({ brief }: { brief: Brief }) {
  const [open, setOpen] = useState(false)
  return (
    <Providers>
      <button type="button" onClick={() => setOpen(true)}>
        {TRIGGER}
      </button>
      <AuditModal
        open={open}
        onClose={() => setOpen(false)}
        source={{ kind: 'replay', brief, briefHref: BRIEF_HREF }}
      />
    </Providers>
  )
}

function LiveHarness({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(true)
  const [source] = useState(() => ({
    kind: 'live' as const,
    tenderId: TENDER_ID,
    mode: 'live' as const,
    token: TEST_REVIEW_TOKEN,
    onDone,
  }))
  return (
    <Providers>
      <AuditModal open={open} onClose={() => setOpen(false)} source={source} />
    </Providers>
  )
}

function dialog() {
  return screen.getByRole('dialog')
}

/** The stage row for a plain label. */
function stageRow(label: string) {
  const row = within(dialog())
    .getAllByRole('listitem')
    .find((li) => li.textContent?.includes(label))
  if (!row) throw new Error(`no stage row ${label}`)
  return row
}

beforeEach(() => {
  reducedMotion = false
  stubMatchMedia()
})

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AuditModal: replay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  // Synchronous events: Testing Library's async wrapper waits on a real setTimeout, which
  // Vitest's fake timers freeze. `press` focuses first, as a pointer or keyboard user would.
  function press(name: string) {
    const button = screen.getByRole('button', { name })
    act(() => button.focus())
    fireEvent.click(button)
  }

  function openReplay(brief = sample()) {
    render(<ReplayHarness brief={brief} />)
    press(TRIGGER)
    return { script: buildReplay(brief) }
  }

  function advance(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }

  it('labels the replay and lists four documents', async () => {
    openReplay()
    const modal = screen.getByRole('dialog', { name: copy.modal.title(TENDER_ID) })
    expect(modal).toHaveAttribute('aria-modal', 'true')
    expect(within(modal).getByText(copy.modal.chipRecorded)).toBeInTheDocument()
    const docs = within(modal).getByRole('list', { name: copy.modal.documents.heading })
    const items = within(docs).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent(copy.modal.documents.spec)
    expect(items[0]).toHaveTextContent('MR-33kV-GIS-Rev4.pdf')
    expect(items[0]).toHaveTextContent(copy.modal.documents.pages(26))
    expect(items[2]).toHaveTextContent(copy.modal.documents.bid('VoltSwitch Industrial'))
  })

  it('reveals six findings in order within 8 s', async () => {
    const { script } = openReplay()
    const findings = script.stages.map((s) => s.finding)
    expect(findings).toHaveLength(6)
    expect(script.stages.reduce((sum, s) => sum + s.durationMs, 0)).toBeLessThanOrEqual(8000)
    for (const f of findings) expect(within(dialog()).queryByText(f)).toBeNull()

    script.stages.forEach((stage, i) => {
      advance(stage.durationMs)
      findings.forEach((f, j) => {
        if (j <= i) expect(within(dialog()).getByText(f)).toBeInTheDocument()
        else expect(within(dialog()).queryByText(f)).toBeNull()
      })
    })
    expect(screen.getByRole('link', { name: copy.modal.openBrief })).toBeInTheDocument()
  })

  it('announces each completed stage', async () => {
    const { script } = openReplay()
    const region = within(dialog()).getByRole('status')
    expect(region).toBeEmptyDOMElement()
    for (const stage of script.stages.slice(0, 5)) {
      advance(stage.durationMs)
      expect(region).toHaveTextContent(
        copy.modal.stageDone({ label: stage.label, finding: stage.finding }),
      )
    }
    advance(script.stages[5]?.durationMs ?? 0)
    expect(region).toHaveTextContent(copy.modal.allDone)
  })

  it('skip shows the result immediately', async () => {
    const { script } = openReplay()
    press(copy.modal.skip)
    for (const stage of script.stages) {
      expect(within(dialog()).getByText(stage.finding)).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: copy.modal.skip })).toBeNull()
    expect(screen.getByRole('link', { name: copy.modal.openBrief })).toHaveFocus()
    expect(within(dialog()).getByRole('status')).toHaveTextContent(copy.modal.allDone)
  })

  it('pause stops the replay and play resumes it', async () => {
    const { script } = openReplay()
    const first = script.stages[0]
    if (!first) throw new Error('no first stage')
    advance(Math.floor(first.durationMs / 2))
    press(copy.modal.pause)
    advance(20_000)
    expect(within(dialog()).queryByText(first.finding)).toBeNull()

    press(copy.modal.play)
    expect(screen.getByRole('button', { name: copy.modal.pause })).toBeInTheDocument()
    advance(Math.ceil(first.durationMs / 2))
    expect(within(dialog()).getByText(first.finding)).toBeInTheDocument()
    expect(within(dialog()).queryByText(script.stages[1]?.finding ?? '')).toBeNull()
  })

  it('Open the brief links to the VoltSwitch PARAM-01 anchor', async () => {
    openReplay()
    press(copy.modal.skip)
    expect(screen.getByRole('link', { name: copy.modal.openBrief })).toHaveAttribute(
      'href',
      `${BRIEF_HREF}#${anchorFor('vendor-b', 'PARAM-01')}`,
    )
    expect(screen.getByRole('button', { name: copy.modal.watchAgain })).toBeInTheDocument()
  })

  it('watch again restarts from the first stage', async () => {
    const { script } = openReplay()
    press(copy.modal.skip)
    press(copy.modal.watchAgain)
    for (const stage of script.stages) {
      expect(within(dialog()).queryByText(stage.finding)).toBeNull()
    }
    expect(screen.getByRole('button', { name: copy.modal.pause })).toHaveFocus()
    advance(script.stages[0]?.durationMs ?? 0)
    expect(within(dialog()).getByText(script.stages[0]?.finding ?? '')).toBeInTheDocument()
  })

  it('Escape closes and returns focus to the trigger', async () => {
    openReplay()
    expect(dialog()).toContainElement(document.activeElement as HTMLElement)
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: TRIGGER })).toHaveFocus()
  })

  it('reduced motion renders all stages complete', async () => {
    reducedMotion = true
    const { script } = openReplay()
    for (const stage of script.stages) {
      expect(within(dialog()).getByText(stage.finding)).toBeInTheDocument()
      expect(stageRow(stage.label)).toHaveTextContent(copy.modal.stageState.done)
    }
    expect(screen.queryByRole('button', { name: copy.modal.skip })).toBeNull()
    expect(screen.queryByRole('button', { name: copy.modal.pause })).toBeNull()
    expect(screen.getByRole('link', { name: copy.modal.openBrief })).toBeInTheDocument()
  })

  it('timing footer only when speed > 1', async () => {
    // The sample's run took 41.66 s; shown in 8 s, that is 5.2× speed.
    openReplay()
    expect(
      within(dialog()).getByText(
        copy.modal.timing({ date: '5 November 2026', seconds: '41.7', speed: '5.2' }),
      ),
    ).toBeInTheDocument()
    cleanup()

    // A run that fits in the replay is shown at real speed: no timing claim.
    const quick = sample()
    quick.stage_log = quick.stage_log.map((e) => ({ ...e, t_ms: Math.round(e.t_ms / 10) }))
    openReplay(quick)
    expect(within(dialog()).queryByText(/speed/)).toBeNull()
    expect(within(dialog()).queryByText(/^Recorded \d/)).toBeNull()
    cleanup()

    // A draft has no recorded date: the footer drops it rather than print "null".
    openReplay(Brief.parse(draftJson))
    const footer = within(dialog()).getByText(
      copy.modal.timingUndated({ seconds: '41.7', speed: '5.2' }),
    )
    expect(footer).toBeInTheDocument()
    expect(dialog()).not.toHaveTextContent(/null|Invalid/)
  })

  it('adds no banner or contentinfo landmark to the page it opens over', () => {
    // Found by e2e/a11y.spec.ts: the dialog is portalled to body, where a <header> or <footer>
    // counts as the page's banner or contentinfo, a second one beside the site's own.
    openReplay()
    expect(screen.queryAllByRole('banner')).toEqual([])
    expect(screen.queryAllByRole('contentinfo')).toEqual([])
    press(copy.modal.skip)
    expect(within(dialog()).getByRole('link', { name: copy.modal.openBrief })).toBeInTheDocument()
    expect(screen.queryAllByRole('banner')).toEqual([])
    expect(screen.queryAllByRole('contentinfo')).toEqual([])
  })
})

describe('AuditModal: live', () => {
  /** The job responses the test steps through; the handler serves `responses[step]`. */
  function serveJobs(responses: Job[]) {
    const state = { step: 0, polls: 0, starts: 0 }
    server.use(
      http.post('/api/jobs/ingest', () => {
        state.starts += 1
        return HttpResponse.json(jobs.start)
      }),
      http.get('/api/jobs/:jobId', () => {
        state.polls += 1
        return HttpResponse.json(responses[Math.min(state.step, responses.length - 1)])
      }),
    )
    return state
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  async function nextPoll(state: { step: number; polls: number }) {
    const before = state.polls
    state.step += 1
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750)
    })
    await vi.waitFor(() => expect(state.polls).toBeGreaterThan(before))
  }

  const [intake, parse] = jobs.processing as Job[]

  it('live mode maps backend stages and shows failure stage and message', async () => {
    const state = serveJobs([
      jobs.queued as Job,
      intake as Job,
      parse as Job,
      { ...(jobs.failed as Job), stage: 'Parse' },
    ])
    render(<LiveHarness onDone={() => {}} />)

    const modal = screen.getByRole('dialog', { name: copy.modal.liveTitle(TENDER_ID) })
    expect(within(modal).getByText(copy.modal.chipLive)).toBeInTheDocument()
    // The worker's first state is PENDING with "Queued in worker pipeline": nothing has started.
    expect(await within(modal).findByText(copy.modal.queued)).toBeInTheDocument()
    expect(state.starts).toBe(1)
    const labels = copy.modal.stages

    // Intake reported: still reading (Intake and Parse both belong to the first stage).
    await nextPoll(state)
    await vi.waitFor(() =>
      expect(stageRow(labels[0] ?? '')).toHaveTextContent(copy.modal.stageState.active),
    )
    expect(within(modal).queryByText(copy.modal.queued)).toBeNull()

    // Parse reported: reading is done, finding the evidence is under way.
    await nextPoll(state)
    await vi.waitFor(() =>
      expect(stageRow(labels[0] ?? '')).toHaveTextContent(copy.modal.stageState.done),
    )
    expect(stageRow(labels[1] ?? '')).toHaveTextContent(copy.modal.stageState.active)
    expect(stageRow(labels[2] ?? '')).toHaveTextContent(copy.modal.stageState.pending)
    expect(within(modal).getByRole('status')).toHaveTextContent(
      copy.modal.stageDone({ label: labels[0] ?? '', finding: null }),
    )

    // The job fails while locating quotes (after Parse was reported).
    await nextPoll(state)
    const alert = await within(modal).findByRole('alert')
    expect(alert).toHaveTextContent(
      copy.modal.failure({ stage: labels[1] ?? '', error: jobs.failed.error }),
    )
    expect(stageRow(labels[1] ?? '')).toHaveTextContent(copy.modal.stageState.failed)
    expect(within(modal).getByRole('button', { name: copy.modal.tryAgain })).toBeInTheDocument()
  })

  it('an unknown stage on a running job keeps it running at the last known stage (R27)', async () => {
    // Showing it as failed would offer Try again while the job still runs: a second ingest.
    const state = serveJobs([
      jobs.queued as Job,
      parse as Job,
      { ...(parse as Job), stage: 'Reticulate splines' },
    ])
    render(<LiveHarness onDone={() => {}} />)
    const labels = copy.modal.stages
    await within(dialog()).findByText(copy.modal.queued)
    await nextPoll(state)
    await vi.waitFor(() =>
      expect(stageRow(labels[1] ?? '')).toHaveTextContent(copy.modal.stageState.active),
    )
    await nextPoll(state)
    expect(stageRow(labels[1] ?? '')).toHaveTextContent(copy.modal.stageState.active)
    expect(within(dialog()).queryByRole('alert')).toBeNull()
    expect(within(dialog()).queryByRole('button', { name: copy.modal.tryAgain })).toBeNull()
    expect(state.starts).toBe(1)
  })

  it('an unknown stage on a failed job still shows the failure', async () => {
    const state = serveJobs([
      jobs.queued as Job,
      { ...(jobs.failed as Job), stage: 'Reticulate splines' },
    ])
    render(<LiveHarness onDone={() => {}} />)
    await within(dialog()).findByText(copy.modal.queued)
    await nextPoll(state)
    const alert = await within(dialog()).findByRole('alert')
    expect(alert).toHaveTextContent('Stopped at Reticulate splines')
  })

  it('live mode shows the job as lost when the API forgets it mid-run (a restart)', async () => {
    const state = { step: 0, polls: 0 }
    server.use(
      http.post('/api/jobs/ingest', () => HttpResponse.json(jobs.start)),
      http.get('/api/jobs/:jobId', () => {
        state.polls += 1
        // The job store is in memory: after a restart the job ID is unknown.
        return state.step === 0
          ? HttpResponse.json(parse)
          : HttpResponse.json({ detail: 'Job not found' }, { status: 404 })
      }),
    )
    render(<LiveHarness onDone={() => {}} />)
    await vi.waitFor(() =>
      expect(stageRow(copy.modal.stages[1] ?? '')).toHaveTextContent(copy.modal.stageState.active),
    )
    await nextPoll(state)
    const alert = await within(dialog()).findByRole('alert')
    expect(alert).toHaveTextContent(copy.modal.jobLost)
    expect(within(dialog()).getByRole('button', { name: copy.modal.tryAgain })).toBeInTheDocument()
  })

  it('live mode shows the findings and reports done once the job completes', async () => {
    const onDone = vi.fn()
    const state = serveJobs([jobs.queued as Job, parse as Job, jobs.completed as Job])
    render(<LiveHarness onDone={onDone} />)
    await within(dialog()).findByText(copy.modal.queued)
    await nextPoll(state)
    await nextPoll(state)
    const script = buildReplay(Brief.parse(draftJson))
    for (const stage of script.stages) {
      expect(await within(dialog()).findByText(stage.finding)).toBeInTheDocument()
    }
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(within(dialog()).getByRole('status')).toHaveTextContent(copy.modal.allDone)
    expect(within(dialog()).getAllByRole('listitem').length).toBeGreaterThan(6)
    // No timing claim for a live run, and polling has stopped.
    expect(within(dialog()).queryByText(/speed/)).toBeNull()
    const polls = state.polls
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(state.polls).toBe(polls)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('a completed job stays done when a later refetch 404s (R29)', async () => {
    const state = { done: false, polls: 0 }
    server.use(
      http.post('/api/jobs/ingest', () => HttpResponse.json(jobs.start)),
      http.get('/api/jobs/:jobId', () => {
        state.polls += 1
        // Done, then the API restarts: its in-memory job store no longer knows the job.
        return state.done
          ? HttpResponse.json({ detail: 'Job not found' }, { status: 404 })
          : HttpResponse.json(jobs.completed)
      }),
    )
    render(<LiveHarness onDone={() => {}} />)
    const script = buildReplay(Brief.parse(draftJson))
    for (const stage of script.stages) {
      expect(await within(dialog()).findByText(stage.finding)).toBeInTheDocument()
    }

    // Polling has stopped; a window refocus still refetches the job, and it 404s.
    state.done = true
    const polls = state.polls
    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    await vi.waitFor(() => expect(state.polls).toBeGreaterThan(polls))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    for (const stage of script.stages) {
      expect(within(dialog()).getByText(stage.finding)).toBeInTheDocument()
    }
    expect(within(dialog()).queryByRole('alert')).toBeNull()
    expect(within(dialog()).queryByText(copy.modal.jobLost)).toBeNull()
    expect(within(dialog()).queryByRole('button', { name: copy.modal.tryAgain })).toBeNull()
    act(() => focusManager.setFocused(undefined))
  })
})
