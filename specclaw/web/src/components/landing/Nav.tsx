import { Link } from 'react-router'
import { copy } from '../../content/copy'
import { buttonClassName } from '../ui/Button'
import styles from './Nav.module.css'

export type NavProps = {
  /** The sample brief's page. */
  briefHref: string
  /** In-page ids of the How it works and offer sections. */
  howItWorksId: string
  offerId: string
  /**
   * Fill the recheck button (primary) instead of outlining it. The page sets this once the
   * hero's buttons have scrolled away, so each screen shows one primary action.
   */
  prominent?: boolean
}

/**
 * The landing's section links (spec §7.1). They sit in the site header's row, beside the
 * shell's wordmark, and stay there as the page scrolls. They are a plain list, not a second
 * navigation landmark: the shell already provides the site's one `nav`.
 */
export function Nav({ briefHref, howItWorksId, offerId, prominent = false }: NavProps) {
  return (
    <div className={styles.nav}>
      <ul className={styles.links}>
        <li className={styles.optional}>
          <a href={`#${howItWorksId}`} className={styles.link}>
            {copy.landing.nav.howItWorks}
          </a>
        </li>
        <li className={styles.optional}>
          <Link to={briefHref} className={styles.link}>
            {copy.landing.nav.sampleBrief}
          </Link>
        </li>
        <li>
          <a
            href={`#${offerId}`}
            className={buttonClassName(prominent ? 'primary' : 'secondary', styles.cta)}
          >
            {copy.landing.nav.recheck}
          </a>
        </li>
      </ul>
    </div>
  )
}
