import { http, HttpResponse } from 'msw'
import draftBrief from '../fixtures/draft-brief.json'
import { draftWithoutOverrides } from '../fixtures/draftWithoutOverrides'
import jobs from '../fixtures/jobs.json'
import reviewList from '../fixtures/review-list.json'
import verifiedBrief from '../fixtures/verified-brief.json'

/** The review token the handlers accept (the backend tests use the same value). */
export const TEST_REVIEW_TOKEN = 'test-review-token'
export const SHARE_ID = verifiedBrief.share_id
export const TENDER_ID = draftBrief.tender.id

// A 1×1 transparent PNG: what an evidence crop route answers.
export const PNG_BYTES = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  ),
  (c) => c.charCodeAt(0),
)

const notFound = () => HttpResponse.json({ detail: 'Not found' }, { status: 404 })
const png = () =>
  HttpResponse.arrayBuffer(PNG_BYTES.slice().buffer, { headers: { 'Content-Type': 'image/png' } })

/** null when the request carries the test token, else the backend's 401. */
function denied(request: Request) {
  const token = request.headers.get('X-Antova-Review-Token')?.trim()
  return token === TEST_REVIEW_TOKEN
    ? null
    : HttpResponse.json({ detail: 'Invalid review token' }, { status: 401 })
}

/**
 * Happy-path handlers serving the committed fixtures, one per backend route the app calls.
 * Stateless: a test that needs another answer (503, a verify that succeeds, a job in
 * progress) overrides the route with `server.use(...)`.
 */
export const handlers = [
  // Public brief (no token). Only the verified fixture's share ID exists.
  http.get('/api/briefs/:shareId', ({ params }) =>
    params.shareId === SHARE_ID ? HttpResponse.json(verifiedBrief) : notFound(),
  ),
  http.post('/api/briefs/:shareId/evaluate', ({ params }) =>
    params.shareId === SHARE_ID
      ? HttpResponse.json({ financials: verifiedBrief.financials })
      : notFound(),
  ),
  http.get('/api/briefs/:shareId/evidence/:paramId/:source/:which', ({ params }) =>
    params.shareId === SHARE_ID ? png() : notFound(),
  ),

  // Founder review (token). The only tender is the draft fixture.
  http.get(
    '/api/review/tenders',
    ({ request }) => denied(request) ?? HttpResponse.json(reviewList),
  ),
  http.get(
    '/api/review/tenders/:tenderId',
    ({ request, params }) =>
      denied(request) ??
      (params.tenderId === TENDER_ID ? HttpResponse.json(draftWithoutOverrides()) : notFound()),
  ),
  http.post(
    '/api/review/tenders/:tenderId/evaluate',
    ({ request, params }) =>
      denied(request) ??
      (params.tenderId === TENDER_ID
        ? HttpResponse.json({ financials: draftBrief.financials })
        : notFound()),
  ),
  http.get(
    '/api/review/tenders/:tenderId/evidence/:paramId/:source/:which',
    ({ request, params }) =>
      denied(request) ?? (params.tenderId === TENDER_ID ? png() : notFound()),
  ),
  http.put(
    '/api/review/tenders/:tenderId/overrides/:paramId/:vendorId',
    ({ request, params }) =>
      denied(request) ??
      (params.tenderId === TENDER_ID ? new HttpResponse(null, { status: 204 }) : notFound()),
  ),
  http.delete(
    '/api/review/tenders/:tenderId/overrides/:paramId/:vendorId',
    ({ request, params }) =>
      denied(request) ??
      (params.tenderId === TENDER_ID ? new HttpResponse(null, { status: 204 }) : notFound()),
  ),
  // The draft fixture has an open item, so verifying it is refused, as the backend would.
  http.post(
    '/api/review/tenders/:tenderId/verify',
    ({ request, params }) =>
      denied(request) ??
      (params.tenderId === TENDER_ID
        ? HttpResponse.json(
            { detail: 'Open items remain', open_items: draftBrief.open_items },
            { status: 409 },
          )
        : notFound()),
  ),
  http.post(
    '/api/review/tenders/:tenderId/withdraw',
    ({ request, params }) =>
      denied(request) ??
      (params.tenderId === TENDER_ID ? HttpResponse.json({ status: 'DRAFT' }) : notFound()),
  ),

  // Ingest jobs (token). A job reads as completed; override for progress or failure.
  http.post('/api/jobs/ingest', ({ request }) => denied(request) ?? HttpResponse.json(jobs.start)),
  http.get(
    '/api/jobs/:jobId',
    ({ request, params }) =>
      denied(request) ??
      (params.jobId === jobs.start.job_id
        ? HttpResponse.json(jobs.completed)
        : HttpResponse.json({ detail: 'Job not found' }, { status: 404 })),
  ),
]
