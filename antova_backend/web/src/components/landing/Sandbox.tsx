import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { DEFAULT_RATES } from '../../api/client'
import type { Brief, Rates } from '../../api/schemas'
import { copy } from '../../content/copy'
import { levelTender } from '../../domain/leveling'
import { formatEur } from '../../domain/money'
import { pricedLevels } from '../../domain/ranking'
import { MAX_RATES } from '../../lib/rates'
import { SensitivityBars } from '../charts/SensitivityBars'
import { SensitivitySliders } from '../ui/SensitivitySliders'
import styles from './Sandbox.module.css'

export type SandboxProps = {
  brief: Brief
}

/** How long the rates must stay still before the new order is announced. */
const ANNOUNCE_AFTER_MS = 500

/**
 * The sensitivity sandbox (spec §7.1): move copper, labour and freight and watch the bidders
 * re-sort. Everything is priced here, by the brief's own leveling engine on the sample
 * snapshot, so nothing waits on the network. Once the rates settle, the new order and prices
 * are announced in a polite live region (mounted empty, written only after a change).
 */
export function Sandbox({ brief }: SandboxProps) {
  const headingId = useId()
  const announceRef = useRef<HTMLParagraphElement>(null)
  // null until the reader moves a slider.
  const [rates, setRates] = useState<Rates | null>(null)
  const current = rates ?? DEFAULT_RATES

  const { tender, overrides } = brief
  const levels = useMemo(
    () => levelTender(tender, current, overrides),
    [tender, current, overrides],
  )
  // The dearest any bid can get on these sliders: a full-width bar, fixed while they move.
  const scaleCents = useMemo(
    () =>
      Math.max(
        1,
        ...pricedLevels(levelTender(tender, MAX_RATES, overrides)).map((l) => l.evaluatedCents),
      ),
    [tender, overrides],
  )

  const announcement = [...pricedLevels(levels)]
    .sort((a, b) => a.evaluatedCents - b.evaluatedCents)
    .map((l) => copy.brief.rates.announce({ name: l.name, price: formatEur(l.evaluatedCents) }))
    .join('. ')
  const moved = rates !== null

  useEffect(() => {
    if (!moved) return
    const timer = setTimeout(() => {
      if (announceRef.current) announceRef.current.textContent = announcement
    }, ANNOUNCE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [announcement, moved])

  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <div className={styles.intro}>
        <h2 id={headingId} className={styles.heading}>
          {copy.landing.sandbox.heading}
        </h2>
        <p className={styles.note}>{copy.landing.sandbox.note}</p>
      </div>
      <div className={styles.layout}>
        <div className={styles.controls}>
          <SensitivitySliders rates={current} onChange={setRates} layout="stack" />
        </div>
        <SensitivityBars levels={levels} scaleCents={scaleCents} />
      </div>
      <p ref={announceRef} role="status" className="visually-hidden" />
    </section>
  )
}
