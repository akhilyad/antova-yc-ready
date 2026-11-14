import type { ReactNode } from 'react'
import { DEFAULT_RATES } from '../../api/client'
import type { Rates } from '../../api/schemas'
import { copy } from '../../content/copy'
import { RATE_SLIDERS, parseRate, rateDisplay, type RateKey } from '../../lib/rates'
import { Button } from './Button'
import { SensitivitySlider } from './SensitivitySlider'
import styles from './SensitivitySliders.module.css'

export type SensitivitySlidersProps = {
  /** The rates the sliders show (controlled). */
  rates: Rates
  /** Called with the whole new rate set after a slider moves, or with DEFAULT_RATES on reset. */
  onChange: (rates: Rates) => void
  /** Called after *Reset rates* has passed DEFAULT_RATES to `onChange`. */
  onReset?: () => void
  /** grid: sliders side by side where they fit (the brief) · stack: one under another. */
  layout?: 'grid' | 'stack'
  /** Shown beside the reset button (e.g. a re-price error). */
  footer?: ReactNode
}

/**
 * The copper, labour and freight sliders with *Reset rates* (spec §8.2): the one place that
 * owns the slider bounds, how a raw value becomes a rate, and what reset restores. The brief's
 * rate panel and the landing sandbox both use it.
 */
export function SensitivitySliders({
  rates,
  onChange,
  onReset,
  layout = 'grid',
  footer = null,
}: SensitivitySlidersProps) {
  const change = (key: RateKey, raw: string) => {
    const next = parseRate(key, raw)
    if (next !== null) onChange({ ...rates, [key]: next })
  }
  const reset = () => {
    onChange(DEFAULT_RATES)
    onReset?.()
  }

  return (
    <div className={styles.group}>
      <div className={layout === 'grid' ? styles.grid : styles.stack}>
        {RATE_SLIDERS.map(({ key, min, max, step }) => {
          const { text, spoken } = rateDisplay(key, rates[key])
          return (
            <SensitivitySlider
              key={key}
              label={copy.brief.rates[key]}
              display={text}
              valueText={spoken}
              value={rates[key]}
              min={min}
              max={max}
              step={step}
              onChange={(raw) => change(key, raw)}
            />
          )
        })}
      </div>
      <div className={styles.footer}>
        <Button variant="secondary" onClick={reset}>
          {copy.brief.rates.reset}
        </Button>
        {footer}
      </div>
    </div>
  )
}
