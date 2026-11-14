import { useId, type Ref } from 'react'
import { Link } from 'react-router'
import { copy } from '../../content/copy'
import type { VendorLevel } from '../../domain/leveling'
import { RankingFlip } from '../charts/RankingFlip'
import { buttonClassName } from '../ui/Button'
import { PulseStripeHero } from '../ui/pulse-stripe-hero'
import styles from './Hero.module.css'

export type HeroProps = {
  levels: readonly VendorLevel[]
  /** The sample's quotes came from the test answer key, not a model run. */
  testExtraction: boolean
  briefHref: string
  /** In-page id of the offer section, the target of the second button. */
  offerId: string
  onWatch: () => void
  /** The row of hero buttons, watched by the page to know when they leave the screen. */
  actionsRef?: Ref<HTMLDivElement>
}

/** Key vendor bidders and project documents shown in the drifting marquee band. */
const HERO_LOGOS = [
  'VoltSwitch Industrial',
  'Nordwerk Power',
  'Deltaport AG',
  'Equipment Purchase List',
  'Contract Agreement',
  'Pricing & Extra Fees',
  'Delivery & Service Terms',
] as const

/**
 * Hero section aligning with an automated bid checker for non-technical buyers.
 * Powered by PulseStripeHero: animated subtle light beams,
 * drifting document/vendor marquee band, and scroll statement reveal.
 * Features primary CTA to see sample check, secondary CTA to get early access,
 * and high-signal trust badges.
 */
export function Hero({
  levels,
  testExtraction,
  briefHref,
  offerId,
  onWatch,
  actionsRef,
}: HeroProps) {
  const headingId = useId()
  const label = testExtraction
    ? `${copy.landing.sampleLabel} · ${copy.brief.testExtraction}`
    : copy.landing.sampleLabel

  return (
    <section aria-labelledby={headingId} className={styles.heroSection}>
      <PulseStripeHero
        palette="antova_backend"
        logos={HERO_LOGOS}
        statement="Most teams check page one and hope. Antova reads every page, finds what vendors left out, and shows the true cost before you sign."
        statementLabel="Why Antova"
      >
        <div className={styles.heroGrid}>
          <div className={styles.text}>
            <div className={styles.title}>
              <div className={styles.eyebrowContainer}>
                <p className={styles.eyebrow}>
                  <span className={styles.eyebrowDot} aria-hidden="true" />
                  <span>{copy.landing.eyebrow}</span>
                </p>
              </div>
              <h1 id={headingId} className={styles.heading}>
                {copy.landing.h1}
              </h1>
            </div>
            <p className={styles.lede}>{copy.landing.lede}</p>
            <div className={styles.cta}>
              <div ref={actionsRef} className={styles.actions}>
                <Link to={briefHref} className={buttonClassName('primary')}>
                  {copy.landing.primaryCta}
                </Link>
                <a href={`#${offerId}`} className={buttonClassName('secondary')}>
                  {copy.landing.secondaryCta}
                </a>
              </div>
              <p className={styles.terms}>{copy.landing.recheckTerms}</p>
              <div className={styles.trustBadges} aria-label="Key guarantees">
                <span className={styles.trustBadge}>
                  <span className={styles.trustCheck} aria-hidden="true">
                    ✓
                  </span>{' '}
                  Done in Minutes
                </span>
                <span className={styles.trustDot} aria-hidden="true">
                  ·
                </span>
                <span className={styles.trustBadge}>
                  <span className={styles.trustCheck} aria-hidden="true">
                    ✓
                  </span>{' '}
                  Direct Link to Every Page
                </span>
                <span className={styles.trustDot} aria-hidden="true">
                  ·
                </span>
                <span className={styles.trustBadge}>
                  <span className={styles.trustCheck} aria-hidden="true">
                    ✓
                  </span>{' '}
                  Your Data Stays Private
                </span>
              </div>
            </div>
          </div>
          <div className={styles.proof}>
            <div className={styles.proofHeader} aria-hidden="true">
              <div className={styles.proofStatus}>
                <span className={styles.livePulse} />
                <span className={styles.proofTag}>LIVE DEMO</span>
              </div>
              <span className={styles.proofId}>3 BIDS CHECKED</span>
            </div>
            <p className={styles.label}>{label}</p>
            <RankingFlip levels={levels} play />
            <div className={styles.proofFooter}>
              <button
                type="button"
                onClick={onWatch}
                className={styles.sampleLink}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                aria-label={copy.landing.watchButton}
              >
                <span>{copy.landing.watchButton}</span>
                <span className={styles.sampleArrow} aria-hidden="true">
                  ▶
                </span>
              </button>
              <span className={styles.verifiedStamp} aria-hidden="true">
                REAL TOTAL COST
              </span>
            </div>
          </div>
        </div>
      </PulseStripeHero>
    </section>
  )
}
