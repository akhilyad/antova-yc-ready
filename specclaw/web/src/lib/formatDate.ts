import { copy } from '../content/copy'

/**
 * An ISO timestamp as a written-out UTC date: "2026-11-05T00:00:00+00:00" → "5 November 2026".
 * Built by hand so it never depends on the runtime's locale data; null for an unreadable date.
 */
export function formatDate(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getUTCDate()} ${copy.months[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}
