import { copy } from '../../content/copy'
import styles from './Footer.module.css'

export type FooterProps = {
  tenderId: string
}

/**
 * The foot of the landing page (spec §7.1): the sample disclaimer. A plain block inside main,
 * not a second footer landmark; the shell's footer follows it with the Impressum and Privacy
 * links, which every page carries (ruling R23).
 */
export function Footer({ tenderId }: FooterProps) {
  return (
    <div className={styles.footer}>
      <p className={styles.disclaimer}>{copy.landing.disclaimer(tenderId)}</p>
    </div>
  )
}
