import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { PNG_BYTES, SHARE_ID, TENDER_ID, TEST_REVIEW_TOKEN } from '../test/msw/handlers'
import { server } from '../test/msw/server'
import { ApiError, apiRequest, evidenceUrl, fetchEvidenceObjectUrl, type Scope } from './client'
import { Brief, ReviewTenderSummary, VerifyResponse } from './schemas'

const publicScope: Scope = { kind: 'public', shareId: SHARE_ID }
const reviewScope: Scope = { kind: 'review', tenderId: TENDER_ID, token: TEST_REVIEW_TOKEN }

/** The ApiError a request rejects with (fails the test if it resolves or throws something else). */
async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  const error: unknown = await promise.then(
    () => {
      throw new Error('expected the request to fail')
    },
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('apiRequest', () => {
  it('parses a fixture response through its schema', async () => {
    const brief = await apiRequest('GET', `/api/briefs/${SHARE_ID}`, Brief)
    expect(brief.status).toBe('VERIFIED')
    expect(brief.tender.vendors).toHaveLength(3)
  })

  it('maps 404 to not_found', async () => {
    const error = await apiError(apiRequest('GET', '/api/briefs/no-such-share', Brief))
    expect(error.kind).toBe('not_found')
    expect(error.status).toBe(404)
    expect(error.body).toEqual({ detail: 'Not found' })
    expect(error.message).toBe('Not found')
  })

  it('maps 401 to unauthorized', async () => {
    const error = await apiError(
      apiRequest('GET', '/api/review/tenders', z.array(ReviewTenderSummary), { token: 'wrong' }),
    )
    expect(error.kind).toBe('unauthorized')
    expect(error.status).toBe(401)
  })

  it('maps 409 to conflict and keeps the body', async () => {
    const error = await apiError(
      apiRequest('POST', `/api/review/tenders/${TENDER_ID}/verify`, VerifyResponse, {
        token: TEST_REVIEW_TOKEN,
      }),
    )
    expect(error.kind).toBe('conflict')
    expect(error.status).toBe(409)
    expect(error.body).toMatchObject({
      detail: 'Open items remain',
      open_items: [{ kind: 'unpriced', param_id: 'PARAM-05', vendor_id: 'vendor-c' }],
    })
  })

  it('maps 422 to invalid', async () => {
    server.use(
      http.post('/api/briefs/:shareId/evaluate', () =>
        HttpResponse.json({ detail: [{ msg: 'too low' }] }, { status: 422 }),
      ),
    )
    const error = await apiError(
      apiRequest('POST', `/api/briefs/${SHARE_ID}/evaluate`, z.unknown(), { body: {} }),
    )
    expect(error.kind).toBe('invalid')
    expect(error.status).toBe(422)
  })

  it('maps 5xx to server and keeps the status (503: review not configured)', async () => {
    server.use(
      http.get('/api/review/tenders', () =>
        HttpResponse.json({ detail: 'Review is not configured on this server' }, { status: 503 }),
      ),
    )
    const error = await apiError(
      apiRequest('GET', '/api/review/tenders', z.array(ReviewTenderSummary), {
        token: TEST_REVIEW_TOKEN,
      }),
    )
    expect(error.kind).toBe('server')
    expect(error.status).toBe(503)
    expect(error.message).toBe('Review is not configured on this server')
  })

  it('maps fetch rejection to network', async () => {
    server.use(http.get('/api/briefs/:shareId', () => HttpResponse.error()))
    const error = await apiError(apiRequest('GET', `/api/briefs/${SHARE_ID}`, Brief))
    expect(error.kind).toBe('network')
    expect(error.status).toBeUndefined()
  })

  it('rethrows an abort as is', async () => {
    const controller = new AbortController()
    controller.abort()
    const error: unknown = await apiRequest('GET', `/api/briefs/${SHARE_ID}`, Brief, {
      signal: controller.signal,
    }).catch((e: unknown) => e)
    expect(error).not.toBeInstanceOf(ApiError)
    expect((error as Error).name).toBe('AbortError')
  })

  it('sends review token header', async () => {
    let seen: string | null = null
    server.use(
      http.get('/api/review/tenders', ({ request }) => {
        seen = request.headers.get('X-Antova-Review-Token')
        return HttpResponse.json([])
      }),
    )
    await apiRequest('GET', '/api/review/tenders', z.array(ReviewTenderSummary), {
      token: TEST_REVIEW_TOKEN,
    })
    expect(seen).toBe(TEST_REVIEW_TOKEN)
  })

  it('sends no token header, and no cookies, on public requests', async () => {
    let request: Request | undefined
    server.use(
      http.get('/api/briefs/:shareId', (info) => {
        request = info.request
        return HttpResponse.json([])
      }),
    )
    // Node's Request does not carry `credentials` through to the interceptor; read the fetch init.
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    try {
      await apiRequest('GET', `/api/briefs/${SHARE_ID}`, z.array(z.never()))
      expect(fetchSpy.mock.calls[0]?.[1]?.credentials).toBe('omit')
    } finally {
      fetchSpy.mockRestore()
    }
    expect(request?.headers.has('X-Antova-Review-Token')).toBe(false)
  })

  it('sends the body as JSON', async () => {
    let body: unknown
    let contentType: string | null = null
    server.use(
      http.post('/api/briefs/:shareId/evaluate', async ({ request }) => {
        contentType = request.headers.get('Content-Type')
        body = await request.json()
        return HttpResponse.json({ ok: true })
      }),
    )
    await apiRequest('POST', `/api/briefs/${SHARE_ID}/evaluate`, z.object({ ok: z.boolean() }), {
      body: { copper_multiplier: 1.15 },
    })
    expect(contentType).toBe('application/json')
    expect(body).toEqual({ copper_multiplier: 1.15 })
  })

  it('rejects schema-invalid JSON as server error', async () => {
    server.use(
      http.get('/api/briefs/:shareId', () => HttpResponse.json({ share_id: 42, status: 'NOPE' })),
    )
    const error = await apiError(apiRequest('GET', `/api/briefs/${SHARE_ID}`, Brief))
    expect(error.kind).toBe('server')
    expect(error.status).toBe(200)
  })

  it('rejects a non-JSON success body as server error', async () => {
    server.use(http.get('/api/briefs/:shareId', () => HttpResponse.text('<html>')))
    const error = await apiError(apiRequest('GET', `/api/briefs/${SHARE_ID}`, Brief))
    expect(error.kind).toBe('server')
  })

  it('reads a 204 as no body', async () => {
    const result = await apiRequest(
      'PUT',
      `/api/review/tenders/${TENDER_ID}/overrides/PARAM-05/vendor-c`,
      z.undefined(),
      { token: TEST_REVIEW_TOKEN, body: { adder_eur: '2600.00', note: 'Two FAT days' } },
    )
    expect(result).toBeUndefined()
  })

  it('prefixes VITE_API_BASE', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://api.antova.test')
    server.use(http.get('https://api.antova.test/api/review/tenders', () => HttpResponse.json([])))
    await expect(
      apiRequest('GET', '/api/review/tenders', z.array(ReviewTenderSummary)),
    ).resolves.toEqual([])
  })
})

