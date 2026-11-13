# API contract (what the UI relies on)

The frontend talks to the FastAPI backend through one client, `web/src/api/client.ts`, and
validates every response with zod (`web/src/api/schemas.ts`), so a backend change fails loudly in
the UI instead of rendering wrong numbers. The binding endpoint table is spec §6. This file is the
frontend's view of it: which hook calls what, what can go wrong, and where the test data comes from.

If you change a field, change the backend, `schemas.ts`, the fixtures and this file together.

## Ground rules

- Base URL: `VITE_API_BASE` (empty means same origin; Vite proxies `/api` to `127.0.0.1:8000` in dev).
- No cookies: `credentials: "omit"`. Founder routes send the token in the `X-Antova-Review-Token`
  header. The token lives in `sessionStorage` only, never in a URL, log or `localStorage`.
- No analytics and no third-party requests at runtime.
- Money is converted to integer cents by domain code (`domain/money.ts`, `domain/leveling.ts`).
  Components never sum floats. An override amount is sent as a decimal string with at most two
  places ("18500.50"), never a float. Schemas are not strict: a new backend field is ignored.
- The public brief never carries Antova's run cost. `api_cost_usd` and `cogs_usd` exist only on the
  review payload and job result (optional in `IngestStats`). Never render them on a public page.
- Tender IDs are not public. Public URLs use share IDs; the founder routes use tender IDs.

## Endpoints by hook

| Hook (`api/queries.ts`) | Method and path | Auth | Response schema |
|---|---|---|---|
| `useBrief(shareId)` | `GET /api/briefs/{share_id}` | none, VERIFIED only | `Brief` |
| `useEvaluate(scope, rates)` | `POST {scope}/evaluate` | public or token | `EvaluateResponse` |
| `evidenceUrl()` / `fetchEvidenceObjectUrl()` | `GET {scope}/evidence/{param_id}/{source}/{which}.png` | public or token | PNG |
| `useReviewTenders(token)` | `GET /api/review/tenders` | token | `ReviewTenderSummary[]` |
| `useReviewBrief(tenderId, token)` | `GET /api/review/tenders/{id}` | token | `Brief` (any status, with `open_items`) |
| `usePutOverride` | `PUT /api/review/tenders/{id}/overrides/{param}/{vendor}` | token | none (204) |
| `useDeleteOverride` | `DELETE` same path | token | 204 |
| `useVerify` | `POST /api/review/tenders/{id}/verify` | token | `VerifyResponse` (`share_id`, `verified_at`) |
| `useWithdraw` | `POST /api/review/tenders/{id}/withdraw` | token | `WithdrawResponse` (`status: DRAFT`) |
| `useStartIngest(token)` | `POST /api/jobs/ingest` body `{tender_id, mode}` | token | `StartIngestResponse` (`job_id`, `QUEUED`) |
| `useJob(jobId, token)` | `GET /api/jobs/{job_id}` | token | `Job` |

`{scope}` is `/api/briefs/{share_id}` for a public scope and `/api/review/tenders/{tender_id}` for
a review scope (`scopePath()` in `client.ts`).

Evaluate request body (`ratesBody()`): `copper_multiplier`, `site_labor_rate`, `freight_multiplier`.
Defaults are `DEFAULT_RATES = { copper: 1, labour: 60, freight: 1 }`. Evaluate applies overrides.

Ingest `mode` is `replay`, `auto` or `live`. Omitted means the backend default (`auto`). The tender
ID must match `^[A-Z0-9-]{1,64}$`.

## The brief

`Brief` fields: `share_id`, `status` (`DRAFT` or `VERIFIED`), `verified_at`, `synthetic`,
`ingest_mode`, `ingest_stats` (an `IngestStats` object, or the "no recorded run" value for tenders
migrated from v2), `stage_log`, `documents`, `tender`, `financials`, `overrides`, `open_items`.

Things the UI depends on:

- `ingest_mode === "answer_key"` means the extraction came from the test answer key. The hero adds
  "· test extraction" and `check:launch` blocks launch.
- `synthetic` drives the "documents are synthetic, vendors fictional" label.
- Empty `ingest_stats` parses to `null`, which reads as "no recorded run". Method omits the rate
  table date, and the replay says "Not recorded for this tender" (R27).
- `rate_table_effective_date` is optional (absent before R26).
- Enums: `ComplianceStatus`, `Criticality` (`MANDATORY`, `HIGH`, `MEDIUM`, `COMMERCIAL`),
  `PricingStatus` (`NONE`, `PRICED`, `UNPRICED`). Unknown values fail the zod parse.

## Errors

`ApiError.kind` (from `client.ts`):

