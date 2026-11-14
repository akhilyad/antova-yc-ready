# Antova frontend: design spec

Date: 2026-11-05
Branch: `worktree-web-frontend` (worktree of the antova_backend repo, base `8697b26`)
Status: awaiting founder review

## 1. Summary

Build the Antova web frontend: a public landing page, a replayed "audit" modal, and a shareable evidence brief for a bid evaluation, plus a founder-only review mode that moves a brief from draft to verified. It is a Vite + React + TypeScript app in `web/` that talks to the existing Antova FastAPI backend. Two backend changes ship with it: share links that can't be guessed (closing a data leak) and a draft → verified state with adder overrides.

The YC demo moment is the audit modal landing on the verified brief, opened at the footnote where VoltSwitch's cover letter claims 50 kA / 3 s and its own drawing says 31.5 kA / 1 s.

## 2. Ground truth this design is built on

- **Product.** Antova (codename Antova) evaluates heavy electrical equipment bids. Input: a spec (material requisition, "MR") plus 3–5 vendor bid PDFs. The ingest pipeline (`antova_ingest`) parses pages, asks the model to locate the quote that answers each requirement, verifies each quote appears verbatim on its page, reads values, checks them with Pint, resolves document precedence (drawing over cover letter), and prices each gap from a rate table. `antova_engine.evaluate_vendor_financials` computes evaluated price = bid price + technical adders + commercial adders.
- **Sample tender `TENDER-2026-402`** (33 kV GIS switchgear) is synthetic: `samples/generate_sample_pack.py` generates the PDFs; vendors Nordwerk, VoltSwitch and Deltaport are fictional. Running the real pipeline on it (offline, with the test answer-key locator) gives:

  | Bidder | Bid price | Tech adders | Commercial adders | Evaluated |
  |---|---|---|---|---|
  | Nordwerk Schaltanlagen GmbH | €452,000 | €0 | €0 | **€452,000** |
  | Deltaport Skid Consortium B.V. | €439,000 | €10,300 | €4,700 | €454,000 |
  | VoltSwitch Industrial | €418,000 | €49,000 | €15,800 | €482,800 |

  116 pages, 12 drawing sheets, 36 quotes accepted / 0 rejected, 39 checks, 10 non-compliant cells. Deltaport's ambient rating "104 °F" passes the 40 °C requirement after Pint conversion.
- **Backend today.** `GET /api/tender` falls back to the latest ingested tender when no ID is given; there is no authentication; tender IDs are readable (`^[A-Z0-9-]{1,64}$`). No tender list, no upload endpoint. PDF export summary figures are hard-coded. CORS is `allow_origins=["*"]` with credentials.
- **Data states the UI must show honestly.** `pricing_status`: `PRICED`, `UNPRICED` (gap found, no rate: adder €0), `NONE`. `status`: `COMPLIANT`, `DEVIATION_DOWNGRADE`, `DEVIATION_UPGRADE`, `CONFLICT_DOWNGRADE`, `OMITTED`, `MANUAL_INSPECTION_REQUIRED`. A vendor's `headline_price` of 0 means the bid price wasn't found.
- **Stale material, not product truth.** `antova/PRODUCT.md` and `antova/DESIGN.md` describe an older carbon-emissions product. The `antova/*.png` shots and `antova_landing.jsx` are the earlier dark bid-evaluation concept; its ROI figures (149x) come from blueprint assumptions, and its audit modal ended in `alert()`. The `antova/` folder is left untouched.

## 3. Users and success criteria

- **Prospect** (package engineer or procurement director at an EPC, DACH first). Arrives through a share link after a manual "re-check" of a tender they already awarded, or through the landing page. Success: understands within 10 seconds that the cheapest bid wasn't the cheapest, and can open the vendor's own sentence and page behind any euro.
- **Founder** (solo, runs re-checks by hand: prospect emails PDFs, founder ingests by CLI, reviews, sends a link). Success: can check citations, override a wrong or missing adder with a note, and only then publish a brief.
- **YC partner** watching the demo. Success: follows the reversal (€418,000 → €482,800) without knowing the domain, and sees that numbers come from code and pages, not the model.

Done means: the three flows below work end to end against the real backend, pass the test suite, meet WCAG 2.2 AA, and never show a number that doesn't trace to the data.

1. Landing → *Watch it check a tender* → replay → *Open the brief* → brief at footnote 1.
2. Share link → brief → footnote → sidenote with quotes, page crop, checks and arithmetic → sliders re-price.
3. Founder → review token → draft brief → override an adder → mark verified → copy share link.

