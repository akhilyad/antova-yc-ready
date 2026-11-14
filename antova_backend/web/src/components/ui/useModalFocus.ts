import { useEffect, useRef, type KeyboardEvent } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
}

/**
 * Modal focus for Dialog and BottomSheet (spec §11): on open, remember the opener and focus
 * the first control (or the container); Tab and Shift+Tab wrap inside; focus that escapes is
 * pulled back; Escape calls `onClose`; on close or unmount, focus returns to the opener.
 * While open, the page behind does not scroll; each close restores what it found, so a
 * dialog over a dialog unlocks in order. Spread `ref` and `onKeyDown` onto the element with
 * role="dialog".
 */
export function useModalFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!open || root === null) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = () => focusables(root)[0] ?? root
    first().focus()

    const page = document.documentElement
    const overflow = page.style.overflow
    page.style.overflow = 'hidden'

    const pullBack = (event: FocusEvent) => {
      if (event.target instanceof Node && !root.contains(event.target)) first().focus()
    }
    document.addEventListener('focusin', pullBack)
    return () => {
      document.removeEventListener('focusin', pullBack)
      page.style.overflow = overflow
      if (opener?.isConnected) opener.focus()
    }
  }, [open])

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    const root = ref.current
    if (event.key !== 'Tab' || root === null) return
    const items = focusables(root)
    const head = items[0]
    const tail = items[items.length - 1]
    if (head === undefined || tail === undefined) {
      event.preventDefault()
      return
    }
    const active = document.activeElement
    if (event.shiftKey && (active === head || active === root)) {
      event.preventDefault()
      tail.focus()
    } else if (!event.shiftKey && active === tail) {
      event.preventDefault()
      head.focus()
    }
  }

  return { ref, onKeyDown }
}
