import { copy } from '../../content/copy'
import type { Verdict } from '../../domain/verdict'
import styles from './VerdictSentence.module.css'

export type VerdictSentenceProps = { verdict: Verdict }

/**
 * The verdict in one sentence, then the caveat when open items exist. An empty sentence
 * (`no_prices`) is left out; each bid without a price gets its own line instead (ruling R18).
 */
export function VerdictSentence({ verdict }: VerdictSentenceProps) {
  return (
    <div className={styles.verdict}>
      {verdict.sentence !== '' ? <p className={styles.sentence}>{verdict.sentence}</p> : null}
      {verdict.missingPrice.map((name) => (
        <p key={name} className={styles.missing}>
          {copy.verdict.missingPrice(name)}
        </p>
      ))}
      {verdict.caveat ? <p className={styles.caveat}>{verdict.caveat}</p> : null}
    </div>
  )
}
