import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MoneyFigure } from './MoneyFigure'

// Each animation's onUpdate, so a test can play the frames it wants.
const frames = vi.hoisted(() => ({ onUpdate: [] as Array<(latest: number) => void> }))
vi.mock('motion', () => ({
  animate: (_from: number, _to: number, options: { onUpdate: (latest: number) => void }) => {
    frames.onUpdate.push(options.onUpdate)
    return { stop: () => {} }
  },
}))

function play(latest: number) {
  const onUpdate = frames.onUpdate.at(-1)
  if (onUpdate === undefined) throw new Error('no animation started')
  act(() => onUpdate(latest))
}

describe('MoneyFigure counting', () => {
  it('counts in whole euros between two whole-euro values', () => {
    const { rerender } = render(<MoneyFigure cents={5000000} variant="total" />)
    rerender(<MoneyFigure cents={5500000} variant="total" />)
    for (const latest of [5097059, 5249950.4, 5497059]) {
      play(latest)
      const shown = screen.getByText(/^€/).textContent ?? ''
      expect(shown).not.toContain('.')
    }
    expect(screen.getByText('€54,971')).toBeInTheDocument()
  })

  it('counts in cents when either end has cents', () => {
    const { rerender } = render(<MoneyFigure cents={100050} variant="total" />)
    rerender(<MoneyFigure cents={250000} variant="total" />)
    play(150049.6)
    expect(screen.getByText('€1,500.50')).toBeInTheDocument()
  })

  it('ignores a late frame from a count the figure has moved on from', () => {
    const { rerender } = render(<MoneyFigure cents={48280000} variant="total" />)
    rerender(<MoneyFigure cents={50167000} variant="total" />)
    const stale = frames.onUpdate.at(-1)!
    rerender(<MoneyFigure cents={48280000} variant="total" />)
    play(48280000)
    act(() => stale(48357200))
    expect(screen.getByText('€482,800')).toBeInTheDocument()
  })
})