## 4. Decisions

| Decision | Choice | Why |
|---|---|---|
| Visual direction | **Footnote**: an evidence brief on warm paper, one oxblood accent (serif numerals until session 7, now Geist only) | The pitch is literally about footnotes; reads like a document a buyer forwards; picked over Redline (drafting sheet) and Annunciator (dark HMI) |
| Brief layout | **Brief with sidenotes**: verdict and tables in the main column, evidence in a sticky right margin; full check grid lower down | Evidence sits beside the number it explains; picked over single-column and matrix-first |
| App structure | **Wizard-first, no dashboard** (LLM council verdict, 5/5 peer reviews agreed on the leak finding) | One tender exists; a one-row dashboard or invented rows would break "every number traces to a source"; the brief is the deliverable |
| Audit modal | **Labelled replay** of a recorded run on the public sample; live ingest only in review mode | A live LLM run can stall on stage and costs money if exposed publicly |
| Scope additions | Fix the tender-ID leak; draft → verified review with overrides | Founder-selected from council recommendations |
| Deferred | PDF export rework, German UI, dashboard/Ledger, upload, negotiation rounds | Founder-selected; council: wait for ~5 real re-checks |
| ROI sandbox | Replaced by a **sensitivity sandbox** (copper, labour, freight) using the real formula | The old ROI numbers weren't produced by the backend |
| Lead capture | **Pre-filled email** (mailto) plus copyable address | Matches the manual re-check; zero backend |
| Build approach | **One Vite + React app**, landing prerendered at build time | One design system and test setup; SEO for the landing page |

## 5. Architecture

### 5.1 Repository layout

```
antova_backend/                      (repo root; .gitignore gains `!/web/`)
  web/
    package.json, vite.config.ts, tsconfig*.json, playwright.config.ts, index.html
    PRODUCT.md, DESIGN.md      (Antova bid-evaluation truth; replaces nothing in antova/)
    public/fonts/              (superseded: Geist Variable is bundled from @fontsource-variable/geist, see src/design/fonts.css)
    scripts/prerender.ts       (renders `/` to static HTML after `vite build`)
    scripts/snapshot-sample.ts (fetches the public sample brief into src/generated/)
    src/
      main.tsx, router.tsx, entry-server.tsx
      api/        client.ts, schemas.ts (zod), queries.ts (TanStack Query hooks)
      domain/     leveling.ts, verdict.ts, footnotes.ts, money.ts, replay.ts, status.ts, ranking.ts
      design/     tokens.css, fonts.css, base.css, print.css
      components/ (see §8)
      pages/      Landing, Brief, ReviewIndex, ReviewBrief, NotFound
      generated/  sample-brief.json (committed snapshot, carries `snapshot_at`)
      test/       fixtures/ (generated from the pipeline), msw/, parity/
    e2e/          Playwright specs
  antova_api.py, antova_db.py, antova_engine.py, ...   (backend changes, §6)
```

### 5.2 Stack

