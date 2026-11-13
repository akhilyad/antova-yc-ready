import { useEffect } from 'react'

/**
 * Adds `<meta name="robots" content="noindex">` to the head while the calling page is mounted
 * and removes it on leaving, so briefs and review pages stay out of search results and the
 * landing page stays indexable.
 */
export function useNoIndex(): void {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.append(meta)
    return () => meta.remove()
  }, [])
}
