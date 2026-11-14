import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './Dialog.module.css'
import { useModalFocus } from './useModalFocus'

export type DialogProps = {
  open: boolean
  onClose: () => void
  /** The id of the dialog's heading, which names it. */
  labelledBy: string
  /** "wide" for the audit modal's two columns; confirmations use the default. */
  size?: 'default' | 'wide'
  children: ReactNode
}

/**
 * A centred modal (confirmations, the audit modal). Focus is trapped while open, Escape and a
 * click on the backdrop close it, and focus returns to whatever opened it.
 */
export function Dialog({ open, onClose, labelledBy, size = 'default', children }: DialogProps) {
  const { ref, onKeyDown } = useModalFocus(open, onClose)
  if (!open) return null
  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={size === 'wide' ? `${styles.dialog} ${styles.wide}` : styles.dialog}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
