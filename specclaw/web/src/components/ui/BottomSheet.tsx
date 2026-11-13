import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { copy } from '../../content/copy'
import styles from './BottomSheet.module.css'
import { useModalFocus } from './useModalFocus'

export type BottomSheetProps = {
  open: boolean
  onClose: () => void
  /** The id of the sheet's heading, which names it. */
  labelledBy: string
  children: ReactNode
}

/**
 * The sidenote below 960 px: a modal sheet from the bottom edge, with Dialog semantics.
 * It carries its own Close button, since a sheet has no other visible way out on touch.
 */
export function BottomSheet({ open, onClose, labelledBy, children }: BottomSheetProps) {
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
        className={styles.sheet}
        onKeyDown={onKeyDown}
      >
        <div className={styles.bar}>
          <button type="button" className={styles.close} onClick={onClose}>
            {copy.ui.close}
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
