import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

/**
 * True between `beforeprint` and `afterprint`. The update is flushed synchronously, so
 * print-only content (the brief's endnotes) is in the document before the browser lays out
 * the printed pages.
 */
export function usePrinting(): boolean {
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true))
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])
  return printing
}
