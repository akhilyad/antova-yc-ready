import { useEffect, useRef, useState } from 'react'
import type { Replay } from '../../domain/replay'

export type ReplayControls = {
  /** The stage on screen now; equal to the stage count once every stage is done. */
  activeIndex: number
  done: boolean
  paused: boolean
  /** Show every stage complete at once. */
  skip(): void
  /** Start again from the first stage. */
  restart(): void
  pause(): void
  play(): void
}

type State = { index: number; paused: boolean; remaining: number | null }

const START: State = { index: 0, paused: false, remaining: null }

/**
 * Plays a replay script: each stage stays active for its `durationMs`, then the next starts.
 * Pausing keeps the time left in the current stage, so play resumes where it stopped. Under
 * reduced motion there is no playback: every stage reads as complete from the start. While
 * `active` is false (the modal is closed) no timer runs, and the next activation starts over.
 */
export function useReplay(
  script: Replay | null,
  { reducedMotion, active = true }: { reducedMotion: boolean; active?: boolean },
): ReplayControls {
  const count = script?.stages.length ?? 0
  // `remaining`: the time left in the current stage after a pause, used by the next timer
  // instead of the stage's full duration; null while the stage hasn't been paused.
  const [state, setState] = useState<State>(START)
  const [wasActive, setWasActive] = useState(active)
  // The current stage's timer: when it started and how long it runs.
  const timer = useRef({ startedAt: 0, ms: 0 })

  // Reopening starts the replay over (state adjusted during render, not in an effect).
  if (active !== wasActive) {
    setWasActive(active)
    if (active) setState(START)
  }

  const index = reducedMotion ? count : Math.min(state.index, count)
  const done = index >= count
  const running = active && !done && !state.paused && !reducedMotion
  const ms = state.remaining ?? script?.stages[index]?.durationMs ?? 0

  useEffect(() => {
    if (!running) return
    timer.current = { startedAt: Date.now(), ms }
    const id = setTimeout(() => {
      setState((s) => ({ index: s.index + 1, paused: false, remaining: null }))
    }, ms)
    return () => clearTimeout(id)
  }, [running, index, ms])

  return {
    activeIndex: index,
    done,
    paused: state.paused,
    skip: () => setState({ index: count, paused: false, remaining: null }),
    restart: () => setState(START),
    pause: () => {
      if (!running) return
      const { startedAt, ms: timerMs } = timer.current
      const left = Math.max(0, timerMs - (Date.now() - startedAt))
      setState((s) => ({ ...s, paused: true, remaining: left }))
    },
    play: () => setState((s) => ({ ...s, paused: false })),
  }
}
