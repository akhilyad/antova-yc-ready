import type { Check } from '../../api/schemas'
import { copy } from '../../content/copy'
import styles from './CheckRow.module.css'

export type CheckRowProps = {
  check: Check
  /** The requirement field's label from the spec (checks_spec); defaults to the field name. */
  label?: string
}

const OPERATORS: Readonly<Record<string, string>> = {
  ge: '≥',
  gt: '>',
  le: '≤',
  lt: '<',
  ne: '≠',
}

/** "≥ 50 kA"; an equality check shows the required value alone. */
export function requiredText(check: Check): string {
  const symbol = Object.hasOwn(OPERATORS, check.operator) ? OPERATORS[check.operator] : undefined
  return symbol ? `${symbol} ${check.required}` : check.required
}

/**
 * One row of a sidenote's checks table: result, field, required, offered, and the value the
 * code compared ("Read as": 104 °F is read as 40 °C). Render inside a <tbody>.
 */
export function CheckRow({ check, label }: CheckRowProps) {
  const word = check.passed ? copy.brief.checks.passed : copy.brief.checks.failed
  return (
    <tr className={check.passed ? styles.passed : styles.failed}>
      <td className={styles.result}>
        <span aria-hidden="true">{check.passed ? '✓' : '✗'}</span>
        <span className="visually-hidden">{word}</span>
      </td>
      <th scope="row" className={styles.field}>
        {label ?? check.field}
      </th>
      <td>{requiredText(check)}</td>
      <td className={styles.offered}>{check.offered}</td>
      <td className={styles.canonical}>{check.offered_canonical}</td>
    </tr>
  )
}
