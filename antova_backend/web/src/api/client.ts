/**
 * The one way the app talks to the backend: fetch, map failures to ApiError, validate with zod.
 *
 * No cookies (credentials: "omit"); founder routes carry the review token in a header.
 */
import type { z } from 'zod'
import type { Rates } from './schemas'

export type { Rates } from './schemas'

/** The backend's defaults (SensitivitySettings): copper ×1, labour €60/h, freight ×1. */
export const DEFAULT_RATES: Rates = { copper: 1, labour: 60, freight: 1 }

export const REVIEW_HEADER = 'X-Antova-Review-Token'

/**
 * not_found 404 · unauthorized 401 · conflict 409 · invalid 422 · network: no response ·
 * server: any other status, or a response that is not the expected JSON. `status` is kept,
 * so a 503 (review not configured on this server) can be told apart from other server errors.
 */
export type ApiErrorKind =
  'not_found' | 'unauthorized' | 'conflict' | 'invalid' | 'network' | 'server'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  /** The HTTP status; undefined when no response arrived. */
  readonly status?: number
  /** The parsed error body (e.g. a 409's `open_items`), or its text if it was not JSON. */
  readonly body?: unknown

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: { status?: number; body?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'ApiError'
    this.kind = kind
    this.status = options.status
    this.body = options.body
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export type RequestOptions = { body?: unknown; token?: string; signal?: AbortSignal }

function apiBase(): string {
  // Read per call, so tests can stub it.
  return import.meta.env.VITE_API_BASE ?? ''
}

function kindFor(status: number): ApiErrorKind {
  switch (status) {
    case 404:
      return 'not_found'
    case 401:
      return 'unauthorized'
    case 409:
      return 'conflict'
    case 422:
      return 'invalid'
    default:
      return 'server'
  }
}

/** An aborted request rejects with the abort itself, so callers (and TanStack Query) see a cancel. */
function networkError(cause: unknown, signal: AbortSignal | undefined): unknown {
  if (signal?.aborted) return cause
  return new ApiError('network', 'The server could not be reached', { cause })
}

async function httpError(response: Response): Promise<ApiError> {
  const text = await response.text().catch(() => '')
  let body: unknown = text === '' ? undefined : text
  try {
    if (text !== '') body = JSON.parse(text)
  } catch {
    // keep the text
  }
  const detail =
    typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string'
      ? body.detail
      : `Request failed with status ${response.status}`
  return new ApiError(kindFor(response.status), detail, { status: response.status, body })
}

/** fetch with the shared headers; rejects with ApiError unless the response is 2xx. */
async function send(
  method: HttpMethod,
  path: string,
  { body, token, signal }: RequestOptions,
  accept: string,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: accept }
  if (token !== undefined) headers[REVIEW_HEADER] = token
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let response: Response
  try {
    response = await fetch(apiBase() + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit',
      signal,
    })
  } catch (cause) {
    throw networkError(cause, signal)
  }
  if (!response.ok) throw await httpError(response)
  return response
}

/**
 * One JSON request. `path` starts with /api; VITE_API_BASE (empty: same origin) is prefixed.
 * A 204 reads as `undefined`, so its schema is `z.undefined()`.
 */
export async function apiRequest<T>(
  method: HttpMethod,
  path: string,
  schema: z.ZodType<T>,
  opts: RequestOptions = {},
): Promise<T> {
  const response = await send(method, path, opts, 'application/json')
  const { status } = response
  let text: string
  try {
    text = status === 204 ? '' : await response.text()
  } catch (cause) {
    throw networkError(cause, opts.signal)
  }
  let data: unknown
  if (text !== '') {
    try {
      data = JSON.parse(text)
    } catch (cause) {
      throw new ApiError('server', 'The server sent a response that is not JSON', {
        status,
        body: text,
        cause,
      })
    }
  }
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new ApiError('server', 'The server sent an unexpected response', {
      status,
      body: data,
      cause: parsed.error,
    })
  }
  return parsed.data
}

/** The backend's RatesBody for the frontend's slider settings. */
export function ratesBody(rates: Rates) {
  return {
    copper_multiplier: rates.copper,
    site_labor_rate: rates.labour,
    freight_multiplier: rates.freight,
  }
}

/** Whose brief a view shows: a public share link, or the founder reviewing a tender. */
export type Scope =
  { kind: 'public'; shareId: string } | { kind: 'review'; tenderId: string; token: string }

/** "mr" for the buyer's requirement, else a vendor ID. */
export type EvidenceSource = string
export type EvidenceWhich = 'primary' | 'secondary'

const segment = encodeURIComponent

/** The brief's base path for a scope (no VITE_API_BASE). */
export function scopePath(scope: Scope): string {
  return scope.kind === 'public'
    ? `/api/briefs/${segment(scope.shareId)}`
    : `/api/review/tenders/${segment(scope.tenderId)}`
}

function evidencePath(
  scope: Scope,
  paramId: string,
  source: EvidenceSource,
  which: EvidenceWhich,
): string {
  return `${scopePath(scope)}/evidence/${segment(paramId)}/${segment(source)}/${segment(which)}.png`
}

/** The crop's URL. Usable as an <img> src only in public scope (review needs the token header). */
export function evidenceUrl(
  scope: Scope,
  paramId: string,
  source: EvidenceSource,
  which: EvidenceWhich,
): string {
  return apiBase() + evidencePath(scope, paramId, source, which)
}

/**
 * An <img> src for the crop. Public scope: the plain URL. Review scope: the PNG fetched with
 * the token, as an object URL the caller must revoke (URL.revokeObjectURL) on unmount.
 */
export async function fetchEvidenceObjectUrl(
  scope: Scope,
  paramId: string,
  source: EvidenceSource,
  which: EvidenceWhich,
  signal?: AbortSignal,
): Promise<string> {
  if (scope.kind === 'public') return evidenceUrl(scope, paramId, source, which)
  const path = evidencePath(scope, paramId, source, which)
  const response = await send('GET', path, { token: scope.token, signal }, 'image/png')
  let blob: Blob
  try {
    blob = await response.blob()
  } catch (cause) {
    throw networkError(cause, signal)
  }
  return URL.createObjectURL(blob)
}
