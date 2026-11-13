import { Brief } from '../../api/schemas'
import sampleJson from '../../generated/sample-brief.json'

/**
 * The committed sample snapshot the landing page renders from, so its first paint needs no
 * network (spec §7.1). `npm run snapshot:sample` refreshes the file from the verified sample.
 */
export const SAMPLE: Brief = Brief.parse(sampleJson)

/** The sample's public brief page. */
export function briefHref(brief: Brief): string {
  return `/b/${brief.share_id}`
}
