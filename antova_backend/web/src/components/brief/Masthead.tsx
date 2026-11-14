import type { Brief } from '../../api/schemas'
import { copy } from '../../content/copy'
import type { VendorLevel } from '../../domain/leveling'
import { statusTag } from '../../domain/status'
import { formatDate } from '../../lib/formatDate'
import styles from './Masthead.module.css'

export type MastheadProps = {
  brief: Brief
  levels: readonly VendorLevel[]
}

/** "MR-33kV-GIS-Rev4.pdf" → "MR-33kV-GIS-Rev4"; the tender's own MR line when no spec file is listed. */
function specReference(brief: Brief): string {
  const spec = brief.documents.find((d) => d.role === 'mr_spec')
  return spec ? spec.filename.replace(/\.pdf$/i, '') : brief.tender.mr_doc
}

/**
 * The brief's head (spec §7.3): kicker, title, client, then spec reference · pages read ·
 * checks · gaps · verified date. A synthetic sample, or one extracted with the test answer
 * key, says so here, so it can never pass as a real run.
 */
export function Masthead({ brief, levels }: MastheadProps) {
  const { tender } = brief
  const cells = levels.flatMap((l) => l.cells)
  const gaps = cells.filter(
    (c) => statusTag(c.status, c.pricingStatus, c.overridden).severity !== 'ok',
  ).length
  const verified = brief.verified_at ? formatDate(brief.verified_at) : null
  const meta = [
    specReference(brief),
    copy.brief.meta.pagesRead(tender.pages_parsed),
    copy.brief.meta.checks(cells.length),
    copy.brief.meta.gaps(gaps),
    ...(verified ? [copy.brief.meta.verified(verified)] : []),
  ]

  const testExtraction = brief.ingest_mode === 'answer_key'
  let label: string | null = null
  if (brief.synthetic) {
    label = testExtraction
      ? `${copy.landing.sampleLabel} · ${copy.brief.testExtraction}`
      : copy.landing.sampleLabel
  } else if (testExtraction) {
    label = copy.brief.testExtractionAlone
  }

  return (
    <div className={styles.masthead}>
      <p className={styles.kicker}>
        {brief.status === 'VERIFIED'
          ? copy.brief.kicker(tender.id)
          : copy.brief.draftKicker(tender.id)}
      </p>
      <h1 className={styles.title}>{tender.title}</h1>
      <p className={styles.client}>{tender.client}</p>
      <p className={styles.meta}>{meta.join(' · ')}</p>
      {label ? <p className={styles.label}>{label}</p> : null}
    </div>
  )
}