| kind | Status | UI meaning |
|---|---|---|
| `not_found` | 404 | public brief: the "not available" page (unknown and unverified look identical). Evidence crop: fall back to the quote text. |
| `unauthorized` | 401 | show the token gate with "That token didn't work." |
| `conflict` | 409 | verify refused (body lists `open_items`), or an override change on a VERIFIED brief |
| `invalid` | 422 | the form shows the server's detail |
| `network` | none | "can't reach the server" banner with retry |
| `server` | other | same banner. A **503** on a review route means the server has no review token configured: show "not configured" (`review/access.ts`). |

Retry policy (`api/queryClient.ts`): queries retry `network` and `server` errors at most twice.
Everything else settles at once. Mutations never retry (a retried ingest would start a duplicate).

## Caching and polling

- Keys: `['brief', shareId]`, `['review', token, 'tenders']`, `['review', token, 'tender', id]`,
  `[...brief, 'evaluate', rates]`, `['review', token, 'job', jobId]`.
- Evaluate keeps the previous result as placeholder while a new rate set loads.
- The re-ingest lookup uses `staleTime: 0`. A cached brief once let a verified tender look like a
  draft in another tab and skipped the confirmation (fixed in `5143bdc`, pre-rewrite hash).
- Verify, withdraw, override changes and a finished ingest invalidate the review brief, the list
  and any public brief (`invalidateAfterIngest`).
- Jobs poll every 750 ms until `COMPLETED` or `FAILED`. Polling also stops on a 401 or 404.
- There is no WebSocket. The legacy `/ws/telemetry` socket, `/api/evaluate`, `/api/negotiate/turn`,
  `/api/export-pdf` and the other pre-brief routes were removed; progress is read by polling the job.

## Job states the modal must handle

`Job`: `job_id`, `status` (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`), `progress_pct`, `stage`,
`created_at`, `completed_at`, `result` (stats plus `stage_log` and `overrides_cleared`), `error`.

- `PENDING` shows "Queued in worker pipeline". Do not map it with `stageForBackend` (it throws on
  unknown names).
- A `PROCESSING` job with an unknown stage stays "running" at the last known stage.
- `FAILED` shows the stage and `error`, with *Try again*. A `FAILED` job with an unknown stage still
  shows the failure.
- A finished job never turns into "lost" after an API restart (R29).
- `overrides_cleared` lists the overrides a re-ingest dropped: those whose cell's evidence changed, whose cell is gone, or that were entered before evidence hashes existed. An override on an unchanged cell survives and is not listed. The review page tells the founder.

## Static sample (landing)

The landing makes no API request. It renders from `web/src/generated/sample-brief.json` and crops in
`web/public/sample/evidence/{param}/{vendor}/{primary,secondary}.png`.

| Command (from `web/`) | Effect |
|---|---|
| `npm run snapshot:sample` | Fetch the public sample brief and its crops. All or nothing, PNG-checked. |
| `npm run snapshot:crops` | Crops only, leaves the JSON alone. |

Run it against the production API after a live, verified sample ingest. Against the seeded e2e API
it produces the end-to-end brief, which `check:launch` rejects.

## Test data

| File (`web/src/test/fixtures/`) | Used for |
|---|---|
| `verified-brief.json`, `draft-brief.json` | public and review brief tests, MSW handlers |
| `review-list.json` | review index |
| `jobs.json` | job states for the modal |
| `parity-cases.json` | golden cases for `leveling.ts`, computed by the Python engine |

Fixtures are generated by `specclaw_ingest/export_fixtures.py` (`python -m
specclaw_ingest.export_fixtures`). They are LF files (`web/.gitattributes`, R11). Handlers are in
`src/test/msw/handlers.ts`. e2e seeds the real backend with `python -m specclaw_ingest.dev_seed
--share-id e2e-sample-share-id-000000` after deleting `e2e.db` (`e2e/start-api.mjs`).

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_API_BASE` | frontend | API origin; empty in dev |
| `VITE_SAMPLE_SHARE_ID` | frontend | the live sample's share ID (the landing links to it) |
| `VITE_CONTACT_EMAIL` | frontend | the offer's mailto and copyable address |
| `VITE_SITE_URL` | frontend build | canonical link, structured data, `robots.txt`, `sitemap.xml` |
| `ANTOVA_REVIEW_TOKEN` | backend | shared review token; its holder is the reviewer `founder`. With no token configured at all, review routes return 503. |
| `ANTOVA_REVIEWERS` | backend | JSON `{"<id>": {"name": "...", "token": "..."}}`. Each token is one reviewer; the server records that ID on reviews, overrides and verification, and ignores any reviewer name a request sends. A malformed value, or two reviewers with one token, closes review (503). |
| `ANTOVA_ALLOWED_ORIGINS` | backend | CORS origins (comma separated) |
| `ANTHROPIC_API_KEY` | backend | live ingests. Not set anywhere today. |

Never write a token value or API key into this repo. It is public.
