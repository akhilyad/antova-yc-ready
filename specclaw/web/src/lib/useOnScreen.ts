import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Whether an element is in the viewport below the floating nav bar, kept current as the page
 * scrolls. It reads as on screen until an observer says otherwise, so the server render, the
 * first client render and browsers without IntersectionObserver all agree.
 *
 * `topInsetPx` shrinks the viewport from the top: an element hidden under the bar counts as
 * off screen.
 */
export function useOnScreen<T extends Element>(topInsetPx = 0): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [onScreen, setOnScreen] = useState(true)

  useEffect(() => {
    const element = ref.current
    if (element === null || typeof window.IntersectionObserver !== 'function') return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (entry) setOnScreen(entry.isIntersecting)
      },
      { rootMargin: `-${topInsetPx}px 0px 0px 0px` },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [topInsetPx])

  return [ref, onScreen]
}
