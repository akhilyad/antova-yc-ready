/** A vendor as the flip plays it, in bid order, with whether its rank worsened. */
export type FlipVendor = { vendorId: string; worsened: boolean }

/**
 * How far a vendor has got: 1 its line is drawing, 2 it has landed (its evaluated label shows
 * and its price counts up from the bid), 3 its rank change is marked ("1st → 3rd").
 */
export type FlipProgress = 1 | 2 | 3

export type FlipStep = { at: number; vendorId: string; progress: FlipProgress }

/** Milliseconds. */
export type FlipTiming = {
  /** Before the first line, so the bid order is read first. */
  start: number
  /** From one line starting to the next. */
  stagger: number
  /** An extra pause before the first line that falls. */
  beat: number
  /** A line's draw, a price's count and a label's fade all fit in this. */
  settle: number
}

/**
 * The hero flip's timeline. Lines draw one after another: first the vendors whose rank held
 * or improved, in bid order, then, after a beat, the ones that fell, so VoltSwitch lands last.
 * A vendor lands one `settle` after its line starts; a fallen vendor's rank change is marked
 * one `settle` later, once its price has counted up. `end` is when everything has settled.
 */
export function flipSchedule(
  vendors: readonly FlipVendor[],
  t: FlipTiming,
): { steps: FlipStep[]; end: number } {
  const order = [...vendors.filter((v) => !v.worsened), ...vendors.filter((v) => v.worsened)]
  const steps: FlipStep[] = []
  let at = t.start
  order.forEach((v, i) => {
    if (v.worsened && i > 0 && !order[i - 1]!.worsened) at += t.beat
    steps.push({ at, vendorId: v.vendorId, progress: 1 })
    steps.push({ at: at + t.settle, vendorId: v.vendorId, progress: 2 })
    if (v.worsened) steps.push({ at: at + 2 * t.settle, vendorId: v.vendorId, progress: 3 })
    at += t.stagger
  })
  // Stable: steps at the same moment keep their order.
  steps.sort((a, b) => a.at - b.at)
  const end = steps.reduce((latest, step) => Math.max(latest, step.at + t.settle), 0)
  return { steps, end }
}
