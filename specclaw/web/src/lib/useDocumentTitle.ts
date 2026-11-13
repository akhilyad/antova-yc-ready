import { useEffect } from 'react'

/** Sets `document.title` while the calling page is mounted (WCAG 2.4.2: one title per route). */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title
  }, [title])
}
