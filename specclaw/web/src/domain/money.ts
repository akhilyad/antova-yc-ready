/**
 * Money as integer euro cents. `toCents` is the only rounding primitive (the leveling engine
 * builds on it); it goes through decimal.js-light so no float arithmetic touches a rounding.
 * Formatting is built by hand so the output never depends on the runtime's locale data.
 */
import Decimal from 'decimal.js-light'

const MINUS = '−'

/**
 * Euros (a number, or a numeric string as the backend sends Decimals) to integer cents,
 * rounded half-up: ties go away from zero, so `"8.505"` → 851 and `"-8.505"` → -851.
 * Throws RangeError on NaN, ±Infinity, a non-numeric string, or a result outside the
 * safe-integer range.
 */
export function toCents(value: number | string): number {
  let euros: Decimal
  try {
    euros = new Decimal(value)
  } catch {
    throw new RangeError(`Not a finite amount: ${String(value)}`)
  }
  const cents = euros.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).times(100).toNumber()
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Amount out of range: ${String(value)}`)
  }
  return cents
}

function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Expected integer cents, got ${String(cents)}`)
  }
}

/** Groups an unsigned integer's digits in threes with commas: 482800 → "482,800". */
function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Integer cents as euros: whole amounts without decimals (`€482,800`), otherwise two
 * decimals (`€1,600.50`); negatives as `−€…` (U+2212). Throws RangeError on non-integer cents.
 */
export function formatEur(cents: number): string {
  assertCents(cents)
  const abs = Math.abs(cents)
  const euros = Math.floor(abs / 100)
  const rest = abs % 100
  const body = `€${groupThousands(euros)}${rest === 0 ? '' : `.${String(rest).padStart(2, '0')}`}`
  return cents < 0 ? `${MINUS}${body}` : body
}

/** A cost adder: `+€18,500`; zero is `€0`; negatives `−€…`. Throws RangeError on non-integers. */
export function formatAdder(cents: number): string {
  const formatted = formatEur(cents)
  return cents > 0 ? `+${formatted}` : formatted
}

/**
 * Integer cents as the backend's two-place decimal string (an override's `adder_eur`):
 * 1850050 → "18500.50", 7 → "0.07", −250 → "-2.50". Integer arithmetic only. Throws
 * RangeError on non-integer cents.
 */
export function toDecimalString(cents: number): string {
  assertCents(cents)
  const abs = Math.abs(cents)
  const body = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
  return cents < 0 ? `-${body}` : body
}
