import { useMemo, useState } from 'react'
import { DEFAULT_RATES } from '../api/client'
import type { Brief } from '../api/schemas'
import { Faq } from '../components/landing/Faq'
import { Footer } from '../components/landing/Footer'
import { Hero } from '../components/landing/Hero'
import { HowItWorks } from '../components/landing/HowItWorks'
import { Nav } from '../components/landing/Nav'
import { Offer } from '../components/landing/Offer'
import { Receipt } from '../components/landing/Receipt'
import { SAMPLE, briefHref } from '../components/landing/sample'
import { AuditModal } from '../components/modal/AuditModal'
import { copy } from '../content/copy'
import { levelTender } from '../domain/leveling'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useOnScreen } from '../lib/useOnScreen'
import styles from './Landing.module.css'

export type LandingProps = {
  /** The sample brief to show; the committed snapshot unless a test passes another. */
  sample?: Brief
}

const HOW_IT_WORKS_ID = 'how-it-works'
const OFFER_ID = 'offer'
/** The floating bar's gap, height and gap again (`--nav-height-total`): what it covers. */
const NAV_COVER_PX = 72

/** VITE_CONTACT_EMAIL, or null when unset or blank: never a made-up address. */
function contactEmail(): string | null {
  const email = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim()
  return email ? email : null
}

/**
 * The landing page at / for SpecClaw. It renders from the committed sample snapshot,
 * displaying automated bid compliance, clause-level cross-document verification,
 * and verified gap pricing without rate sensitivity sliders.
 */
export default function Landing({ sample = SAMPLE }: LandingProps) {
  const [watching, setWatching] = useState(false)
  // Once the hero's buttons are gone (scrolled under the bar), the nav's recheck fills.
  const [heroActionsRef, heroActionsOnScreen] = useOnScreen<HTMLDivElement>(NAV_COVER_PX)
  useDocumentTitle(copy.landing.title)

  const { tender, overrides } = sample
  const levels = useMemo(() => levelTender(tender, DEFAULT_RATES, overrides), [tender, overrides])
  const href = briefHref(sample)

  return (
    <>
      <Nav
        briefHref={href}
        howItWorksId={HOW_IT_WORKS_ID}
        offerId={OFFER_ID}
        prominent={!heroActionsOnScreen}
      />
      <div className={styles.page}>
        <Hero
          levels={levels}
          testExtraction={sample.ingest_mode === 'answer_key'}
          briefHref={href}
          offerId={OFFER_ID}
          onWatch={() => setWatching(true)}
          actionsRef={heroActionsRef}
        />
        <Receipt brief={sample} levels={levels} briefHref={href} />
        <HowItWorks
          id={HOW_IT_WORKS_ID}
          brief={sample}
          rates={DEFAULT_RATES}
          onWatch={() => setWatching(true)}
        />
        <Offer id={OFFER_ID} email={contactEmail()} />
        <Faq />
        <Footer tenderId={tender.id} />
      </div>
      <AuditModal
        open={watching}
        onClose={() => setWatching(false)}
        source={{ kind: 'replay', brief: sample, briefHref: href }}
      />
    </>
  )
}
