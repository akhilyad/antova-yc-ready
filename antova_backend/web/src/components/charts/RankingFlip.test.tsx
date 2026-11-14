import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RATES } from '../../api/client'
import { Brief } from '../../api/schemas'
import { levelTender, type VendorLevel } from '../../domain/leveling'
import verifiedJson from '../../test/fixtures/verified-brief.json'
import { renderToString } from 'react-dom/server'
import { RankingFlip } from './RankingFlip'

// Tweens and counts finish at once: these tests follow the flip's timeline, not its frames.
vi.mock('motion', () => ({
  animate: (_from: number, to: number, options: { onUpdate: (latest: number) => void }) => {
    options.onUpdate(to)
    return { stop: () => {} }
  },
}))
// The token's real value, so the timeline's moments are the ones written below.
vi.mock('../../lib/settleMs', () => ({ settleMs: () => 500 }))

const levels = levelTender(Brief.parse(verifiedJson).tender, DEFAULT_RATES, [])

describe('RankingFlip', () => {
  it('RankingFlip exposes both orders as text and marks VoltSwitch worsened', () => {
    const { container } = render(<RankingFlip levels={levels} />)

    const bidOrder = screen.getByRole('list', { name: 'By bid price, lowest first' })
    expect(
      within(bidOrder)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'VoltSwitch Industrial, €418,000',
      'Deltaport Skid Consortium B.V., €439,000',
      'Nordwerk Schaltanlagen GmbH, €452,000',
    ])
    const evalOrder = screen.getByRole('list', { name: 'By evaluated price, lowest first' })
    expect(
      within(evalOrder)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Nordwerk Schaltanlagen GmbH, €452,000',
      'Deltaport Skid Consortium B.V., €454,000',
      'VoltSwitch Industrial, €479,650, down from 1st on bid price',
    ])

    // The worsened line is dashed and labelled, not only oxblood.
    const volt = container.querySelector('line[data-vendor="vendor-b"]')
    expect(volt).toHaveAttribute('data-worsened', 'true')
    expect(volt).toHaveAttribute('stroke-dasharray')
    expect(screen.getByText('1st → 3rd')).toBeInTheDocument()

    for (const id of ['vendor-a', 'vendor-c']) {
      const line = container.querySelector(`line[data-vendor="${id}"]`)
      expect(line).toHaveAttribute('data-worsened', 'false')
      expect(line).not.toHaveAttribute('stroke-dasharray')
    }
    // Nordwerk moves up (3rd → 1st); only a worsening is labelled.
    expect(screen.queryByText('3rd → 1st')).toBeNull()
  })

  it('keeps the drawing out of the accessibility tree', () => {
    const { container } = render(<RankingFlip levels={levels} />)
    expect(container.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('grows the plot so every label keeps its gap (names wrap to three lines)', () => {
    const plotted = (container: HTMLElement) => container.querySelector('svg')?.style.height
    expect(plotted(render(<RankingFlip levels={levels} />).container)).toBe('160px')
    // Five bidders: four gaps of 76 px don't fit in 160 px, so the plot grows instead of
    // spreading the labels over each other.
    const five: VendorLevel[] = [0, 1, 2, 3, 4].map((i) => ({
      ...levels[0]!,
      vendorId: `vendor-${i}`,
      name: `Bidder ${i}`,
      headlineCents: 40_000_000 + i * 100_000,
      evaluatedCents: 45_000_000 + i * 100_000,
    }))
    expect(plotted(render(<RankingFlip levels={five} />).container)).toBe('304px')
  })

  it('never arms without play (the brief page)', () => {
    const { container } = render(<RankingFlip levels={levels} />)
    expect(container.querySelector('[data-flip]')).toBeNull()
    expect(container.querySelector('[data-flip-part]')).toBeNull()
  })

  it('leaves out a vendor without a bid price', () => {
    const missing: VendorLevel[] = levels.map((l) =>
      l.vendorId === 'vendor-c' ? { ...l, headlineCents: 0, evaluatedCents: 0 } : l,
    )
    const { container } = render(<RankingFlip levels={missing} height={120} />)
    expect(container.querySelectorAll('line')).toHaveLength(2)
    const bidOrder = screen.getByRole('list', { name: 'By bid price, lowest first' })
    expect(within(bidOrder).getAllByRole('listitem')).toHaveLength(2)
  })

  it('hovering a vendor dims the other bidders across the chart', () => {
    const { container } = render(<RankingFlip levels={levels} />)
    const voltLine = container.querySelector('line[data-vendor="vendor-b"]')!
    expect(container.querySelectorAll('[data-dimmed]')).toHaveLength(0)

    act(() => {
      fireEvent.pointerEnter(voltLine)
    })

    const dimmed = container.querySelectorAll('[data-dimmed="true"]')
    expect(dimmed.length).toBeGreaterThan(0)
    for (const el of Array.from(dimmed)) {
      expect(el.getAttribute('data-vendor')).not.toBe('vendor-b')
    }

    act(() => {
      fireEvent.pointerLeave(voltLine)
    })
    expect(container.querySelectorAll('[data-dimmed]')).toHaveLength(0)
  })
})

type Observed = {
  callback: IntersectionObserverCallback
  options?: IntersectionObserverInit
  disconnected: boolean
}

/** A browser with or without reduced motion, and an IntersectionObserver a test can drive. */
function stubBrowser({ reduced }: { reduced: boolean }): Observed[] {
  const observers: Observed[] = []
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      entry: Observed
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.entry = { callback, options, disconnected: false }
        observers.push(this.entry)
      }
      observe() {}
      disconnect() {
        this.entry.disconnected = true
      }
    },
  )
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  return observers
}

