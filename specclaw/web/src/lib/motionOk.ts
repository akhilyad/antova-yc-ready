/**
 * Whether scroll-driven motion may run here: a browser with IntersectionObserver and
 * requestAnimationFrame, and a reader who hasn't asked for reduced motion. Read once, on
 * mount; the server render and old browsers get the static page.
 */
export function motionOk(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.IntersectionObserver !== 'function') return false
  if (typeof window.requestAnimationFrame !== 'function') return false
  if (typeof window.matchMedia !== 'function') return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
