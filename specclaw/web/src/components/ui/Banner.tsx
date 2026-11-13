import type { ReactNode } from 'react'
import styles from './Banner.module.css'

export type BannerVariant = 'draft' | 'verified' | 'replay' | 'error'

export type BannerProps = {
  variant: BannerVariant
  children: ReactNode
  /** Buttons or links on the banner's end (e.g. Copy share link, Try again). */
  actions?: ReactNode
  /** Block content under the message (e.g. a list), which can't sit inside its paragraph. */
  details?: ReactNode
}

/** A full-width notice. Only `error` is coloured and announced (role="alert"). */
export function Banner({ variant, children, actions, details }: BannerProps) {
  const message = <p className={styles.message}>{children}</p>
  return (
    <div
      className={`${styles.banner} ${styles[variant]}`}
      role={variant === 'error' ? 'alert' : undefined}
    >
      {details ? (
        <div className={styles.text}>
          {message}
          {details}
        </div>
      ) : (
        message
      )}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  )
}
