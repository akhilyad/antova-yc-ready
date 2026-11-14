import type { Rates } from '../api/schemas'
import { copy } from '../content/copy'
import { formatEur, toCents } from '../domain/money'

export type RateKey = keyof Rates

/** The three sensitivity sliders, with the backend's RatesBody bounds (antova_briefs_api.py). */
export const RATE_SLIDERS: readonly { key: RateKey; min: number; max: number; step: number }[] = [
  { key: 'copper', min: 0.5, max: 2.5, step: 0.05 },
  { key: 'labour', min: 20, max: 200, step: 5 },
  { key: 'freight', min: 0.5, max: 2.5, step: 0.05 },
]

/** Every rate at its slider's top: the dearest any bid can be made to look. */
export const MAX_RATES = Object.fromEntries(RATE_SLIDERS.map((s) => [s.key, s.max])) as Rates

/** A rate as shown ("×1.20", "€60/h") and as announced ("1.20 times the rate table"). */
export function rateDisplay(key: RateKey, value: number): { text: string; spoken: string } {
  const r = copy.brief.rates
  if (key === 'labour') {
    const eur = formatEur(toCents(value))
    return { text: r.perHour(eur), spoken: r.perHourSpoken(eur) }
  }
  const n = value.toFixed(2)
  return { text: r.multiplier(n), spoken: r.multiplierSpoken(n) }
}

/** A slider's raw value as a rate: multipliers to two decimals (no float drift), labour as is. */
export function parseRate(key: RateKey, raw: string): number | null {
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  return key === 'labour' ? value : Math.round(value * 100) / 100
}
