import { fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RATES } from '../../api/client'
import { Brief } from '../../api/schemas'
import { copy } from '../../content/copy'
import sampleJson from '../../generated/sample-brief.json'
import { levelTender, type VendorLevel } from '../../domain/leveling'
import { formatEur } from '../../domain/money'
import { Sandbox } from './Sandbox'

beforeEach(() => {
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
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function sample(): Brief {
  return Brief.parse(sampleJson)
}

function byEvaluated(levels: VendorLevel[]): VendorLevel[] {
  return [...levels].sort((a, b) => a.evaluatedCents - b.evaluatedCents)
}

function barsOrder(container: HTMLElement): string[] {
  const list = within(container).getByRole('list', { name: copy.brief.ranking.evaluatedOrder })
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '')
}

describe('Sandbox Component', () => {
  it('sandbox re-sorts bidders when copper changes', () => {
    const brief = sample()
    const { container } = render(<Sandbox brief={brief} />)
    const atDefault = levelTender(brief.tender, DEFAULT_RATES, brief.overrides)
    expect(barsOrder(container)).toEqual(
      byEvaluated(atDefault).map((l) =>
        copy.brief.ranking.item({ name: l.name, price: formatEur(l.evaluatedCents) }),
      ),
    )

    const copper = within(container).getByRole('slider', { name: copy.brief.rates.copper })
    fireEvent.change(copper, { target: { value: '2.5' } })
    expect(copper).toHaveAttribute('aria-valuetext', '2.50 times the rate table')

    const levels = levelTender(brief.tender, { ...DEFAULT_RATES, copper: 2.5 }, brief.overrides)
    const volt = levels.find((l) => l.vendorId === 'vendor-b')
    expect(volt).toBeDefined()
    expect(volt?.evaluatedCents).not.toBe(
      atDefault.find((l) => l.vendorId === 'vendor-b')?.evaluatedCents,
    )
    expect(
      within(container).getAllByText(formatEur(volt?.evaluatedCents ?? 0)).length,
    ).toBeGreaterThan(0)
    expect(barsOrder(container)).toEqual(
      byEvaluated(levels).map((l) =>
        copy.brief.ranking.item({ name: l.name, price: formatEur(l.evaluatedCents) }),
      ),
    )
  })

  it('sandbox moves Deltaport / Bidder C ahead when site labour drops', () => {
    const brief = sample()
    const { container } = render(<Sandbox brief={brief} />)
    expect(barsOrder(container)[0]).toMatch(/^Bidder B/)
    const labour = within(container).getByRole('slider', { name: copy.brief.rates.labour })
    fireEvent.change(labour, { target: { value: '20' } })
    expect(barsOrder(container)[0]).toMatch(/^Bidder C/)

    fireEvent.click(within(container).getByRole('button', { name: copy.brief.rates.reset }))
    expect(barsOrder(container)[0]).toMatch(/^Bidder B/)
    expect(labour).toHaveValue(String(DEFAULT_RATES.labour))
  })

  it('sensitivity bars have a text alternative listing bidders in order', () => {
    const brief = sample()
    const { container } = render(<Sandbox brief={brief} />)
    const levels = levelTender(brief.tender, DEFAULT_RATES, brief.overrides)
    expect(barsOrder(container)).toEqual([
      `Bidder B (Evaluated Low), ${formatEur(45200000)}`,
      `Bidder C, ${formatEur(45400000)}`,
      `Bidder A (Apparent Low), ${formatEur(48280000)}`,
    ])
    expect(barsOrder(container)).toHaveLength(levels.length)
    const chart = within(container).getByTestId('sensitivity-bars')
    expect(chart).toHaveAttribute('aria-hidden', 'true')
  })
})
