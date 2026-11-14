import { useCallback, useSyncExternalStore } from 'react'

function supported(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

/**
 * Whether a media query matches, kept current as the viewport changes. Where matchMedia is
 * missing (jsdom, very old browsers) it reads as `fallback`.
 */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!supported()) return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => (supported() ? window.matchMedia(query).matches : fallback),
    () => fallback,
  )
}