/** A vendor's label in the evaluated column. */
function evaluatedLabel(container: HTMLElement, name: string): HTMLElement {
  const column = container.querySelector('svg')?.parentElement?.nextElementSibling
  const label = [...(column?.children ?? [])].find((el) => el.textContent?.includes(name))
  if (!(label instanceof HTMLElement)) throw new Error(`no evaluated label for ${name}`)
  return label
}

const shown = (el: Element) => el.hasAttribute('data-shown')

/** Markup without the per-render useId values. */
const normalize = (html: string) => html.replace(/(id|aria-labelledby)="[^"]*"/g, '$1=""')

describe('RankingFlip: the flip (play)', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('plays once on screen, VoltSwitch last, and settles into exactly the static chart', () => {
    const observers = stubBrowser({ reduced: false })
    vi.useFakeTimers()
    const still = render(<RankingFlip levels={levels} />)
    const stillMarkup = normalize(still.container.innerHTML)
    still.unmount()

    const { container } = render(<RankingFlip levels={levels} play />)
    const figure = container.querySelector('figure')!
    const volt = container.querySelector('line[data-vendor="vendor-b"]')!
    const voltLabel = evaluatedLabel(container, 'VoltSwitch')
    const deltaLabel = evaluatedLabel(container, 'Deltaport')

    // Only the bid column shows, and nothing moves until the chart is half on screen.
    expect(figure).toHaveAttribute('data-flip', 'waiting')
    expect(container.querySelectorAll('[data-flip-part]')).toHaveLength(10)
    expect(container.querySelectorAll('[data-shown]')).toHaveLength(0)
    act(() => vi.advanceTimersByTime(5000))
    expect(figure).toHaveAttribute('data-flip', 'waiting')

    const onScreen = observers.find((o) => o.options?.threshold === 0.5)
    expect(onScreen).toBeDefined()
    act(() =>
      onScreen?.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    )
    expect(onScreen?.disconnected).toBe(true)
    expect(figure).toHaveAttribute('data-flip', 'playing')
    // Until it lands, VoltSwitch's evaluated label holds its bid, to count up from.
    expect(within(voltLabel).getByText('€418,000')).toBeInTheDocument()

    // 650 ms: Deltaport and Nordwerk are drawing; VoltSwitch, after its beat, has just begun.
    act(() => vi.advanceTimersByTime(650))
    expect(shown(container.querySelector('line[data-vendor="vendor-c"]')!)).toBe(true)
    expect(shown(volt)).toBe(true)
    expect(volt).toHaveAttribute('x2', '100')
    expect(shown(deltaLabel)).toBe(false)
    expect(shown(voltLabel)).toBe(false)

    // 1150 ms: everyone has landed; VoltSwitch's price has counted to its evaluated price.
    act(() => vi.advanceTimersByTime(500))
    expect(shown(deltaLabel)).toBe(true)
    expect(shown(voltLabel)).toBe(true)
    expect(within(voltLabel).getByText('€479,650')).toBeInTheDocument()
    const mark = within(voltLabel).getByText('1st → 3rd')
    expect(shown(mark)).toBe(false)

    // 1650 ms: the fall is marked.
    act(() => vi.advanceTimersByTime(500))
    expect(shown(mark)).toBe(true)
    expect(figure).toHaveAttribute('data-flip', 'playing')

    // 2150 ms: settled, and the markup is the static chart's, line ends included.
    act(() => vi.advanceTimersByTime(500))
    expect(figure).not.toHaveAttribute('data-flip')
    expect(normalize(container.innerHTML)).toBe(stillMarkup)
  })

  it('shows the final chart at once under reduced motion', () => {
    const observers = stubBrowser({ reduced: true })
    const { container } = render(<RankingFlip levels={levels} play />)
    expect(container.querySelector('[data-flip]')).toBeNull()
    expect(container.querySelector('[data-flip-part]')).toBeNull()
    expect(observers).toHaveLength(0)
  })

  it('shows the final chart at once without IntersectionObserver', () => {
    stubBrowser({ reduced: false })
    vi.stubGlobal('IntersectionObserver', undefined)
    const { container } = render(<RankingFlip levels={levels} play />)
    expect(container.querySelector('[data-flip]')).toBeNull()
  })

  it('prerenders armed, with the real evaluated prices under the hidden parts', () => {
    const html = renderToString(<RankingFlip levels={levels} play />)
    expect(html).toContain('data-flip="armed"')
    expect(html.match(/data-flip-part=""/g)).toHaveLength(10)
    expect(html).not.toContain('data-shown')
    // Without script (index.html un-hides them) a reader gets the final numbers, not the bids.
    expect(html).toContain('€479,650')
  })
})
