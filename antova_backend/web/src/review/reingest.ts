import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { fetchReviewBrief, queryKeys, type IngestInput } from '../api/queries'

/**
 * What re-ingesting a tender loses (save_tender returns it to draft and deletes its
 * overrides): its verified share link and its overrides; `'unknown'` when the brief couldn't
 * be read; `'unauthorized'` when the server refused the token; null when there is nothing to
 * lose.
 */
export type ReingestRisk =
  { verified: boolean; overrides: number } | 'unknown' | 'unauthorized' | null

/** How long the lookup may take before the founder is asked instead (a hung API). */
export const LOOKUP_TIMEOUT_MS = 10_000

/**
 * Looks up the tender to be re-ingested, always from the server: a cached brief may be out of
 * date (verified in another tab, say), and acting on it would skip the question. A 404 is a
 * new tender: nothing to lose. A 401 is 'unauthorized'. Any other failure, a timeout
 * included, is 'unknown', never a silent go-ahead.
 *
 * The fetch runs outside the query cache, so a failed lookup never puts the page's own brief
 * into an error state; a successful one refreshes the cached brief.
 */
export async function reingestRisk(
  client: QueryClient,
  tenderId: string,
  token: string,
  timeoutMs: number = LOOKUP_TIMEOUT_MS,
): Promise<ReingestRisk> {
  try {
    const brief = await fetchReviewBrief(tenderId, token, AbortSignal.timeout(timeoutMs))
    client.setQueryData(queryKeys.reviewBrief(tenderId, token), brief)
    const verified = brief.status === 'VERIFIED'
    const overrides = brief.overrides.length
    return verified || overrides > 0 ? { verified, overrides } : null
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'not_found') return null
    if (error instanceof ApiError && error.kind === 'unauthorized') return 'unauthorized'
    return 'unknown'
  }
}

export type ReingestGuard = {
  /** *Run ingest* submitted: launches at once, or asks first. Ignored while a lookup runs. */
  start: (input: Required<IngestInput>) => void
  /** True while the target tender is being looked up: the form shows itself busy. */
  checking: boolean
  /** For ReingestConfirm: the run waiting on the founder's answer, if any, and the answers. */
  confirm: {
    pending: ReingestQuestion | null
    onConfirm: () => void
    onCancel: () => void
  }
}

/** A run held for confirmation: the tender to re-ingest and what doing so loses. */
export type ReingestQuestion = {
  tenderId: string
  risk: Exclude<ReingestRisk, null | 'unauthorized'>
}

/**
 * The re-ingest check both review pages use: before `launch`, look up the target tender's
 * brief (reingestRisk) and, when re-ingesting loses something or that can't be told, hold the
 * run until the founder confirms in ReingestConfirm. A refused token re-checks the page's own
 * queries, which then fail with 401 and bring back the token gate.
 */
export function useReingestGuard(
  token: string,
  launch: (input: Required<IngestInput>) => void,
): ReingestGuard {
  const client = useQueryClient()
  const busy = useRef(false)
  const [checking, setChecking] = useState(false)
  const [pending, setPending] = useState<{
    input: Required<IngestInput>
    question: ReingestQuestion
  } | null>(null)

  const start = (input: Required<IngestInput>) => {
    if (busy.current) return
    busy.current = true
    setChecking(true)
    void reingestRisk(client, input.tenderId, token)
      .then((risk) => {
        if (risk === null) launch(input)
        else if (risk === 'unauthorized') {
          void client.invalidateQueries({ queryKey: queryKeys.reviewTenders(token) })
          void client.invalidateQueries({ queryKey: queryKeys.reviewBrief(input.tenderId, token) })
        } else setPending({ input, question: { tenderId: input.tenderId, risk } })
      })
      .finally(() => {
        busy.current = false
        setChecking(false)
      })
  }

  return {
    start,
    checking,
    confirm: {
      pending: pending?.question ?? null,
      onConfirm: () => {
        if (pending !== null) launch(pending.input)
        setPending(null)
      },
      onCancel: () => setPending(null),
    },
  }
}
