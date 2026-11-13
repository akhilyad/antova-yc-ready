import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import jobs from '../test/fixtures/jobs.json'
import { SHARE_ID, TENDER_ID, TEST_REVIEW_TOKEN } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { ApiError, DEFAULT_RATES, type Scope } from './client'
import {
  useBrief,
  useEvaluate,
  useJob,
  usePutOverride,
  useReviewBrief,
  useReviewTenders,
  useStartIngest,
} from './queries'
import { createQueryClient } from './queryClient'

/** The app's client and retry policy, with no wait between retries. */
function wrapper(client: QueryClient = createQueryClient({ retryDelay: 0 })) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('createQueryClient', () => {
  it('a 404 query settles to error after exactly one request', async () => {
    let requests = 0
    server.use(
      http.get('/api/briefs/:shareId', () => {
        requests += 1
        return HttpResponse.json({ detail: 'Not found' }, { status: 404 })
      }),
    )
    const { result } = renderHook(() => useBrief('gone'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(requests).toBe(1)
  })

  it('a 401 query is not retried', async () => {
    let requests = 0
    server.use(
      http.get('/api/review/tenders', () => {
        requests += 1
        return HttpResponse.json({ detail: 'Invalid review token' }, { status: 401 })
      }),
    )
    const { result } = renderHook(() => useReviewTenders('wrong'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(requests).toBe(1)
  })

  it('a 500 query is attempted 3 times in total', async () => {
    let requests = 0
    server.use(
      http.get('/api/briefs/:shareId', () => {
        requests += 1
        return HttpResponse.json({ detail: 'boom' }, { status: 500 })
      }),
    )
    const { result } = renderHook(() => useBrief(SHARE_ID), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(requests).toBe(3)
    expect((result.current.error as ApiError).kind).toBe('server')
  })

  it('a network failure is retried too', async () => {
    let requests = 0
    server.use(
      http.get('/api/briefs/:shareId', () => {
        requests += 1
        return HttpResponse.error()
      }),
    )
    const { result } = renderHook(() => useBrief(SHARE_ID), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(requests).toBe(3)
  })

  it('mutations are never retried', async () => {
    let requests = 0
    server.use(
      http.post('/api/jobs/ingest', () => {
        requests += 1
        return HttpResponse.json({ detail: 'boom' }, { status: 500 })
      }),
    )
    const { result } = renderHook(() => useStartIngest(TEST_REVIEW_TOKEN), { wrapper: wrapper() })
    await act(() => result.current.mutateAsync({ tenderId: TENDER_ID }).catch(() => undefined))
    expect(requests).toBe(1)
  })

  it('keeps the production retry delay unless a test overrides it', () => {
    expect(createQueryClient().getDefaultOptions().queries?.retryDelay).toBeUndefined()
    expect(createQueryClient({ retryDelay: 0 }).getDefaultOptions().queries?.retryDelay).toBe(0)
  })
})

describe('query hooks', () => {
  it('useBrief loads the public brief and surfaces a 404 as not_found', async () => {
    const ok = renderHook(() => useBrief(SHARE_ID), { wrapper: wrapper() })
    await waitFor(() => expect(ok.result.current.isSuccess).toBe(true))
    expect(ok.result.current.data?.share_id).toBe(SHARE_ID)

    const missing = renderHook(() => useBrief('gone'), { wrapper: wrapper() })
    await waitFor(() => expect(missing.result.current.isError).toBe(true))
    expect(missing.result.current.error).toBeInstanceOf(ApiError)
    expect((missing.result.current.error as ApiError).kind).toBe('not_found')
  })

  it('useEvaluate posts the rates as the backend body and keeps prices while re-pricing', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post('/api/briefs/:shareId/evaluate', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ financials: [] })
      }),
    )
    const scope: Scope = { kind: 'public', shareId: SHARE_ID }
    const { result, rerender } = renderHook(({ rates }) => useEvaluate(scope, rates), {
      wrapper: wrapper(),
      initialProps: { rates: DEFAULT_RATES },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(bodies[0]).toEqual({ copper_multiplier: 1, site_labor_rate: 60, freight_multiplier: 1 })

    rerender({ rates: { copper: 2.5, labour: 87.5, freight: 0.5 } })
    expect(result.current.isPlaceholderData).toBe(true)
    expect(result.current.data).toEqual({ financials: [] })
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false))
    expect(bodies[1]).toEqual({
      copper_multiplier: 2.5,
      site_labor_rate: 87.5,
      freight_multiplier: 0.5,
    })
  })

  it('usePutOverride sends the override and refetches the review brief and list', async () => {
    const gets = { brief: 0, list: 0 }
    let put: unknown
    server.use(
      http.get('/api/review/tenders', () => {
        gets.list += 1
        return undefined // fall through to the fixture handler
      }),
      http.get(`/api/review/tenders/${TENDER_ID}`, () => {
        gets.brief += 1
        return undefined
      }),
      http.put(
        '/api/review/tenders/:tenderId/overrides/:paramId/:vendorId',
        async ({ request }) => {
          put = { url: new URL(request.url).pathname, body: await request.json() }
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )
    const { result } = renderHook(
      () => ({
        list: useReviewTenders(TEST_REVIEW_TOKEN),
        brief: useReviewBrief(TENDER_ID, TEST_REVIEW_TOKEN),
        put: usePutOverride(TENDER_ID, TEST_REVIEW_TOKEN),
      }),
      { wrapper: wrapper() },
    )
    await waitFor(() =>
      expect(result.current.brief.isSuccess && result.current.list.isSuccess).toBe(true),
    )
    expect(gets).toEqual({ brief: 1, list: 1 })

    await act(() =>
      result.current.put.mutateAsync({
        paramId: 'PARAM-05',
        vendorId: 'vendor-c',
        adderEur: '2600.00',
        note: 'Two extra FAT days at tariff',
      }),
    )
    expect(put).toEqual({
      url: `/api/review/tenders/${TENDER_ID}/overrides/PARAM-05/vendor-c`,
      body: { adder_eur: '2600.00', note: 'Two extra FAT days at tariff' },
    })
    await waitFor(() => expect(gets).toEqual({ brief: 2, list: 2 }))
  })

  it('useJob polls until the job completes, then stops', async () => {
    const sequence = [jobs.queued, jobs.processing[0], jobs.completed]
    let polls = 0
    server.use(
      http.get('/api/jobs/:jobId', () => {
        const body = sequence[Math.min(polls, sequence.length - 1)]
        polls += 1
        return HttpResponse.json(body)
      }),
    )
    const { result } = renderHook(() => useJob(jobs.start.job_id, TEST_REVIEW_TOKEN), {
      wrapper: wrapper(),
    })
    await waitFor(() => expect(result.current.data?.status).toBe('COMPLETED'), { timeout: 3000 })
    expect(polls).toBe(3)
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(polls).toBe(3)
  })

  it('useJob is idle without a job id', () => {
    const { result } = renderHook(() => useJob(null, TEST_REVIEW_TOKEN), { wrapper: wrapper() })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('useStartIngest posts the folder and mode', async () => {
    let body: unknown
    server.use(
      http.post('/api/jobs/ingest', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(jobs.start)
      }),
    )
    const { result } = renderHook(() => useStartIngest(TEST_REVIEW_TOKEN), { wrapper: wrapper() })
    const started = await act(() =>
      result.current.mutateAsync({ tenderId: TENDER_ID, mode: 'replay' }),
    )
    expect(body).toEqual({ tender_id: TENDER_ID, mode: 'replay' })
    expect(started).toEqual(jobs.start)
  })
})
