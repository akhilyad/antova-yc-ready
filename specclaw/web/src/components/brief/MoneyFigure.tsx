import { animate } from 'motion'
import { useEffect, useRef, useState } from 'react'
import { formatAdder, formatEur } from '../../domain/money'
import { settleMs } from '../../lib/settleMs'
import styles from './MoneyFigure.module.css'

export type MoneyVariant = 'headline' | 'struck' | 'adder' | 'total'

export type MoneyFigureProps = {
  /** Integer euro cents. */
  cents: number
  /** headline: a bid price · struck: a superseded figure · adder: +€… · total: an evaluated price. */
  variant: MoneyVariant
}

/** The design system's easing, `--ease: cubic-bezier(0.22, 1, 0.36, 1)`, as motion's bezier array. */
const EASE = [0.22, 1, 0.36, 1] as const

/** One euro in cents. */
const EURO = 100

/**
 * A euro figure, formatted only through money.ts. When `cents` changes, the shown value
 * counts to it over `--duration-settle`: a whole euro at a time when both ends are whole
 * euros (so no cents flash past), otherwise a cent at a time; under reduced motion it jumps.
 * The first render shows the value as is.
 */
export function MoneyFigure({ cents, variant }: MoneyFigureProps) {
  const [shown, setShown] = useState(cents)
  const shownRef = useRef(cents)
  // Read per render: with no settle time the figure is simply `cents`.
  const instant = settleMs() <= 0

  useEffect(() => {
    const from = shownRef.current
    if (from === cents) return
    const ms = settleMs()
    if (ms <= 0) {
      shownRef.current = cents
      return
    }
    const step = from % EURO === 0 && cents % EURO === 0 ? EURO : 1
    // A replaced count can still deliver a frame (motion may resolve or tick it after the
    // cleanup, e.g. while a slider is dragged); only the newest count may write the figure.
    let live = true
    const controls = animate(from, cents, {
      duration: ms / 1000,
      ease: [...EASE],
      onUpdate: (latest: number) => {
        if (!live) return
        const next = Math.round(latest / step) * step
        shownRef.current = next
        setShown(next)
      },
    })
    return () => {
      live = false
      controls.stop()
    }
  }, [cents])

  const value = instant ? cents : shown
  const text = variant === 'adder' ? formatAdder(value) : formatEur(value)
  // A €0 adder costs nothing, so it stays ink.
  const nothing = variant === 'adder' && cents <= 0 ? styles.nothing : ''
  const className = `${styles.figure} ${styles[variant]} ${nothing}`.trim()
  return variant === 'struck' ? (
    <s className={className}>{text}</s>
  ) : (
    <span className={className}>{text}</span>
  )
}
