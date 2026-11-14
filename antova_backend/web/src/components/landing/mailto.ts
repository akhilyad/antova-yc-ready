import { copy } from '../../content/copy'

/**
 * The offer's email link: a re-check request whose subject names the equipment and whose body
 * is the checklist of what to send. Encoded with encodeURIComponent (spaces as %20, never "+",
 * which some mail clients leave as a literal plus).
 */
export function mailtoHref(email: string, equipment = 'switchgear'): string {
  const subject = encodeURIComponent(copy.landing.mailto.subject(equipment))
  const body = encodeURIComponent(copy.landing.mailto.body)
  return `mailto:${email}?subject=${subject}&body=${body}`
}