describe('evidence', () => {
  it('builds public and review evidence URLs', () => {
    expect(evidenceUrl(publicScope, 'PARAM-01', 'vendor-b', 'secondary')).toBe(
      `/api/briefs/${SHARE_ID}/evidence/PARAM-01/vendor-b/secondary.png`,
    )
    expect(evidenceUrl(reviewScope, 'PARAM-01', 'mr', 'primary')).toBe(
      `/api/review/tenders/${TENDER_ID}/evidence/PARAM-01/mr/primary.png`,
    )
  })

  describe('object URLs', () => {
    // jsdom has no URL.createObjectURL; stub it for these tests only.
    const createObjectURL = vi.fn((blob: Blob) => `blob:evidence-${blob.size}`)
    const original = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')

    function stubCreateObjectURL() {
      Object.defineProperty(URL, 'createObjectURL', {
        value: createObjectURL,
        configurable: true,
        writable: true,
      })
    }

    afterEach(() => {
      createObjectURL.mockClear()
      if (original) Object.defineProperty(URL, 'createObjectURL', original)
      else Reflect.deleteProperty(URL, 'createObjectURL')
    })

    it('review evidence is fetched with the token and returned as an object URL', async () => {
      stubCreateObjectURL()
      let token: string | null = null
      server.use(
        http.get(
          '/api/review/tenders/:tenderId/evidence/:paramId/:source/:which',
          ({ request }) => {
            token = request.headers.get('X-Antova-Review-Token')
            return HttpResponse.arrayBuffer(PNG_BYTES.slice().buffer, {
              headers: { 'Content-Type': 'image/png' },
            })
          },
        ),
      )
      const url = await fetchEvidenceObjectUrl(reviewScope, 'PARAM-01', 'vendor-b', 'primary')
      expect(token).toBe(TEST_REVIEW_TOKEN)
      expect(createObjectURL).toHaveBeenCalledTimes(1)
      const blob = createObjectURL.mock.calls[0]?.[0]
      expect(Object.prototype.toString.call(blob)).toBe('[object Blob]')
      expect(blob?.size).toBe(PNG_BYTES.byteLength)
      expect(blob?.type).toBe('image/png')
      expect(url).toBe(`blob:evidence-${PNG_BYTES.byteLength}`)
    })

    it('public evidence is the plain URL, not fetched', async () => {
      stubCreateObjectURL()
      const url = await fetchEvidenceObjectUrl(publicScope, 'PARAM-01', 'vendor-b', 'primary')
      expect(url).toBe(evidenceUrl(publicScope, 'PARAM-01', 'vendor-b', 'primary'))
      expect(createObjectURL).not.toHaveBeenCalled()
    })

    it('a missing review crop rejects with not_found', async () => {
      stubCreateObjectURL()
      const error = await apiError(
        fetchEvidenceObjectUrl(
          { ...reviewScope, tenderId: 'TENDER-UNKNOWN' },
          'PARAM-01',
          'vendor-b',
          'primary',
        ),
      )
      expect(error.kind).toBe('not_found')
      expect(createObjectURL).not.toHaveBeenCalled()
    })
  })
})
