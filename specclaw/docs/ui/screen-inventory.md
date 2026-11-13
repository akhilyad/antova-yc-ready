# Screen inventory

Every route and overlay in `web/`, with what it reads and which states it must handle. Behaviour
detail lives in spec §7; this file is the checklist you build and test against. If a state is not
here, it is not designed yet.

Routes are in `web/src/router.tsx`. Every page sets `document.title` through `useDocumentTitle`
(`{Page} · Antova`). Founder pages and the unavailable brief also call `useNoIndex`.

## Shell (all routes)

| Part | Behaviour |
|---|---|
| Skip link | First focusable element. Focuses `<main id="main">` in a click handler and does not change the URL hash (on a brief the hash is the selected footnote). |
| Header | Floating bar with the home link. The landing swaps in its own `Nav`. |
| Footer | Sample note plus Impressum and Privacy links on every route (German §5 DDG). |
| Page chunks | Each page is a lazy chunk. The prerender passes the landing in directly. |

## Routes

| Route | Page file | Who | Data | Prerendered |
|---|---|---|---|---|
| `/` | `pages/Landing.tsx` | Public | `src/generated/sample-brief.json`, crops in `public/sample/` | Yes |
| `/b/:shareId` | `pages/Brief.tsx` | Public | `GET /api/briefs/{id}`, evaluate, evidence crops | No |
| `/review` | `pages/ReviewIndex.tsx` | Founder | `GET /api/review/tenders` | No |
| `/review/:tenderId` | `pages/ReviewBrief.tsx` | Founder | review brief, evaluate, overrides, verify, jobs | No |
| `/impressum`, `/privacy` | `pages/Legal.tsx` | Public | `src/content/impressum.md`, `privacy.md` | No |
| `*` | `pages/NotFound.tsx` | Public | none | No |

The audit modal is an overlay on `/` (replay) and on `/review/:tenderId` and `/review` (live), not a
route.

## `/` Landing

Sections in order (landing conversion pass steps 1 to 6 built, step 7 audit verified):
Nav, Hero, Receipt, How it works, Sandbox (reorder and vendor highlight), Offer (two columns),
FAQ, Footer note.

| State | What the user sees |
|---|---|
| Default | Hero chart plays the flip once when half of it is on screen. Hero buttons: *Watch it check a tender* (primary), *Recheck a tender for free* (secondary). |
| Reduced motion, no `IntersectionObserver`, no JS, prerender, jsdom | Final chart at once. `index.html` carries a `<noscript>` style that shows every `data-flip-part`. |
| Sample is `answer_key` | Hero label adds "· test extraction". `check:launch` fails until the sample is a live, verified run. |
| `VITE_CONTACT_EMAIL` unset | The offer renders no button and no address. `check:launch` fails. |
| Hero buttons off screen | The nav's recheck button fills (primary). Back on screen it outlines again. |
| Modal open | Audit modal in replay mode (below). Focus trapped, Esc closes, focus returns to the opener. |
| Phone at 375 × 812 and 390 × 844 | The whole flip including "1st → 3rd" fits the first screen. At 360 × 740 it ends 858 px down (known). |

## `/b/:shareId` Brief

Data states, from `pages/Brief.tsx`:

| State | Trigger | UI |
|---|---|---|
| Loading | query pending | `aria-busy` paragraph |
| Ready | 200 | masthead, verdict, flip, leveling table, findings, rate sliders, check grid, method |
| Unavailable | 404 (unknown or unverified share ID, same page for both) | "not available" title and body, `noindex` |
| Unreachable | network error or non-404 server error | error `Banner` with a retry action; if a brief was already loaded it stays visible |
| Re-pricing | slider moved | last good totals stay; request debounced 150 ms; a failed request leaves the old totals |

Selection (the open footnote) lives in the URL hash `#f-{vendor_id}-{param_id}`.

| Width | Evidence |
|---|---|
| ≥ 960 px | sticky right margin (`Sidenote`) |
| < 960 px | bottom sheet (`BottomSheet`, dialog semantics) |
| Print | one column, endnotes for every footnote, no sliders (`print.css`) |

Sidenote content and per-section detail: spec §7.3.

## `/review` Review index

| State | Trigger | UI |
|---|---|---|
| Gated | no stored token, or 401 | `TokenGate` ("That token didn't work." after a refusal) |
| Not configured | 503 | error banner: the server has no review token |
| Loading | query pending after submit | gate stays until the first answer |
| Empty | zero tenders | empty state sends focus to the *Run ingest* folder field |
| List | 200 | table: ID, title, status, open items, ingested, verified, link |
| Ingest running | *Run ingest* submitted | audit modal in live mode, then navigate to `/review/{id}` |

Token lives in `sessionStorage` only (`review/token.ts`), never in the URL.

## `/review/:tenderId` Review brief

Same as the brief plus:

| State | UI |
|---|---|
| Gated, not configured | as the index |
| Missing (404) or unreachable | the generic "can't reach the server" error banner with a retry button. A 404 has no message of its own yet (gap, see below). |
| DRAFT | banner "Draft. Only you can see this."; `OverrideForm` in the sidenote; *Mark verified* disabled with "Resolve {n} open items first" |
| VERIFIED | banner with *Copy share link* and *Withdraw brief*; `OverrideForm` locked ("Withdraw the brief before changing overrides") |
| Verify refused | 409 with the open items listed |
| Re-ingest | confirmation dialog when the target tender is verified or has overrides (`ReingestConfirm`, decided by the target's state, not the open brief's) |
| Re-ingested | banner after a completed live job; dropped when an override is saved |

## Audit modal

| Mode | Source | Behaviour |
|---|---|---|
| Replay | brief data, `domain/replay.ts` | Six stages, chip "Recorded run". Timing from `stage_log` scaled to 8 s with a "shown at ×" footer, or fixed pace with no timing claim. Reduced motion renders all stages done. |
| Live | `POST /api/jobs/ingest`, poll `GET /api/jobs/{id}` every 750 ms | Chip "Live run". Backend stages map to the same six labels. A job with an unknown stage stays "running" at the last known stage. FAILED with an unknown stage still shows the failure. |

Controls: *Skip to result* always available, *Watch again*, *Open the brief* (to the VoltSwitch
contradiction footnote). `recordedAt` can be null on drafts.

## Legal and not found

`Legal` renders a small markdown converter over the two content files. While a file starts with
`FOUNDER-TO-SUPPLY`, `check:launch` fails. `NotFound` is a heading and a link home.

## Known gaps

- `/review/:tenderId` shows the "can't reach the server" banner for an unknown tender ID. A
  "no such tender" message would be truer. Needs a copy line in spec §10 first.

## Per-screen test coverage

| Screen | Unit | e2e (`web/e2e`) |
|---|---|---|
| Landing | `Landing.test.tsx`, component tests | `1-landing.spec.ts`, `a11y.spec.ts`, `keyboard.spec.ts` |
| Brief | `Brief.test.tsx`, `evidence.test.tsx` | `2-brief.spec.ts`, `mobile.spec.ts` |
| Review | `Review.test.tsx`, `OverrideForm.test.tsx` | `3-review.spec.ts` (runs last, mutates state) |
| Modal | `AuditModal.test.tsx` | `1-landing.spec.ts` |
