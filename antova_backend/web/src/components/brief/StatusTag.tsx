import type { ComplianceStatus, PricingStatus } from '../../api/schemas'
import { statusTag } from '../../domain/status'
import styles from './StatusTag.module.css'

export type StatusTagProps = {
  status: ComplianceStatus
  pricingStatus: PricingStatus
  overridden: boolean
}

/** Glyph + word (spec §8.2). The glyph is decoration; the word is what is announced. */
export function StatusTag({ status, pricingStatus, overridden }: StatusTagProps) {
  const tag = statusTag(status, pricingStatus, overridden)
  return (
    <span className={`${styles.tag} ${styles[tag.severity]}`}>
      <span className={styles.glyph} aria-hidden="true">
        {tag.glyph}
      </span>
      <span>{tag.word}</span>
    </span>
  )
}
