import { ApiError } from '../api/client'

/**
 * How a review request failed, for the page to choose what to show: the token gate with its
 * error (401), "not configured" (503: the server has no review token), the tender doesn't
 * exist (404), or a failure a retry may fix.
 */
export type ReviewFailure = 'unauthorized' | 'notConfigured' | 'missing' | 'unreachable'

export function reviewFailure(error: unknown): ReviewFailure | null {
  if (error === null || error === undefined) return null
  if (!(error instanceof ApiError)) return 'unreachable'
  if (error.kind === 'unauthorized') return 'unauthorized'
  if (error.kind === 'server' && error.status === 503) return 'notConfigured'
  if (error.kind === 'not_found') return 'missing'
  return 'unreachable'
}
