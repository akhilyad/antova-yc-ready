import type { ButtonHTMLAttributes } from 'react'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'link'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary: ink fill · secondary: outline · link: text only. Default primary. */
  variant?: ButtonVariant
  /** Disables the button and marks it busy while an action is in flight. */
  loading?: boolean
}

/** The button look, for a link that acts as a button (e.g. the audit modal's *Open the brief*). */
export function buttonClassName(variant: ButtonVariant = 'primary', className?: string): string {
  return [styles.button, styles[variant], className].filter(Boolean).join(' ')
}

/** A native button; `type` defaults to "button" so it never submits a form by accident. */
export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || rest['aria-busy'] || undefined}
      className={buttonClassName(variant, className)}
    />
  )
}
