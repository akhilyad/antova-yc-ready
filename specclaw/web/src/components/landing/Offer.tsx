import { useId } from 'react'
import { copy } from '../../content/copy'
import { buttonClassName } from '../ui/Button'
import { mailtoHref } from './mailto'
import styles from './Offer.module.css'

export type OfferProps = {
  /** The section's id, the target of the nav's "Re-check a tender" link. */
  id: string
  /** VITE_CONTACT_EMAIL; null when unset, which leaves out the button and the address. */
  email: string | null
}

/** The offer (spec §7.1): what to send and what comes back, with an email link. */
export function Offer({ id, email }: OfferProps) {
  const headingId = useId()
  const toSendId = useId()
  const comesBackId = useId()

  return (
    <section id={id} aria-labelledby={headingId} className={styles.section}>
      <div className={styles.layout}>
        <div className={styles.pitch}>
          <h2 id={headingId} className={styles.heading}>
            {copy.landing.offer.heading}
          </h2>
          <p className={styles.body}>{copy.landing.offer.body}</p>
          {email !== null ? (
            <div className={styles.contact}>
              <a href={mailtoHref(email)} className={buttonClassName('primary')}>
                {copy.landing.offer.button}
              </a>
              <p className={styles.address}>{copy.landing.offer.orWriteTo(email)}</p>
            </div>
          ) : null}
        </div>

        <div className={styles.details}>
          <div className={styles.panel}>
            <div className={styles.column}>
              <h3 id={toSendId} className={styles.subheading}>
                {copy.landing.offer.whatToSendHeading}
              </h3>
              <ul aria-labelledby={toSendId} className={styles.list}>
                {copy.landing.offer.whatToSend.map((item) => (
                  <li key={item} className={styles.item}>
                    <span className={styles.bullet} aria-hidden="true">
                      ·
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.column}>
              <h3 id={comesBackId} className={styles.subheading}>
                {copy.landing.offer.whatComesBackHeading}
              </h3>
              <ul aria-labelledby={comesBackId} className={styles.list}>
                {copy.landing.offer.whatComesBack.map((item) => (
                  <li key={item} className={styles.item}>
                    <span className={styles.check} aria-hidden="true">
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
