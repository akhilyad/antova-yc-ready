import type { Citation } from '../../api/schemas'
import { copy } from '../../content/copy'
import styles from './Quote.module.css'

export type QuoteVariant = 'requirement' | 'governing' | 'superseded'

export type QuoteProps = {
  /** requirement: the buyer's spec · governing: the bid text that counts · superseded: struck. */
  variant: QuoteVariant
  citation: Citation
}

/**
 * A quote exactly as it stands on its page, with its section and page. A superseded quote is
 * struck through, and screen readers hear "Contradicted:" first, since a strike is silent.
 */
export function Quote({ variant, citation }: QuoteProps) {
  const source = copy.brief.citation({
    section: copy.brief.sectionName(citation.section),
    page: citation.page,
  })
  return (
    <figure className={[styles.quote, styles[variant]].filter(Boolean).join(' ')}>
      <blockquote className={styles.text}>
        {variant === 'superseded' ? (
          <s>
            <span className="visually-hidden">{copy.brief.contradicted} </span>
            {citation.quote}
          </s>
        ) : (
          citation.quote
        )}
      </blockquote>
      <figcaption className={styles.source}>{source}</figcaption>
    </figure>
  )
}