- Vite, React 19, TypeScript (strict), React Router.
- TanStack Query for server state; zod validates every API response at the boundary so backend drift fails loudly.
- Plain CSS with custom properties (tokens) and CSS modules. No utility framework.
- Charts: hand-built SVG components (two small charts don't justify a chart library).
- Motion: CSS transitions plus Motion (`motion/react`) for the modal stage sequence and the sidenote swap.
- Fonts self-hosted (Google Fonts served from Google's CDN has been ruled a GDPR violation in Germany).
- No analytics, no cookies: no consent banner needed.

### 5.3 Routes

| Route | Who | What |
|---|---|---|
| `/` | Public | Landing page, prerendered from `src/generated/sample-brief.json` |
| `/b/:shareId` | Public | Verified brief. Unknown or unverified IDs render the same "not available" page |
| `/review` | Founder | Token gate, then the list of ingested tenders with status |
| `/review/:tenderId` | Founder | The brief in draft mode with review controls; can start a live ingest |
| `*` | Public | Not found |

The audit modal is an overlay on `/` (and on `/review/:tenderId` for live runs), not a route.

### 5.4 Configuration

- Frontend: `VITE_API_BASE` (empty in dev; Vite proxies `/api` to `http://127.0.0.1:8000`), `VITE_SAMPLE_SHARE_ID`, `VITE_CONTACT_EMAIL`.
- Backend: `ANTOVA_REVIEW_TOKEN` (required; founder endpoints return 503 if unset), `ANTOVA_ALLOWED_ORIGINS` (comma-separated; replaces `*`), existing `ANTOVA_TENDERS_DIR`.

## 6. Backend changes

All backend work is test-first (pytest), keeping the existing 228 tests green or updating them where behaviour intentionally changes.

### 6.1 Schema v3 (migration from v2)

`tenders` gains:

| Column | Type | Notes |
|---|---|---|
| `share_id` | `String(32)`, unique, not null | `secrets.token_urlsafe(16)`, assigned at first ingest, kept on re-ingest |
| `status` | `String(16)`, not null, default `DRAFT` | `DRAFT` or `VERIFIED` |
| `verified_at` | `DateTime`, nullable | |
| `ingest_mode` | `String(16)`, not null | `answer_key`, `replay` or `live`. An `auto` run records `replay` if every locate response came from the saved store, otherwise `live` |
| `synthetic` | `Boolean`, not null, default false | From optional `"synthetic": true` in `manifest.json`; the sample sets it |
| `ingest_stats` | `Text` (JSON) | The pipeline's `stats` dict (documents, pages, sld_sheets, candidates accepted/rejected, rules_evaluated, deviations_found, duration_s) |
| `stage_log` | `Text` (JSON) | `[{stage, pct, t_ms}]` recorded by the job's progress callback |

New table `adder_overrides`: `tender_id`, `param_id`, `vendor_id` (composite key), `adder_eur` (Decimal as string, ≥ 0), `note` (non-empty), `created_at`.

Re-ingesting a tender resets it to `DRAFT`, clears its overrides (logged in the job result), and keeps `share_id`.

### 6.2 Engine

`evaluate_vendor_financials` takes an optional `overrides: dict[(param_id, vendor_id), Decimal]`. An override replaces the computed adder for that cell; sliders never scale it. Each itemized row gains `is_overridden` and `override_note`. Overridden `UNPRICED` and `MANUAL_INSPECTION_REQUIRED` cells count as resolved.

### 6.3 Public endpoints (no token; verified briefs only)

| Method | Path | Returns |
|---|---|---|
| GET | `/api/briefs/{share_id}` | `{share_id, status, verified_at, synthetic, ingest_mode, ingest_stats, stage_log, tender, financials, overrides}`. 404 if unknown or not `VERIFIED` |
| POST | `/api/briefs/{share_id}/evaluate` | Body: `{copper_multiplier, site_labor_rate, freight_multiplier}` (same bounds as today). Returns `{financials}` with overrides applied |
| GET | `/api/briefs/{share_id}/evidence/{param_id}/{source}/{which}.png` | Page crop for one stored citation. `source` is a vendor ID or `mr`; `which` is `primary` or `secondary` |

Evidence crop hardening: the server looks up the citation itself (no client-supplied filename, page or bbox); the file must be a `source_documents` row of that tender inside `ANTOVA_TENDERS_DIR/<tender_id>/`; the crop is the cited bbox padded by 24 pt, clamped to the page, rendered with PyMuPDF at 2× zoom, max 1600 px wide, with a 1.5 pt oxblood rectangle around the cited box. Results are cached in-process (LRU, 128 entries). Missing file → 404, and the client falls back to text.

### 6.4 Founder endpoints (header `X-Antova-Review-Token`)

Token compared with `hmac.compare_digest`; never logged; 401 on mismatch, 503 if the server has no token configured.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/review/tenders` | `[{tender_id, title, status, share_id, ingested_at, verified_at, open_items}]` |
| GET | `/api/review/tenders/{tender_id}` | Same shape as the public brief, any status, plus `open_items` |
| POST | `/api/review/tenders/{tender_id}/evaluate` | Same as public evaluate, any status |
| PUT | `/api/review/tenders/{tender_id}/overrides/{param_id}/{vendor_id}` | `{adder_eur, note}`; validates the cell exists |
| DELETE | `/api/review/tenders/{tender_id}/overrides/{param_id}/{vendor_id}` | Remove an override |
| POST | `/api/review/tenders/{tender_id}/verify` | 409 with the open items if any remain |
| POST | `/api/review/tenders/{tender_id}/withdraw` | Back to `DRAFT`; the share link 404s until verified again |
| GET | `/api/review/tenders/{tender_id}/evidence/...` | Same crop as public, any status |

**Open items** (block verify): cells with `pricing_status == UNPRICED` and no override; cells with `status == MANUAL_INSPECTION_REQUIRED` and no override; vendors with `headline_price == 0` (message: bid price not found; fix the source and re-ingest).

### 6.5 Existing endpoints

`/api/tender`, `/api/evaluate`, `/api/jobs/ingest`, `/api/jobs/{id}`, `/api/negotiate/turn`, `/api/audit-trail`, `/api/export-pdf`, `/api/cache/*` now require the review token, and `tender_id` becomes mandatory (no fallback to the latest tender). `/api/health` stays public but drops `active_tender`. The WebSocket stays as is and is not used by the new frontend (job progress is polled). The legacy `antova_interactive_mvp.html` UI stops working on this branch; `main` is untouched.

CORS: `allow_origins` from `ANTOVA_ALLOWED_ORIGINS`; `allow_credentials=False` (the token travels in a header, not a cookie).

### 6.6 Dev seed

`python -m antova_ingest.dev_seed` ingests `samples/TENDER-2026-402` with the test answer-key locator, records `ingest_mode = answer_key`, marks it verified and prints its share ID. It exists for development and tests only. The public sample shown on the live site must come from a live the model ingest (`--mode live`), reviewed and verified by the founder.

## 7. Frontend behaviour

### 7.1 Landing (`/`)

Prerendered from the committed sample snapshot. Order:

1. **Nav**: Antova wordmark · How it works · Sample brief · *Re-check a tender* (scrolls to the offer).
2. **Hero**: H1 "The cheapest bid wasn't the cheapest." Lede (copy deck). `RankingFlip` of the sample. Buttons: *Watch it check a tender* (opens modal), *Read the sample brief* (goes to `/b/{sample}`). A visible sample label: "Sample tender · synthetic documents, fictional vendors".
3. **The footnote**: one evidence card for VoltSwitch PARAM-01: the cover-letter claim struck through, Drawing Note 7 quoted, "+€18,500", link to that footnote in the brief.
4. **How it works**: Read → Check → Price, with the real examples (verbatim-quote rule, 104 °F → 40 °C, 11 bays × €1,600 + €900).
5. **Sensitivity sandbox**: three sliders; bars of evaluated price (bid + technical + commercial segments) re-sort live. Computed client-side by `leveling.ts` on the snapshot.
6. **The offer**: "We re-check a tender you already awarded. Free, within 24 hours." What to send, what comes back. mailto button plus the address as copyable text.
7. **FAQ**: only answers true today (copy deck §10).
8. **Footer**: Impressum and Privacy links (pages with founder-supplied content), sample disclaimer.

If the snapshot's `ingest_mode` is `answer_key`, the hero sample label adds "· test extraction", so a not-yet-live sample can never pass as a real run.

### 7.2 Audit modal (replay)

- Header: "Replay: checking TENDER-2026-402", chip "Recorded run".
- Left: `DocCard`s for the inputs (spec + bids, page counts from `source_documents`).
- Right: `StageList`, six plain-language stages, each revealing a finding derived from the brief data (`domain/replay.ts`):
  1. Reading the documents — "4 documents, 116 pages, 12 drawing sheets"
  2. Finding the evidence — "36 quotes located"
  3. Checking each quote is on its page — "36 of 36 found word for word"
  4. Reading the values — a unit conversion from the checks (`offered` ≠ `offered_canonical`), preferring one where the unit itself changes rather than only its prefix (so "Deltaport: 104 °F → 40 °C" beats "VoltSwitch: 36,000 V → 36 kV"); first in vendor/parameter order breaks ties; stage shows "values read" alone if there is none
  5. Settling contradictions — the first conflict, e.g. "VoltSwitch: cover letter p.2 says 50 kA; drawing p.11 says 31.5 kA. The drawing governs."
  6. Pricing the gaps — "10 gaps priced. VoltSwitch +€64,800."
- Timing: if `stage_log` exists, real stage durations are scaled to fit 8 s and the footer states "Recorded {date}; the run took {n} s; shown at {x}× speed". Without a log, stages advance at a fixed pace and no timing claim is shown.
- End: primary *Open the brief* → `/b/{sample}#f-vendor-b-PARAM-01`; secondary *Watch again*. *Skip to result* is always available; Esc closes.
- Reduced motion: all stages render complete at once.
- Review mode ("Live run" chip): `POST /api/jobs/ingest`, poll `GET /api/jobs/{id}` every 750 ms, map backend stages (Intake, Parse, Locate, Verify citations, Read values, Resolve precedence, Price) to the same six plain labels, show findings when the job completes, then reload the draft brief. Failure shows the stage and error message.

### 7.3 Brief (`/b/:shareId`, and `/review/:tenderId` in draft mode)

Main column, top to bottom:

1. **Masthead**: kicker "Verified brief · TENDER-2026-402"; title; client; meta line (spec reference · pages read · checks · gaps · verified date). Sample/synthetic and test-extraction labels when applicable.
2. **Verdict**: one sentence from `domain/verdict.ts` (variants in §10), then a caveat line when open items exist.
3. **RankingFlip**: bid order vs evaluated order.
4. **LevelingTable**: Bidder · Bid price · Technical gaps · Commercial gaps · Evaluated price · Requirements met (`CheckStrip` + "2 of 8").
5. **Findings**: per bidder, a heading ("VoltSwitch Industrial · 6 gaps · +€64,800") and one row per footnoted cell: number, requirement name, offered value, `StatusTag`, adder.
6. **Adjust the rates**: three `SensitivitySlider`s; totals re-price via the evaluate endpoint (debounced 150 ms); last good values stay visible while a request is in flight or fails.
7. **All checks**: `CheckGrid`, "8 requirements × 3 bidders". Every cell opens its sidenote, including compliant cells.
8. **How this brief was made**: rate table version and effective date; each adder's cost lines with their driver; "The model located quotes. Code checked units and did every sum."; ingest mode.

**Footnotes and sidenotes**

- Every cell has a stable anchor `#f-{vendor_id}-{param_id}`. Display numbers (¹, ², …) are derived (`domain/footnotes.ts`): order by vendor position then parameter position; numbered cells are those not `COMPLIANT`/`DEVIATION_UPGRADE`, plus overridden cells. Numbers can change; anchors never do.
- The sidenote for the selected cell shows: **Your spec** (requirement quote + MR page) · **The bid says** (governing quote + page + section) · **Also in the bid** (the contradicted quote, struck through, with "The {drawing} governs over the {cover letter}") · **On the page** (`PageCrop`) · **Checks** (`CheckRow`s: ✓/✗, field, required, offered, canonical value) · **How it's priced** (cost lines: qty × rate = amount; driver; override note when overridden).
- Default selection: the first numbered cell of the apparent low bidder when the verdict is a reversal; otherwise the first numbered cell; otherwise none (the margin shows how to read the brief).
- Selection lives in the URL hash. ≥ 960 px: sticky right margin. < 960 px: bottom sheet (`Dialog` semantics).

**Review mode additions** (`/review/:tenderId`):

- Banner: "Draft. Only you can see this." (or "Verified · shared" with *Copy share link* and *Withdraw brief*).
- Highlight cells with confidence < 0.95, conflicts, unpriced and needs-inspection items.
- `OverrideForm` in the sidenote: euro amount + required note; *Save override* / *Remove override*.
- *Mark verified*: disabled with "Resolve {n} open items first" while open items exist; confirmation dialog states the consequence; on success shows and copies the share link.
- *Run ingest*: opens the modal in live mode.

### 7.4 Review index (`/review`)

`TokenGate` (stored in `sessionStorage`, cleared by *Sign out of review*), then a table of tenders: ID, title, status, open items, ingested, verified, link to review. *Run ingest* takes a tender folder ID (validated against the backend's `^[A-Z0-9-]{1,64}$`) and a mode (`replay`, `auto`, `live`), then opens the modal in live mode and navigates to `/review/{id}` when the job completes. Empty state per copy deck.

### 7.5 Print

`print.css` turns the brief into the forwardable document: single column, sliders and interactive chrome hidden, every footnote's sidenote content rendered in order as endnotes (quotes, pages, checks, arithmetic; crops included when loaded), URL and verified date in the footer, A4 margins.

## 8. Design system

### 8.1 Tokens

Colour (WCAG contrast on paper `#FBFAF6` in brackets):

| Token | Value | Use |
|---|---|---|
| `--paper` | `#FBFAF6` | Page |
| `--surface` | `#FFFFFF` | Sidenote, crops, inputs |
| `--band` | `#F3EFE6` | Section bands, slider track fill |
| `--ink` | `#16130F` (17.7:1) | Text, ✓ marks, focus ring |
| `--ink-2` | `#4A443C` (9.2:1) | Secondary text |
| `--ink-3` | `#675F55` (6.0:1) | Labels, captions (5.3:1 on wash) |
| `--rule` | `#E4DFD4` | Decorative dividers only |
| `--edge` | `#8F877A` (3.4:1) | Control boundaries: inputs, slider track, checkbox |
| `--ox` | `#9E2B1F` (7.1:1) | Gaps, hidden cost, footnote markers, ✗ |
| `--ox-wash` | `#F7EAE6` | Background of gap cells |

Rule: **colour appears only when something is wrong.** Passing items are ink. No green anywhere.

Type (amended session 7): Geist Variable only, no italic. Tabular lining figures for every number. Scale 12 · 14 · 16 · 18 · 20 · 24 · 30 · 36 · 48 · 60 px; body 16 px; nothing under 12 px except superscript footnote markers. `src/design/tokens.css` is authoritative.

Spacing (amended session 7): 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96 px only. Radius: 2 px paper objects, 6 px buttons and inputs, 999 px tags. Shadow: one soft elevation for the sidenote and dialog.

Motion (amended session 7): `--duration-hover` and `--duration-swap` 300 ms, `--duration-settle` and `--duration-stamp` 500 ms, `--duration-reveal` 700 ms (unused on the landing). Easing `cubic-bezier(0.22, 1, 0.36, 1)`. Nothing under 200 ms. `prefers-reduced-motion: reduce` removes all of it. See `docs/ui/motion-and-interaction.md`.

Money format: `€482,800` (en-GB grouping, matching the bid documents' own format so quotes and figures agree); adders `+€18,500`; struck prices for superseded bid ranks. German formatting arrives with the deferred DE locale.

### 8.2 Components

Each defines default, hover, focus-visible, active, disabled, loading and error states where relevant.

| Component | Notes |
|---|---|
| `Button` | primary (ink fill), secondary (outline), link |
| `FootnoteRef` | superscript link to `#f-…`; selected state underlined in oxblood |
| `Sidenote` / `BottomSheet` | sticky margin ≥ 960 px; modal sheet below |
| `Quote` | variants: requirement, governing, superseded (struck) |
| `PageCrop` | skeleton → image → text fallback |
| `CheckRow` | ✓/✗ + field + required + offered + canonical |
| `StatusTag` | glyph + word: Meets spec ✓ · Gap ✗ · Contradiction ⇄ · Missing ∅ · Exceeds spec ↑ · Unpriced €? · Needs inspection ! |
| `MoneyFigure` | headline, struck, adder, total |
| `CheckStrip` | 8 marks + text equivalent |
| `LevelingTable`, `CheckGrid` | real `<table>`s with `th`/`scope` |
| `RankingFlip` | SVG slope chart; the line of a bidder whose rank worsens is oxblood; text alternative lists both orders |
| `SensitivitySlider` | native range input; value + unit announced; reset |
| `VerdictSentence` | renders `verdict.ts` output |
| `StageList`, `DocCard` | modal parts; pending / active / done / failed |
| `Dialog` | focus trap, Esc, return focus |
| `Banner` | draft, verified, replay, error |
| `TokenGate`, `OverrideForm` | review mode |

## 9. Domain logic (`web/src/domain`, test-first)

- `leveling.ts`: TypeScript port of the engine. Adder = sum of cost lines (`fixed`: qty × rate; `copper`: qty × rate × copper; `labour`: hours × labour rate; `freight`: qty × rate × freight), rounded half-up to cents with decimal arithmetic (integer cents, no float sums); legacy cells without lines use `cost_adder`; overrides replace the adder and ignore sliders; commercial vs technical by criticality. **Parity:** a Python script exports golden cases (the sample tender × a grid of slider values × with/without overrides) computed by `antova_engine`; the TS tests must match to the cent. The script runs in CI so drift fails the build.
- `verdict.ts`: picks the variant and fills it (§10); handles reversal, no reversal, no gaps at all, ties, missing bid prices, open items.
- `ranking.ts`: bid order vs evaluated order, rank changes, ties.
- `footnotes.ts`: stable anchors, derived numbers, default selection.
- `replay.ts`: builds the six stages and findings from a brief; scales `stage_log` timings to ≤ 8 s.
- `money.ts`: formatting; `status.ts`: status → tag glyph, word, severity.

## 10. Copy deck

Terms used everywhere: **bid**, **spec** (first mention: "spec (material requisition)"), **gap** (any shortfall against the spec that costs money to close), **evaluated price** ("the bid plus what it costs to close every gap"), **brief**, **footnote**.

**Landing**
- H1: "The cheapest bid wasn't the cheapest."
- Lede: "Antova reads each bid against your spec, prices every gap, and footnotes each euro to the page it came from."
- Buttons: "Watch it check a tender" · "Read the sample brief"
- Sample label: "Sample tender · synthetic documents, fictional vendors"
- Evidence card: "The cover letter says 50 kA for 3 s." (struck) · "The drawing says 31.5 kA for 1 s." · "The drawing governs. Upgrading 11 bays: +€18,500."
- How it works: **Read.** "For each requirement in your spec, Antova finds the sentence in each bid that answers it, and keeps its page and position." **Check.** "Code compares the values, not the model. 104 °F becomes 40 °C before it meets your 40 °C limit. A quote that isn't on its page word for word is thrown out." **Price.** "Each gap is priced from a rate table you can read: 11 bays × €1,600 + €900 type-test documents." Line: "The model finds quotes. Code does the maths."
- Sandbox: heading "Change the rates, watch the ranking"; labels "Copper price ×{n}", "Site labour €{n}/h", "Freight ×{n}"; "Reset rates"; note "Same formula as the brief."
- Offer: heading "We re-check a tender you already awarded. Free, within 24 hours." Body: "Send the spec and the bids you evaluated. You get back a brief like the sample, with every gap priced and footnoted. Nothing is sent to your vendors." Button: "Email us your tender". Under it: "Or write to {address}".
- mailto subject: "Re-check request: {equipment} tender"; body: "Equipment type:\nPackage value (range):\nNumber of bids:\nPlease attach the spec (MR) and the bid PDFs."
- FAQ:
  - "Which equipment does Antova cover?" — "Medium-voltage gas-insulated switchgear today. Each equipment type needs its own requirement list and rate table. Ask if yours isn't covered."
  - "What if Antova gets something wrong?" — "Every number links to the page it came from, and a person checks each brief before it's sent. Tell us what you'd dispute and we'll correct the brief."
  - "Who sees my documents?" — **needs founder sign-off** (see §13): must state factually that page text is sent to Anthropic's LLM API to locate quotes, and the retention policy.

**Modal**: title "Replay: checking {tender_id}"; chip "Recorded run" / "Live run"; stage labels as §7.2; "Skip to result"; "Open the brief"; "Watch again"; timing footer per §7.2; failure "Stopped at {stage}: {error}. Nothing was saved." with "Try again".

**Verdict variants** (`verdict.ts`)
- Reversal: "{low} bid {low_bid}, the lowest. With its gaps priced in, it costs {low_eval}. {winner} is the lowest evaluated bid at {winner_eval}."
- Low bid holds: "{low} is the lowest bid at {low_bid} and stays lowest once its gaps are priced: {low_eval}."
- No gaps: "All {n} bids meet the spec as written. {low} is the lowest at {low_bid}."
- Tie: "{a} and {b} tie at {eval} evaluated."
- Missing price: excluded from ranking, with "{vendor}'s bid price wasn't found in its documents."
- Caveat: "This excludes {k} unpriced gap(s) and {m} item(s) that need inspection." (only the non-zero parts)

**Brief**: kicker "Verified brief · {tender_id}"; table headers "Bidder · Bid price · Technical gaps · Commercial gaps · Evaluated price · Requirements met"; findings heading "What we found in each bid"; sidenote sections "Your spec · The bid says · Also in the bid · On the page · Checks · How it's priced"; superseded note "The {governing section} governs over the {other section}."; grid heading "All checks: {r} requirements × {b} bidders"; method heading "How this brief was made".

**Errors and empty states**
- Brief unavailable (unknown or unverified): "This brief isn't available." / "The link may be mistyped, or the brief hasn't been shared yet. Ask the person who sent it for a new link."
- API unreachable: "Can't reach Antova right now. The figures shown are from the last successful load." / "Try again"
- Re-price failed: "Couldn't re-price. Showing the last prices."
- Crop failed: "Page image unavailable. The quote above is exact."
- 404: "Page not found." / "Go to the home page"

**Review**
- Token gate: "Review access" · "Review token" · help "Set as ANTOVA_REVIEW_TOKEN on the server." · "Continue" · error "That token didn't work."
- Draft banner: "Draft. Only you can see this."
- Open items: "{n} items need you before this can be verified."
- Override: "Override adder (€)" · "Why" (placeholder "e.g. engineer's estimate after vendor clarification") · "Save override" · "Remove override" · badge "Overridden: {note}"
- Verify: "Mark verified" · disabled "Resolve {n} open items first" · dialog "Share this brief?" / "Anyone with the link will see vendor names and prices." / "Mark verified" · "Keep as draft" · success "Verified. Share link copied."
- Withdraw: "Withdraw brief" · dialog "Withdraw this brief?" / "The share link will stop working until you verify it again." / "Withdraw" · "Keep shared"
- Review index empty: "No tenders yet. Ingest one with `python -m antova_ingest.run <folder>` or *Run ingest*."

All user-facing copy goes through `unslop` before merge.

## 11. Accessibility (WCAG 2.2 AA)

- Contrast as in §8.1; focus ring 2 px ink with 2 px offset on every interactive element.
- Keyboard: `FootnoteRef`s are links in reading order; Enter selects and moves focus to the sidenote heading; Esc returns focus to the ref; grid cells are links; sliders are native ranges with arrow/page/home/end keys.
- `Dialog` and `BottomSheet`: focus trap, labelled by their heading, return focus on close.
- Text equivalents: `RankingFlip` (both orders as a list), `CheckStrip` ("2 of 8 requirements met"), `PageCrop` alt text = the quote.
- Status never by colour alone (glyph + word). Struck quotes are also labelled "Contradicted:" for screen readers.
- Live regions: re-priced totals announce politely ("VoltSwitch evaluated price €486,940"); modal stage changes announce.
- Targets ≥ 24 × 24 px; layout works at 320 px width and 200 % zoom; `lang="en"`.

## 12. Error handling and edge cases

| Case | Behaviour |
|---|---|
| Share ID unknown or unverified | Same "not available" page; no difference in status code or timing that reveals existence |
| Brief API fails | Error banner with retry; landing never depends on the API at first paint |
| Evaluate fails or is slow | Keep last good financials, inline note, retry on next slider change |
| Crop 404 / fails | Quote text stands alone with the fallback note |
| Unpriced / needs inspection | Tag + caveat in the verdict; blocks verify until overridden |
| Bid price missing | Vendor shown, excluded from ranking, open item |
| Ingest job fails (review) | Modal shows failed stage and error; draft unchanged |
| Token wrong / missing server token | Gate error / "Review is not configured on this server" |
| Re-ingest | Back to draft, overrides cleared, banner explains |

## 13. Launch requirements (founder-supplied; not code)

1. Contact address for `VITE_CONTACT_EMAIL` (not inferred).
2. Impressum and privacy page content (required for a German-facing business site).
3. Sign-off on the "Who sees my documents?" answer (LLM API processing, retention).
4. One live the model ingest of the sample tender (`ANTHROPIC_API_KEY` set), reviewed and verified, so the public sample is not answer-key output.
5. Hosting choice for the static build and the API (Phase 5).

## 14. Testing strategy (detailed in the plan)

- **Backend (pytest, TDD):** schema v3 migration from v2; share ID generation and stability across re-ingest; public 404 rules; token gating (missing, wrong, unset server token); no latest-tender fallback anywhere; overrides in the engine; open items and verify/withdraw; evidence crop lookup, path containment and fallbacks; CORS origins; dev seed.
- **Domain (Vitest, TDD):** `leveling.ts` parity with Python golden cases; `verdict.ts` all variants; `ranking.ts`; `footnotes.ts`; `replay.ts`; `money.ts`.
- **Components (Vitest + Testing Library + MSW):** with fixtures generated from the real pipeline output; sidenote content, keyboard flow, review controls, error states.
- **End-to-end (Playwright)** against the real FastAPI + dev seed: the three flows in §3; keyboard-only footnote navigation; mobile width (390 px) bottom sheet; axe checks on `/`, `/b/:id`, `/review/:id`.
- **Visual verification:** desktop and mobile screenshots of each screen, console clean, network errors none.

## 15. Out of scope

PDF export rework (print stylesheet covers forwarding), German locale, tender dashboard / Ledger, file upload, negotiation rounds and clawback UI, the WebSocket telemetry, user accounts, analytics, rate-table source notes (follow-up: add a `source` field per rate in the JSON and show it in "How it's priced"), the `antova/` folder.

## 16. Follow-ups noted, not built

- Rate provenance in the rate table JSON.
- German UI and number formatting.
- A second real (anonymized) tender.
- Fixing the hard-coded PDF export totals.
- Revisit dashboard/list once ~5 real re-checks exist.
