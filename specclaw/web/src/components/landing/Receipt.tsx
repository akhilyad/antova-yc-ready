import { useId } from 'react'
import { Link } from 'react-router'
import type { Brief } from '../../api/schemas'
import { copy } from '../../content/copy'
import type { VendorLevel } from '../../domain/leveling'
import styles from './Receipt.module.css'

export type ReceiptProps = {
  brief?: Brief
  levels?: readonly VendorLevel[]
  briefHref: string
}

/**
 * Section B: Side-by-Side Example (The Visual Proof)
 * Shows how a buyer gets tricked by low upfront bids with hidden back-page notes.
 */
export function Receipt({ briefHref }: ReceiptProps) {
  const headingId = useId()
  const s = copy.landing.sideBySide

  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <div className={styles.intro}>
        <div className={styles.sectionBadge} aria-hidden="true">
          <span>● {s.tag}</span>
        </div>
        <h2 id={headingId} className={styles.heading}>
          {s.heading}
        </h2>
        <p className={styles.lead}>{s.subheading}</p>
      </div>

      <div className={styles.sideBySideContainer}>
        <div className={styles.boxesRow}>
          {/* Box 1 (What the vendor promised) */}
          <div className={`${styles.boxCard} ${styles.boxPromised}`}>
            <div className={styles.boxHeader}>
              <span className={styles.boxLabel}>{s.box1.label}</span>
              <span className={styles.boxTagPromised}>
                <span className={styles.boxCheck} aria-hidden="true">
                  ✓
                </span>
                <span>{s.box1.note}</span>
              </span>
            </div>
            <div className={styles.boxBody}>
              <div className={styles.priceRow}>
                <span className={styles.pricePromised}>{s.box1.price}</span>
                <span className={styles.apparentBadge}>(Apparent Lowest Bid)</span>
              </div>
              <blockquote className={styles.boxQuote}>&ldquo;{s.box1.text}&rdquo;</blockquote>
              <p className={styles.boxExplanation}>
                The quote on page one looks like a winner. It seems like the lowest price in the
                room.
              </p>
            </div>
          </div>

          {/* Box 2 (What they hid in the back) */}
          <div className={`${styles.boxCard} ${styles.boxHidden}`}>
            <div className={styles.boxHeader}>
              <span className={styles.boxLabel}>{s.box2.label}</span>
              <span className={styles.boxTagHidden}>
                <span className={styles.boxAlert} aria-hidden="true">
                  !
                </span>
                <span>{s.box2.note}</span>
              </span>
            </div>
            <div className={styles.boxBody}>
              <div className={styles.priceRow}>
                <span className={styles.priceHidden}>{s.box2.addedCost}</span>
              </div>
              <blockquote className={styles.boxQuote}>&ldquo;{s.box2.text}&rdquo;</blockquote>
              <p className={styles.boxExplanation}>
                Deep in page 48, setup, testing, and basic warranty are quietly left out of the
                deal.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Result Bar */}
        <div className={styles.resultBar}>
          <div className={styles.resultLeft}>
            <span className={styles.resultCost}>{s.resultBar.label}</span>
            <span className={styles.resultTag}>{s.resultBar.tag}</span>
          </div>
          <div className={styles.resultRight}>
            <p className={styles.resultTakeaway}>&ldquo;{s.resultBar.takeaway}&rdquo;</p>
          </div>
        </div>

        <div className={styles.proofActions}>
          <Link to={briefHref} className={styles.sampleProofLink}>
            <span>See full sample check with direct page proof</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
