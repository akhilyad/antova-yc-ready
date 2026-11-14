import { useId } from 'react'
import type { Brief, Rates } from '../../api/schemas'
import { copy } from '../../content/copy'
import { Button } from '../ui/Button'
import styles from './HowItWorks.module.css'

export type HowItWorksProps = {
  /** The section's id, the target of the nav's "How it works" link. */
  id: string
  /** The sample brief (optional, kept for component signature compatibility). */
  brief?: Brief
  /** Rates (optional, kept for component signature compatibility). */
  rates?: Rates
  /** Opens the walkthrough / replay modal. */
  onWatch: () => void
}

const STEP_BADGES = ['PDFs · Word · Sheets', 'Done in Minutes', 'Direct Links to Proof']

/**
 * Section C: How It Works (3 Simple Steps)
 * Explains the product in 3 simple, minimal cards with no duplicate lists or complex sub-sections.
 */
export function HowItWorks({ id, onWatch }: HowItWorksProps) {
  const headingId = useId()
  const { heading, steps, line } = copy.landing.howItWorks

  return (
    <section id={id} aria-labelledby={headingId} className={styles.section}>
      <div className={styles.header}>
        <div className={styles.sectionBadge} aria-hidden="true">
          <span>● THREE SIMPLE STEPS</span>
        </div>
        <h2 id={headingId} className={styles.heading}>
          {heading}
        </h2>
        <p className={styles.subheading}>{copy.landing.howItWorks.subheading}</p>
      </div>

      <ol className={styles.cardsGrid}>
        {steps.map((step, i) => (
          <li key={step.title} className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.stepNumber}>0{i + 1}</span>
              <span className={styles.stepBadge}>{STEP_BADGES[i]}</span>
            </div>
            <h3 className={styles.cardTitle}>{step.title}</h3>
            <p className={styles.cardBody}>{step.body}</p>
          </li>
        ))}
      </ol>

      <div className={styles.footerRow}>
        <p className={styles.line}>{line}</p>
        <Button variant="secondary" onClick={onWatch}>
          {copy.landing.watchButton}
        </Button>
      </div>
    </section>
  )
}
