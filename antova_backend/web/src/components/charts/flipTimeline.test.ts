import { describe, expect, it } from 'vitest'
import { flipSchedule, type FlipTiming } from './flipTimeline'

const T: FlipTiming = { start: 200, stagger: 120, beat: 160, settle: 500 }

describe('flipSchedule', () => {
  it('draws holding vendors first in bid order and the fallen one last, after a beat', () => {
    // The sample, in bid order: VoltSwitch (falls 1st → 3rd), Deltaport, Nordwerk.
    const { steps, end } = flipSchedule(
      [
        { vendorId: 'volt', worsened: true },
        { vendorId: 'delta', worsened: false },
        { vendorId: 'nord', worsened: false },
      ],
      T,
    )
    expect(steps).toEqual([
      { at: 200, vendorId: 'delta', progress: 1 },
      { at: 320, vendorId: 'nord', progress: 1 },
      { at: 600, vendorId: 'volt', progress: 1 },
      { at: 700, vendorId: 'delta', progress: 2 },
      { at: 820, vendorId: 'nord', progress: 2 },
      { at: 1100, vendorId: 'volt', progress: 2 },
      { at: 1600, vendorId: 'volt', progress: 3 },
    ])
    // VoltSwitch's mark fades in over one settle.
    expect(end).toBe(2100)
  })

  it('needs no beat when nothing falls, and marks nothing', () => {
    const { steps, end } = flipSchedule(
      [
        { vendorId: 'a', worsened: false },
        { vendorId: 'b', worsened: false },
      ],
      T,
    )
    expect(steps.map((s) => s.progress)).toEqual([1, 1, 2, 2])
    expect(steps.filter((s) => s.progress === 1).map((s) => s.at)).toEqual([200, 320])
    // The last price counts for one settle after it lands.
    expect(end).toBe(320 + 500 + 500)
  })

  it('adds no beat when the first vendor already falls', () => {
    const { steps } = flipSchedule(
      [
        { vendorId: 'a', worsened: true },
        { vendorId: 'b', worsened: true },
      ],
      T,
    )
    expect(steps.filter((s) => s.progress === 1).map((s) => s.at)).toEqual([200, 320])
    expect(steps.filter((s) => s.progress === 3).map((s) => s.vendorId)).toEqual(['a', 'b'])
  })

  it('is empty, and over at once, with no vendors', () => {
    expect(flipSchedule([], T)).toEqual({ steps: [], end: 0 })
  })
})
