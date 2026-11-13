import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '../api/queryClient'
import { Brief } from '../api/schemas'
import { mailtoHref } from '../components/landing/mailto'
import { copy } from '../content/copy'
import sampleJson from '../generated/sample-brief.json'
import { AppShell } from '../router'
import Landing from './Landing'

const EMAIL = 'founder@example.test'

beforeEach(() => {
  // jsdom has no matchMedia. Reduced motion keeps MoneyFigure instant and the bars still.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
  vi.stubEnv('VITE_CONTACT_EMAIL', EMAIL)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function sample(): Brief {
  return Brief.parse(sampleJson)
}

function Providers({ children, path = '/' }: { children: ReactNode; path?: string }) {
  const [client] = useState(() => createQueryClient({ retryDelay: 0 }))
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

function renderLanding(brief?: Brief) {
  return render(
    <Providers>
      <Landing sample={brief} />
    </Providers>,
  )
}

describe('Landing', () => {
  it('hero copy and sample label', () => {
    renderLanding({ ...sample(), ingest_mode: 'live' })
    expect(screen.getByText(copy.landing.eyebrow)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: copy.landing.h1 })).toBeInTheDocument()
    expect(screen.getByText(copy.landing.lede)).toBeInTheDocument()
    expect(screen.getAllByText(copy.landing.sampleLabel).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/test extraction/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: copy.landing.primaryCta })).toHaveAttribute(
      'href',
      `/b/${sample().share_id}`,
    )
    expect(document.title).toBe(copy.landing.title)
  })

  it('hero offers primary benchmark CTA and secondary access request', () => {
    renderLanding()
    const hero = screen.getByRole('region', { name: copy.landing.h1 })
    const primary = within(hero).getByRole('link', { name: copy.landing.primaryCta })
    const secondary = within(hero).getByRole('link', { name: copy.landing.secondaryCta })
    expect(primary).toHaveAttribute('href', `/b/${sample().share_id}`)
    expect(secondary).toHaveAttribute('href', '#offer')
    expect(document.getElementById('offer')).toHaveAccessibleName(copy.landing.offer.heading)
    expect(primary.className).toMatch(/primary/)
    expect(secondary.className).toMatch(/secondary/)
    expect(within(hero).getByText(copy.landing.recheckTerms)).toBeInTheDocument()

    // Trust badges alignment
    expect(within(hero).getByText('Done in Minutes')).toBeInTheDocument()
    expect(within(hero).getByText('Direct Link to Every Page')).toBeInTheDocument()
    expect(within(hero).getByText('Your Data Stays Private')).toBeInTheDocument()
  })

  it('nav recheck fills once the hero buttons scroll away, and empties when they return', () => {
    // A controllable IntersectionObserver; reduced motion (beforeEach) keeps the section
    // reveals from creating their own.
    const observers: { callback: IntersectionObserverCallback; rootMargin?: string }[] = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          observers.push({ callback, rootMargin: options?.rootMargin })
        }
        observe() {}
        disconnect() {}
      },
    )
    renderLanding()
    const navRecheck = within(document.querySelector('ul')!).getByRole('link', {
      name: copy.landing.nav.recheck,
    })
    expect(navRecheck.className).toMatch(/secondary/)

    // The bar covers the top 72 px: buttons under it count as gone.
    const hero = observers.find((o) => o.rootMargin === '-72px 0px 0px 0px')
    expect(hero).toBeDefined()
    const report = (isIntersecting: boolean) =>
      act(() =>
        hero?.callback(
          [{ isIntersecting } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        ),
      )

    report(false)
    expect(navRecheck.className).toMatch(/primary/)
    expect(navRecheck.className).not.toMatch(/secondary/)

    report(true)
    expect(navRecheck.className).toMatch(/secondary/)
  })

  it('nav recheck stays outlined where IntersectionObserver is missing', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    renderLanding()
    const navRecheck = within(document.querySelector('ul')!).getByRole('link', {
      name: copy.landing.nav.recheck,
    })
    expect(navRecheck.className).toMatch(/secondary/)
  })

  it('test-extraction label when snapshot is answer_key', () => {
    expect(sample().ingest_mode).toBe('answer_key')
    renderLanding()
    expect(
      screen.getByText(`${copy.landing.sampleLabel} · ${copy.brief.testExtraction}`),
    ).toBeInTheDocument()
  })

  it.each([
    ['the hero', () => screen.getByRole('region', { name: copy.landing.h1 })],
    ['How it works', () => screen.getByRole('region', { name: copy.landing.howItWorks.heading })],
  ])('Watch automated evaluation opens the modal, from %s', async (_where, section) => {
    const user = userEvent.setup()
    renderLanding()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(within(section()).getByRole('button', { name: copy.landing.watchButton }))
    const dialog = screen.getByRole('dialog', { name: copy.modal.title(sample().tender.id) })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(copy.modal.chipRecorded)).toBeInTheDocument()
  })

  it('How it works shows 3 simple cards in plain English', () => {
    renderLanding()
    const section = screen.getByRole('region', { name: copy.landing.howItWorks.heading })
    const [step1, step2, step3] = within(section).getAllByRole('listitem')

    // Step 1: Upload Your Files
    expect(
      within(step1!).getByRole('heading', {
        level: 3,
        name: copy.landing.howItWorks.steps[0]?.title,
      }),
    ).toBeInTheDocument()
    expect(
      within(step1!).getByText(
        'Drop in what you asked to buy and the bids you received (PDFs, Word documents, or spreadsheets).',
      ),
    ).toBeInTheDocument()

    // Step 2: Instant Check
    expect(
      within(step2!).getByRole('heading', {
        level: 3,
        name: copy.landing.howItWorks.steps[1]?.title,
      }),
    ).toBeInTheDocument()
    expect(
      within(step2!).getByText(
        'SpecClaw reads every line in minutes to catch missing work, hidden rules, and missed requirements.',
      ),
    ).toBeInTheDocument()

    // Step 3: See the Real Price
    expect(
      within(step3!).getByRole('heading', {
        level: 3,
        name: copy.landing.howItWorks.steps[2]?.title,
      }),
    ).toBeInTheDocument()
    expect(
      within(step3!).getByText(
        'Get a side-by-side view showing the true cost for each vendor, with links directly to the proof.',
      ),
    ).toBeInTheDocument()
  })

  it('does not render price sensitivity sliders on the landing page', () => {
    renderLanding()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('mailto has subject and checklist', () => {
    const href = mailtoHref(EMAIL)
    expect(href.startsWith(`mailto:${EMAIL}?`)).toBe(true)
    const params = new URLSearchParams(href.slice(href.indexOf('?') + 1))
    expect(params.get('subject')).toBe('Evaluation request: switchgear package')
    expect(params.get('body')).toBe(copy.landing.mailto.body)
    expect(params.get('body')).toContain('Participating bidders:')
    expect(href).not.toContain('+')

    renderLanding()
    const offer = screen.getByRole('region', { name: copy.landing.offer.heading })
    expect(within(offer).getByRole('link', { name: copy.landing.offer.button })).toHaveAttribute(
      'href',
      href,
    )
    expect(within(offer).getByText(copy.landing.offer.orWriteTo(EMAIL))).toBeInTheDocument()

    // Offer checklists
    expect(
      within(offer).getByRole('heading', { level: 3, name: copy.landing.offer.whatToSendHeading }),
    ).toBeInTheDocument()
    for (const item of copy.landing.offer.whatToSend) {
      expect(within(offer).getByText(item)).toBeInTheDocument()
    }
    expect(
      within(offer).getByRole('heading', {
        level: 3,
        name: copy.landing.offer.whatComesBackHeading,
      }),
    ).toBeInTheDocument()
    for (const item of copy.landing.offer.whatComesBack) {
      expect(within(offer).getByText(item)).toBeInTheDocument()
    }
  })

  it('no contact email hides the email button', () => {
    vi.stubEnv('VITE_CONTACT_EMAIL', '')
    renderLanding()
    const offer = screen.getByRole('region', { name: copy.landing.offer.heading })
    expect(
      within(offer).getByRole('heading', { level: 2, name: copy.landing.offer.heading }),
    ).toBeInTheDocument()
    expect(
      within(offer).queryByRole('link', { name: copy.landing.offer.button }),
    ).not.toBeInTheDocument()
    expect(within(offer).queryByText(/Or email/)).not.toBeInTheDocument()
    expect(within(offer).queryByText(/@/)).not.toBeInTheDocument()
  })

  it('FAQ renders interactive accordion with 4 plain-English questions', async () => {
    const user = userEvent.setup()
    renderLanding()
    const faq = screen.getByRole('region', { name: copy.landing.faqHeading })
    expect(within(faq).getByText(/FREQUENTLY ASKED QUESTIONS/i)).toBeInTheDocument()
    const buttons = within(faq).getAllByRole('button')
    expect(buttons).toHaveLength(4)

    // First question is open by default
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'true')
    expect(
      within(faq).getByText(/Vendors often win deals with low bids, then charge huge extra fees/i),
    ).toBeInTheDocument()

    // Second question starts closed, expands on click
    expect(buttons[1]).toHaveAttribute('aria-expanded', 'false')
    await user.click(buttons[1]!)
    expect(buttons[1]).toHaveAttribute('aria-expanded', 'true')
    expect(within(faq).getByText(/Regular AI guesses and makes mistakes/i)).toBeInTheDocument()
  })

  it('Section B displays side-by-side comparison box showing how a buyer gets tricked', () => {
    renderLanding()
    const section = screen.getByRole('region', {
      name: copy.landing.sideBySide.heading,
    })
    expect(within(section).getByText(copy.landing.sideBySide.subheading)).toBeInTheDocument()

    // Box 1 (Promised price)
    expect(within(section).getByText('PAGE 1 · PROMISED PRICE')).toBeInTheDocument()
    expect(within(section).getByText(/Full system supply and delivery/)).toBeInTheDocument()
    expect(within(section).getByText('$1,200,000')).toBeInTheDocument()
    expect(within(section).getByText('Looks like the winning bid')).toBeInTheDocument()

    // Box 2 (Hidden notes)
    expect(within(section).getByText('PAGE 48 · HIDDEN NOTES')).toBeInTheDocument()
    expect(
      within(section).getByText(/Does not include setup, testing, or basic warranty/),
    ).toBeInTheDocument()
    expect(within(section).getByText('+$185,000 in surprise bills later')).toBeInTheDocument()

    // Bottom Result Bar
    expect(within(section).getByText('REAL TOTAL COST: $1,385,000')).toBeInTheDocument()
    expect(within(section).getByText('Rank drops from 1st to 3rd')).toBeInTheDocument()
    expect(
      within(section).getByText(/Catch missing costs before you sign, not after work starts/),
    ).toBeInTheDocument()

    // Proof link
    expect(
      within(section).getByRole('link', { name: /See full sample check with direct page proof/i }),
    ).toHaveAttribute('href', `/b/${sample().share_id}`)
  })

  it('the sections below the hero no longer animate in', () => {
    renderLanding()
    expect(document.querySelector('[data-reveal]')).toBeNull()
    expect(document.querySelector('[data-word]')).toBeNull()
  })

  it('makes no network request on first render', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderLanding()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('shows the legal links once, in the one site footer', async () => {
    render(
      <Providers>
        <AppShell />
      </Providers>,
    )
    await screen.findByRole('heading', { level: 1, name: copy.landing.h1 }, { timeout: 5000 })
    const footers = screen.getAllByRole('contentinfo')
    expect(footers).toHaveLength(1)
    const footer = footers[0] as HTMLElement
    expect(screen.getAllByRole('link', { name: copy.legal.impressum })).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: copy.legal.privacy })).toHaveLength(1)
    expect(within(footer).getByRole('link', { name: copy.legal.impressum })).toHaveAttribute(
      'href',
      '/impressum',
    )
    expect(within(footer).getByRole('link', { name: copy.legal.privacy })).toHaveAttribute(
      'href',
      '/privacy',
    )
    expect(screen.getByText(copy.landing.disclaimer(sample().tender.id))).toBeInTheDocument()
  })

  it('legal pages render markdown', async () => {
    const { unmount } = render(
      <Providers path="/impressum">
        <AppShell />
      </Providers>,
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Impressum' }, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(screen.getByText('FOUNDER-TO-SUPPLY').tagName).toBe('P')
    await waitFor(() => expect(document.title).toBe(copy.meta.title(copy.legal.impressum)))
    unmount()

    render(
      <Providers path="/privacy">
        <AppShell />
      </Providers>,
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Privacy' }, { timeout: 5000 }),
    ).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe(copy.meta.title(copy.legal.privacy)))
  })
})

describe('Landing: search engines', () => {
  it('the landing page stays indexable', () => {
    renderLanding()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })
})
