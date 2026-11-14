/**
 * The app's QueryClient and its retry policy. Kept apart from queries.ts so the entry chunk
 * that creates the client does not pull in zod and the schemas.
 */
import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './client'

/**
 * Queries retry only what may pass on a second try (no response, or a server error), at
 * most twice; a 404, 401, 409 or 422 settles at once.
 */
export function retryQuery(failureCount: number, error: unknown): boolean {
  return error instanceof ApiError && (error.kind === 'network' || error.kind === 'server')
    ? failureCount < 2
    : false
}

/**
 * Queries use retryQuery; mutations never retry. `retryDelay` is for tests only (0: no wait
 * between retries); production keeps TanStack's backoff.
 */
export function createQueryClient(options: { retryDelay?: number } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: retryQuery,
        ...(options.retryDelay === undefined ? {} : { retryDelay: options.retryDelay }),
      },
      mutations: { retry: false },
    },
  })
}
