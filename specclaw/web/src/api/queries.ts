/**
 * TanStack Query hooks over the API client. The retry policy lives on the QueryClient
 * (createQueryClient in queryClient.ts), not on the hooks.
 */
import {
  keepPreviousData,
  queryOptions,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { z } from 'zod'
import { ApiError, apiRequest, ratesBody, scopePath, type Rates, type Scope } from './client'
import {
  Brief,
  EvaluateResponse,
  Job,
  ReviewTenderSummary,
  StartIngestResponse,
  VerifyResponse,
  WithdrawResponse,
} from './schemas'

const JOB_POLL_MS = 750

const segment = encodeURIComponent
const tenderPath = (tenderId: string) => `/api/review/tenders/${segment(tenderId)}`

/**
 * Review keys start with the token, so a new token never reads a cache (or a 401) left by
 * another. A scope's evaluate key sits under its brief key: invalidating a brief re-prices it.
 */
export const queryKeys = {
  briefs: () => ['brief'] as const,
  brief: (shareId: string) => ['brief', shareId] as const,
  reviewTenders: (token: string) => ['review', token, 'tenders'] as const,
  reviewBrief: (tenderId: string, token: string) => ['review', token, 'tender', tenderId] as const,
  evaluate: (scope: Scope, rates: Rates) =>
    [
      ...(scope.kind === 'public'
        ? queryKeys.brief(scope.shareId)
        : queryKeys.reviewBrief(scope.tenderId, scope.token)),
      'evaluate',
      rates,
    ] as const,
  job: (jobId: string, token: string) => ['review', token, 'job', jobId] as const,
}

/** The public brief for a share link. */
export function useBrief(shareId: string) {
  return useQuery({
    queryKey: queryKeys.brief(shareId),
    queryFn: ({ signal }) =>
      apiRequest('GET', `/api/briefs/${segment(shareId)}`, Brief, { signal }),
  })
}

/** Financials re-priced at `rates`. Shows the previous rates' prices while a new request runs. */
export function useEvaluate(scope: Scope, rates: Rates, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.evaluate(scope, rates),
    queryFn: ({ signal }) =>
      apiRequest('POST', `${scopePath(scope)}/evaluate`, EvaluateResponse, {
        body: ratesBody(rates),
        token: scope.kind === 'review' ? scope.token : undefined,
        signal,
      }),
    placeholderData: keepPreviousData,
    enabled: options.enabled,
  })
}

/** Every tender, newest ingest first, with its open-item count. Idle while `enabled` is false. */
export function useReviewTenders(token: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.reviewTenders(token),
    queryFn: ({ signal }) =>
      apiRequest('GET', '/api/review/tenders', z.array(ReviewTenderSummary), { token, signal }),
    enabled: options.enabled,
  })
}

/** GET a tender's review brief; outside the query cache when called directly. */
export function fetchReviewBrief(tenderId: string, token: string, signal?: AbortSignal) {
  return apiRequest('GET', tenderPath(tenderId), Brief, { token, signal })
}

/** The review brief's key and fetcher, shared by useReviewBrief and one-off reads (fetchQuery). */
export function reviewBriefQuery(tenderId: string, token: string) {
  return queryOptions({
    queryKey: queryKeys.reviewBrief(tenderId, token),
    queryFn: ({ signal }) => fetchReviewBrief(tenderId, token, signal),
  })
}

/** A tender's brief in any status, for the founder. Idle while `enabled` is false. */
export function useReviewBrief(
  tenderId: string,
  token: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({ ...reviewBriefQuery(tenderId, token), enabled: options.enabled })
}

/** After a change to a tender: its review brief (and its evaluations) and the tender list. */
function invalidateTender(client: QueryClient, tenderId: string, token: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.reviewBrief(tenderId, token) }),
    client.invalidateQueries({ queryKey: queryKeys.reviewTenders(token) }),
  ])
}

export type OverrideCell = { paramId: string; vendorId: string }
/** `adderEur` is a decimal string with at most two places ("18500.50"), never a float. */
export type OverrideInput = OverrideCell & { adderEur: string; note: string }

function overridePath(tenderId: string, { paramId, vendorId }: OverrideCell) {
  return `${tenderPath(tenderId)}/overrides/${segment(paramId)}/${segment(vendorId)}`
}

/** Set a cell's adder. A 409 (ApiError "conflict") means the brief is verified: withdraw first. */
export function usePutOverride(tenderId: string, token: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ adderEur, note, ...cell }: OverrideInput) =>
      apiRequest('PUT', overridePath(tenderId, cell), z.undefined(), {
        token,
        body: { adder_eur: adderEur, note },
      }),
    onSettled: () => invalidateTender(client, tenderId, token),
  })
}

export function useDeleteOverride(tenderId: string, token: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (cell: OverrideCell) =>
      apiRequest('DELETE', overridePath(tenderId, cell), z.undefined(), { token }),
    onSettled: () => invalidateTender(client, tenderId, token),
  })
}

/** Publish the brief. A 409 carries `{detail, open_items}` in the ApiError's body. */
export function useVerify(tenderId: string, token: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiRequest('POST', `${tenderPath(tenderId)}/verify`, VerifyResponse, { token }),
    onSettled: () =>
      Promise.all([
        invalidateTender(client, tenderId, token),
        client.invalidateQueries({ queryKey: queryKeys.briefs() }),
      ]),
  })
}

/** Take the brief back to draft; its share link stops working. */
export function useWithdraw(tenderId: string, token: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiRequest('POST', `${tenderPath(tenderId)}/withdraw`, WithdrawResponse, { token }),
    onSettled: () =>
      Promise.all([
        invalidateTender(client, tenderId, token),
        client.invalidateQueries({ queryKey: queryKeys.briefs() }),
      ]),
  })
}

/**
 * After an ingest of `tenderId` completes: the tender is back to draft with its overrides
 * cleared, so its review brief, the tender list and any public brief are refetched.
 */
export function invalidateAfterIngest(client: QueryClient, tenderId: string, token: string) {
  return Promise.all([
    invalidateTender(client, tenderId, token),
    client.invalidateQueries({ queryKey: queryKeys.briefs() }),
  ])
}

export type IngestMode = 'replay' | 'auto' | 'live'
/** `mode` omitted: the backend's default ("auto"). */
export type IngestInput = { tenderId: string; mode?: IngestMode }

/** Queue an ingest of a tender folder; poll the returned job with useJob. */
export function useStartIngest(token: string) {
  return useMutation({
    mutationFn: ({ tenderId, mode }: IngestInput) =>
      apiRequest('POST', '/api/jobs/ingest', StartIngestResponse, {
        token,
        body: { tender_id: tenderId, mode },
      }),
  })
}

/**
 * An ingest job, polled every 750 ms until it is COMPLETED or FAILED. Idle while `jobId`
 * is null. Polling also stops on an error that will not go away (401, 404).
 */
export function useJob(jobId: string | null, token: string) {
  return useQuery({
    queryKey: queryKeys.job(jobId ?? '', token),
    queryFn:
      jobId === null
        ? skipToken
        : ({ signal }) => apiRequest('GET', `/api/jobs/${segment(jobId)}`, Job, { token, signal }),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'COMPLETED' || status === 'FAILED') return false
      const error = query.state.error
      if (error instanceof ApiError && error.kind !== 'network' && error.kind !== 'server') {
        return false
      }
      return JOB_POLL_MS
    },
  })
}
