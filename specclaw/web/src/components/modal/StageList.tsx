import { motion } from 'motion/react'
import type { CSSProperties } from 'react'
import { copy } from '../../content/copy'
import styles from './StageList.module.css'

export type StageState = 'pending' | 'active' | 'done' | 'failed'

export type StageItem = {
  label: string
  /** Shown once the stage is done; null when there is nothing to show yet (a live run). */
  finding: string | null
  state: StageState
  /** How long the active stage runs on screen (a replay), drawn as a filling rule. */
  durationMs?: number
}

export type StageListProps = {
  stages: readonly StageItem[]
  /** The list's accessible name. */
  label: string
  reducedMotion: boolean
  /** The replay is paused: the active stage's rule stops filling. */
  paused?: boolean
}

/** Spec §8.1 swap timing: 200 ms on the standard curve. */
const SWAP = { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const }

const MARKS: Record<StageState, string | null> = {
  pending: null,
  active: null,
  done: '✓',
  failed: '✗',
}

/**
 * The audit modal's six steps (spec §7.2), in order. Each row shows its number until it is
 * done (✓) or stopped (✗), with the state in words for screen readers; a done stage reveals
 * its finding. The finding fades in and the mark settles, except under reduced motion.
 */
export function StageList({ stages, label, reducedMotion, paused = false }: StageListProps) {
  return (
    <ol className={styles.list} aria-label={label}>
      {stages.map((stage, i) => {
        const mark = MARKS[stage.state]
        const timed = stage.state === 'active' && stage.durationMs !== undefined && !reducedMotion
        return (
          <li key={stage.label} className={styles.stage} data-state={stage.state}>
            <motion.span
              key={stage.state}
              className={styles.marker}
              aria-hidden="true"
              initial={reducedMotion ? false : { opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={SWAP}
            >
              {mark ?? i + 1}
            </motion.span>
            <div className={styles.body}>
              <p className={styles.label}>
                <span className="visually-hidden">{copy.modal.stageState[stage.state]}: </span>
                {stage.label}
              </p>
              {stage.state === 'done' && stage.finding !== null ? (
                <motion.p
                  className={styles.finding}
                  initial={reducedMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={SWAP}
                >
                  {stage.finding}
                </motion.p>
              ) : null}
              {timed ? (
                <span
                  className={styles.progress}
                  data-paused={paused || undefined}
                  style={{ '--stage-ms': `${stage.durationMs}ms` } as CSSProperties}
                  aria-hidden="true"
                />
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
