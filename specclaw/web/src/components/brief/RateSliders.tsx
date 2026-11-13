import { useEffect, useId, useState } from 'react'
import { DEFAULT_RATES, type Scope } from '../../api/client'
import { useEvaluate } from '../../api/queries'
import type { EvaluateResponse, Rates, VendorFinancials } from '../../api/schemas'
import { copy } from '../../content/copy'
import { formatEur, toCents } from '../../domain/money'
import { SensitivitySliders } from '../ui/SensitivitySliders'
import styles from './RateSliders.module.css'

/** A settled re-price: the financials the evaluate endpoint returned, and the rates asked for. */
export type Priced = { rates: Rates; financials: VendorFinancials[] }

export type RateSlidersProps = {
  scope: Scope
  /** Called with each newest settled re-price; never with a stale or failed one. */
  onPriced: (priced: Priced) => void
}

const DEBOUNCE_MS = 150

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

function announcement(response: EvaluateResponse): string {
  // A vendor with no headline price has no evaluated price to announce.
  return response.financials
    .flatMap((f) =>
      f.true_evaluated_price === null
        ? []
        : [
            copy.brief.rates.announce({
              name: f.name,
              price: formatEur(toCents(f.true_evaluated_price)),
            }),
          ],
    )
    .join('. ')
}

/**
 * Adjust the rates (spec §7.3): three native range inputs. Each change re-prices through the
 * evaluate endpoint, debounced 150 ms. Only the response for the newest rates counts (an
 * older one that lands late is ignored); until it lands, and if it fails, the last good
 * prices stay. Settled totals are announced in a polite live region.
 */
export function RateSliders({ scope, onPriced }: RateSlidersProps) {
  const headingId = useId()
  // null until the reader moves a slider: the brief's own financials are already priced.
  const [rates, setRates] = useState<Rates | null>(null)
  const requested = useDebounced(rates, DEBOUNCE_MS)
  const query = useEvaluate(scope, requested ?? DEFAULT_RATES, { enabled: requested !== null })

  // The query observes only the newest rates, so its own (non-placeholder) data is never stale.
  const fresh =
    requested !== null && query.isSuccess && !query.isPlaceholderData ? query.data : undefined
  const [settled, setSettled] = useState<{ data: EvaluateResponse; rates: Rates } | null>(null)
  if (fresh !== undefined && requested !== null && fresh !== settled?.data) {
    setSettled({ data: fresh, rates: requested })
  }

  useEffect(() => {
    if (settled !== null) onPriced({ rates: settled.rates, financials: settled.data.financials })
  }, [settled, onPriced])

  const current = rates ?? DEFAULT_RATES
  const failed = requested !== null && query.isError

  return (
    <section aria-labelledby={headingId} className={styles.rates} data-print="hide">
      <h2 id={headingId} className={styles.heading}>
        {copy.brief.rates.heading}
      </h2>
      <p className={styles.intro}>{copy.brief.rates.intro}</p>
      <SensitivitySliders
        rates={current}
        onChange={setRates}
        footer={
          failed ? (
            <p role="alert" className={styles.failed}>
              {copy.errors.repriceFailed}
            </p>
          ) : null
        }
      />
      <p role="status" className="visually-hidden">
        {settled ? announcement(settled.data) : null}
      </p>
    </section>
  )
}
