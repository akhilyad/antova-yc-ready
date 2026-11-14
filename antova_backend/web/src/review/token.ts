/**
 * The founder's review token. It lives only in sessionStorage (gone when the tab closes),
 * never in the URL, a log or localStorage. Storage that refuses access (a locked-down
 * browser) reads as no token.
 */
import { useState } from 'react'

const KEY = 'antova.reviewToken'

export function getToken(): string | null {
  try {
    const token = sessionStorage.getItem(KEY)
    return token === null || token === '' ? null : token
  } catch {
    return null
  }
}

/** Stores the pasted token trimmed: a stray space or newline would make every request fail. */
export function setToken(raw: string): void {
  try {
    sessionStorage.setItem(KEY, raw.trim())
  } catch {
    // Storage refused: the token lasts for this page only.
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // nothing stored
  }
}

/**
 * The token as page state: `signIn` stores a pasted token, `signOut` forgets it. A token the
 * storage refused still works until the page is left.
 */
export function useReviewToken() {
  const [token, setTokenState] = useState<string | null>(getToken)
  const signIn = (raw: string) => {
    setToken(raw)
    setTokenState(raw.trim())
  }
  const signOut = () => {
    clearToken()
    setTokenState(null)
  }
  return { token, signIn, signOut }
}
