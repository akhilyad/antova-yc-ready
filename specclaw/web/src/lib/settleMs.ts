const SETTLE_FALLBACK_MS = 320

/**
 * `--duration-settle` in ms (0 under reduced motion, via tokens.css), or 0 if the user asks.
 * 0 in the prerender, which has no window: nothing animates there, and a first render shows
 * its value as is either way, so the server HTML matches the browser's.
 */
export function settleMs(): number {
  if (typeof window === 'undefined') return 0
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 0
  const token = getComputedStyle(document.documentElement).getPropertyValue('--duration-settle')
  const ms = Number.parseFloat(token)
  return Number.isFinite(ms) ? ms : SETTLE_FALLBACK_MS
}
