import { useId, type CSSProperties } from 'react'
import styles from './SensitivitySlider.module.css'

export type SensitivitySliderProps = {
  /** The visible label and accessible name ("Copper price"); stays put as the value moves. */
  label: string
  /** The value as shown beside the label ("×1.20"). */
  display: string
  /** The value as announced, with its unit ("1.20 times the rate table"). */
  valueText: string
  value: number
  min: number
  max: number
  step: number
  /** The raw input value, as the range input reports it. */
  onChange: (raw: string) => void
}

/**
 * One sensitivity slider (spec §8.2): a native range input, so arrow, page, home and end keys
 * come free, with its value shown beside the label and announced through `aria-valuetext`.
 * The shown value is hidden from screen readers, which hear the value text instead.
 */
export function SensitivitySlider({
  label,
  display,
  valueText,
  value,
  min,
  max,
  step,
  onChange,
}: SensitivitySliderProps) {
  const id = useId()
  return (
    <div className={styles.slider}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <span className={styles.value} aria-hidden="true">
        {display}
      </span>
      <input
        id={id}
        type="range"
        className={styles.range}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
