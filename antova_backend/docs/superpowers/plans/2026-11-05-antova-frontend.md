# Antova Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Antova landing page, replay modal, shareable evidence brief and founder review mode on top of a backend that no longer leaks tenders.

**Architecture:** Backend first (schema v3, overrides in the engine, token-gated founder API, public share-ID API, evidence crops), then a Vite + React app in `web/` built bottom-up: API boundary (zod), pure domain logic (test-first, with Python parity), components, pages, prerender, end-to-end.

**Tech Stack:** Python 3.14, FastAPI 0.135, SQLAlchemy, PyMuPDF 1.27, pytest · Node 26, Vite, React 19, TypeScript strict, React Router, TanStack Query, zod, decimal.js-light, motion, @fontsource-variable (Newsreader, Instrument Sans), Vitest, Testing Library, MSW, Playwright, @axe-core/playwright.

**Spec:** `docs/superpowers/specs/2026-11-05-antova-frontend-design.md` (read it with this plan; section numbers below refer to it).

## Global Constraints

- Work only inside the worktree `C:\Users\akhil\Desktop\Antova\antova_backend\.model\worktrees\web-frontend` on branch `worktree-web-frontend`.
- Backend test command: `python -m pytest -q` (baseline 228 passing). It must stay green after every backend task.
- Frontend test commands (from `web/`): `npm test` (Vitest, run mode), `npm run typecheck`, `npm run lint`, `npm run e2e` (Playwright).
- `.gitignore` ignores every top-level path not whitelisted; Task 9 adds `!/web/`. New backend modules must be named `antova_*.py` or live in `antova_ingest/` to be tracked.
- Review header: `X-Antova-Review-Token`. Env: `ANTOVA_REVIEW_TOKEN`, `ANTOVA_ALLOWED_ORIGINS`, `ANTOVA_TENDERS_DIR`; frontend `VITE_API_BASE`, `VITE_SAMPLE_SHARE_ID`, `VITE_CONTACT_EMAIL`.
- Tests use review token `test-review-token` (set in `conftest.py`) and share ID `e2e-sample-share-id-000000` where a fixed ID is needed.
- Colour tokens, type scale, motion durations: exactly spec §8.1. Colour only marks something wrong; no green.
- Money: `€482,800`, adders `+€18,500` (spec §8.1). All sums in integer cents or Decimal, never float accumulation.
- User-facing strings: exactly spec §10, kept in `web/src/content/copy.ts`; run `unslop` over any new string before merge.
- WCAG 2.2 AA (spec §11). No text under 12 px except footnote superscripts. Every status shows glyph + word.
- No analytics, no cookies, no third-party font or script requests at runtime.
- Commits end with `Co-Authored-By: the locator model <noreply@anthropic.com>`.

## Review Focus

1. **Rapid slider drags** reorder evaluate responses; the newest settings must win. Test owned by Task 16 (`keeps the newest re-price when responses arrive out of order`).
2. **Stale or malformed share-link hashes** (`#f-garbage`, a cell that no longer exists after re-ingest) must fall back to the default footnote, not crash or show an empty margin. Tests owned by Task 13 (`ignores unknown anchors`) and Task 16 (`opens default footnote for unknown hash`).
3. **Override amounts typed the German way** (`18.500`, `1.600,00`) must be rejected with guidance, never stored as €18.50. Test owned by Task 17 (`rejects comma and three-digit-dot amounts`).
4. **Pasted review tokens with surrounding whitespace or a newline** must still work, and a wrong token must show the error rather than a blank page. Tests owned by Task 4 (`test_route_accepts_token_with_whitespace`) and Task 17 (`trims pasted token`, `shows error on 401`).
5. **Five-bidder tenders and long names/quotes** (the spec allows 3–5 bids) must keep the RankingFlip labels from overlapping and the table, grid and strip usable at 390 px. Tests owned by Task 13 (`layoutFlip separates close values`) and Task 16 (`renders five bidders`).

## Accessibility review of this plan (design:accessibility-review)

Twelve gaps found before build; each fix and its test belong to the named task (already written into those tasks' Step 1).

| # | Requirement | WCAG 2.2 | Task |
|---|---|---|---|
| 1 | Replay has Pause/Play; pausing stops the timer | 2.2.2 | 18 |
| 2 | *Mark verified* uses `aria-disabled` (stays focusable) with the reason linked by `aria-describedby` | 4.1.2, 1.3.1 | 17 |
| 3 | Check grid scroll container: `tabindex="0"`, `role="region"`, `aria-label` | 2.1.1, 1.4.10 | 16 |
| 4 | `scroll-padding-top` equals the sticky nav height; focused elements never hidden under sticky UI | 2.4.11 | 9, 21 |
| 5 | RankingFlip: worsened line is dashed and labelled with its rank change, not only oxblood | 1.4.1 | 15 |
| 6 | SensitivityBars: visually hidden ordered list of bidders and evaluated prices | 1.1.1 | 19 |
| 7 | FootnoteRef hit area ≥ 24 × 24 px via padding | 2.5.8 | 15, 21 |
| 8 | Skip link to `main`; landmarks `header/nav/main/aside/footer`; `document.title` per route | 2.4.1, 1.3.1, 2.4.2 | 9, 16 |
| 9 | Form errors: `aria-invalid` + `aria-describedby` on override amount, note and token | 3.3.1, 3.3.2 | 17 |
| 10 | Status glyphs `aria-hidden`; the word is the accessible name | 1.1.1 | 15 |
| 11 | Live regions mounted empty at load; announce final values only, never animation frames | 4.1.3 | 16 |
| 12 | Sliders carry `aria-valuetext` ("Copper price ×1.15", "Site labour €60 per hour") | 4.1.2 | 16 |

Manual pass after Task 21: NVDA on Windows through flows 1–3, and 200 % browser zoom on `/b/:id`.

## Testing strategy (engineering:testing-strategy)

| Layer | Tool | What | Target |
|---|---|---|---|
| Backend unit | pytest | migration v2→v3, repository, overrides in engine, open items, evidence lookup and containment | every new function; 100 % of branches in `antova_review.py`, `antova_auth.py`, `antova_evidence.py` |
| Backend HTTP | pytest + TestClient | token gating on every founder and legacy route, public 404 rules, verify/withdraw, CORS | every route × (no token, wrong token, right token) |
| Contract | pytest + Vitest | `export_fixtures` output is committed; pytest fails if regeneration differs; zod parses every fixture | fixtures for verified brief, draft brief with open items, review list, job states, parity cases |
| Frontend domain | Vitest | `leveling` (parity to the cent), `verdict`, `ranking`, `footnotes`, `replay`, `money`, `status` | 100 % lines |
| Frontend components | Vitest + Testing Library + MSW | sidenote content, keyboard flow, review controls, error and empty states, live regions | each component's states from spec §8.2 |
| End-to-end | Playwright vs real FastAPI + dev seed | the three flows of spec §3, keyboard-only footnotes, 390 px bottom sheet, axe on `/`, `/b/:id`, `/review/:id` | 0 axe violations (serious/critical) |

Existing gaps this closes: no test asserts tender isolation (the latest-tender fallback); the PDF export's hard-coded totals stay untested and out of scope; no frontend tests exist.

## File structure

Backend (repo root):
- Modify `antova_db.py` — schema v3 columns, `AdderOverrideRecord`, `TenderMeta`, repository methods, v2→v3 migration.
- Modify `antova_engine.py` — `Override`, overrides in `evaluate_vendor_financials`.
- Modify `antova_ingest/pipeline.py`, `antova_ingest/types.py`, `antova_ingest/tests/fakes.py`, `samples/scenario.py`, `samples/TENDER-2026-402/manifest.json` — stage log, ingest mode, synthetic flag.
- Create `antova_auth.py` — token dependency.
- Create `antova_review.py` — open items, brief payload.
- Create `antova_evidence.py` — citation lookup, path containment, crop rendering.
- Create `antova_briefs_api.py` (public router) and `antova_review_api.py` (founder router); modify `antova_api.py` to gate legacy routes, include routers, set CORS.
- Create `antova_ingest/dev_seed.py`, `antova_ingest/export_fixtures.py`.
- Tests: `antova_ingest/tests/test_db.py` (extend), `test_antova.py` (update), create `test_antova_review.py`, `test_antova_briefs.py`, `test_antova_evidence.py`, `antova_ingest/tests/test_dev_tools.py`.

Frontend (`web/`): `src/api` (boundary), `src/domain` (pure logic), `src/content` (copy, legal markdown), `src/design` (tokens, fonts, base, print), `src/components/{brief,charts,modal,review,ui}`, `src/pages`, `src/test` (fixtures, msw), `e2e/`, `scripts/`.

---

## Phase A — Backend

### Task 1: Overrides in the engine

**Files:**
- Modify: `antova_engine.py:132-181`
- Test: `antova_ingest/tests/test_engine.py`

**Interfaces:**
- Produces: `class Override(BaseModel): adder_eur: Decimal; note: str`. `evaluate_vendor_financials(tender, sensitivity, conceded_params, negotiating_vendor=None, overrides: Mapping[tuple[str, str], Override] | None = None)` (key `(param_id, vendor_id)`); each itemized row gains `"is_overridden": bool`, `"override_note": str | None`.

- [ ] **Step 1: Write failing tests:**
  - `test_override_replaces_adder_and_ignores_sliders` — `helpers.sample_tender()`, override `("PARAM-02", "vendor-b") → Override(adder_eur=Decimal("10000.00"), note="n")`, `copper_multiplier=2.0`: that row has `adder_eur == 10000.0`, `is_overridden is True`, `override_note == "n"`; vendor-b's evaluated price equals the same call without the override, minus that row's unoverridden adder, plus 10000.
  - `test_override_counts_by_criticality` — overriding a COMMERCIAL parameter moves the amount into `total_commercial_adder`.
  - `test_no_overrides_unchanged` — output with `overrides=None` equals the output of a call without the argument, apart from the two new keys (`is_overridden` False, `override_note` None).
- [ ] **Step 2: Run** `python -m pytest antova_ingest/tests/test_engine.py -q` → FAIL.
- [ ] **Step 3: Implement.** The override is applied before concession logic: `adder = float(override.adder_eur)` instead of `adder_amount(...)`.
- [ ] **Step 4: Run** `python -m pytest -q` → PASS.
- [ ] **Step 5: Commit** `feat(engine): founder adder overrides`

### Task 2: Schema v3 and repository

**Files:**
- Modify: `antova_db.py:26` (`SCHEMA_VERSION`), `:47-60` (`TenderRecord`), `:164-290` (`TenderRepository`), `:292-321` (`init_db`)
- Test: `antova_ingest/tests/test_db.py`

**Interfaces:**
- Consumes: `engine.Override` (Task 1).
- Produces:
  - `SCHEMA_VERSION = 3`
  - `TenderRecord` gains `share_id: str` (unique), `status: str` (`"DRAFT"`|`"VERIFIED"`, default `"DRAFT"`), `verified_at: datetime | None`, `ingest_mode: str` (default `"live"`), `synthetic: bool` (default False), `ingest_stats: str` (JSON, default `"{}"`), `stage_log: str` (JSON, default `"[]"`).
  - `AdderOverrideRecord(tender_id, param_id, vendor_id)` composite PK; `adder_eur: str`; `note: str`; `created_at: datetime`.
  - `@dataclass TenderMeta: tender_id, title, share_id, status, verified_at, ingested_at, ingest_mode, synthetic, ingest_stats: dict, stage_log: list[dict]`
  - `new_share_id() -> str` (`secrets.token_urlsafe(16)`)
  - `TenderRepository.save_tender(tender, documents, ingested_at, *, ingest_mode="live", synthetic=False, ingest_stats=None, stage_log=None, share_id=None) -> None` — keeps an existing `share_id` (or uses `share_id` if given for a new row, else `new_share_id()`), sets `status="DRAFT"`, `verified_at=None`, deletes the tender's overrides.
  - `get_meta(tender_id) -> TenderMeta | None`, `list_meta() -> list[TenderMeta]` (newest first), `tender_id_for_share(share_id) -> str | None`, `set_status(tender_id, status, at) -> None`, `list_documents(tender_id) -> list[dict]` (`filename, role, vendor_id, page_count`), `get_overrides(tender_id) -> dict[tuple[str, str], engine.Override]` (key `(param_id, vendor_id)`), `put_override(tender_id, param_id, vendor_id, adder_eur: Decimal, note: str) -> None`, `delete_override(...) -> bool`.
  - `latest_tender_id` is deleted (Task 4 removes its callers).

- [ ] **Step 1: Write failing tests** in `test_db.py`:
  - `test_v3_fresh_init_has_new_columns` — after `init_db`, `inspect(engine).get_columns("tenders")` names include all seven new columns; `adder_overrides` table exists; `schema_version` is 3.
  - `test_v2_upgrade_adds_columns_and_backfills_share_id` — build a v2 database (create v2 tables via raw SQL copied from the current `TenderRecord` columns, insert one tender row, `schema_version=2`), run `init_db`, assert the row now has a 22-character `share_id`, `status == "DRAFT"`, version 3, and the audit ledger rows are untouched.
  - `test_save_keeps_share_id_and_resets_to_draft` — save, `set_status(tid, "VERIFIED", now)`, `put_override(...)`, save again → same `share_id`, status `"DRAFT"`, `verified_at is None`, `get_overrides(tid) == {}`.
  - `test_save_with_fixed_share_id` — `save_tender(..., share_id="e2e-sample-share-id-000000")` on a new tender → `tender_id_for_share("e2e-sample-share-id-000000") == tid`.
  - `test_meta_round_trip` — `ingest_mode="answer_key", synthetic=True, ingest_stats={"pages_parsed": 116}, stage_log=[{"stage": "Intake", "pct": 5, "t_ms": 3}]` come back from `get_meta` with the same values; `list_meta()` orders newest first.
  - `test_overrides_round_trip` — `put_override(tid, "PARAM-01", "vendor-b", Decimal("12000.00"), "engineer estimate")` then `get_overrides` returns `{("PARAM-01", "vendor-b"): Override(adder_eur=Decimal("12000.00"), note="engineer estimate")}`; `delete_override` returns True then False.
  - Delete `test_latest_tender_id`.
- [ ] **Step 2: Run** `python -m pytest antova_ingest/tests/test_db.py -q` → new tests FAIL (missing columns/methods).
- [ ] **Step 3: Implement** the columns, record, dataclass and methods. Migration in `init_db`: if version is None → existing legacy path then create_all; if version == 2 → in one transaction `ALTER TABLE tenders ADD COLUMN …` for each new column with SQL defaults, then `UPDATE tenders SET share_id = :sid WHERE id = :id` per row with `new_share_id()`, then `CREATE UNIQUE INDEX ix_tenders_share_id ON tenders (share_id)`, then `create_all` (creates `adder_overrides`), then write version 3. Store `adder_eur` as the Decimal's string.
- [ ] **Step 4: Run** `python -m pytest -q` → all pass except tests that use `latest_tender_id` indirectly through the API (fixed in Task 4); list them in the commit message if any fail.
- [ ] **Step 5: Commit** `feat(db): schema v3 with share ids, review status and adder overrides`

### Task 3: Ingest records mode, synthetic flag and stage log

**Files:**
- Modify: `antova_ingest/types.py` (`TenderManifest.synthetic: bool = False`), `antova_ingest/pipeline.py:111-135, 320-352`, `antova_ingest/tests/fakes.py` (`AnswerKeyLocator.ingest_mode_label = "answer_key"`), `samples/scenario.py:447` (`manifest()` adds `"synthetic": True`), `samples/TENDER-2026-402/manifest.json` (regenerate with `python -m samples.generate_sample_pack`)
- Test: `antova_ingest/tests/test_pipeline.py`, `antova_ingest/tests/test_sample_pack.py`

**Interfaces:**
- Produces: `IngestResult.stats` gains `"ingest_mode"` (`"answer_key"`|`"replay"`|`"live"`), `"synthetic"` (bool), `"stage_log"` (`list[{"stage": str, "pct": int, "t_ms": int}]`, one entry per `report` call, `t_ms` since start). `persist(result, db)` passes these to `save_tender`.
- Rule: `ingest_mode = getattr(locator, "ingest_mode_label", None) or ("replay" if outcomes and all(o.from_store for o in outcomes) else "live")`.

- [ ] **Step 1: Write failing tests:** `test_stats_record_answer_key_mode` (AnswerKeyLocator run → `stats["ingest_mode"] == "answer_key"`), `test_stats_record_replay_mode` (a stub locator whose outcomes all have `from_store=True` → `"replay"`), `test_stage_log_has_seven_ordered_entries` (stage names equal `[s for s, _ in STAGES]`, `t_ms` non-decreasing), `test_synthetic_flag_from_manifest` (`stats["synthetic"] is True`), `test_persist_stores_meta` (after `persist`, `get_meta(...).ingest_mode == "answer_key"` and `synthetic is True`); in `test_sample_pack.py::test_manifest` assert `manifest["synthetic"] is True`.
- [ ] **Step 2: Run** `python -m pytest antova_ingest/tests -q` → FAIL.
- [ ] **Step 3: Implement**; regenerate the sample pack and confirm `git diff --stat samples/` shows only `manifest.json` changed (PDF bytes must be identical; the generator is deterministic).
- [ ] **Step 4: Run** full suite → PASS.
- [ ] **Step 5: Commit** `feat(ingest): record ingest mode, synthetic flag and stage log`

### Task 4: Review token, CORS and gated legacy routes

**Files:**
- Create: `antova_auth.py`
- Modify: `antova_api.py` (CORS block `:57-63`, `_load_tender` `:66-72`, every legacy route, `/api/health`), `conftest.py` (set `ANTOVA_REVIEW_TOKEN=test-review-token`, `ANTOVA_ALLOWED_ORIGINS=http://localhost:5173` before imports)
- Test: `test_antova.py` (update), create `test_antova_auth.py`

**Interfaces:**
- Produces: `REVIEW_HEADER = "X-Antova-Review-Token"`; `def require_review_token(x_antova_review_token: str | None = Header(default=None)) -> None` — 503 `{"detail": "Review is not configured on this server"}` if env unset/empty; 401 `{"detail": "Invalid review token"}` if missing or not equal by `hmac.compare_digest` after `.strip()` of the header value. `_load_tender(db, tender_id: str)` requires a non-empty ID (422 when absent via FastAPI `Query(...)`/body field `str` without default).
- Routes gated with `dependencies=[Depends(require_review_token)]`: `/api/tender`, `/api/evaluate`, `/api/negotiate/turn`, `/api/audit-trail`, `/api/jobs/ingest`, `/api/jobs/{job_id}`, `/api/cache/stats`, `/api/cache/invalidate`, `/api/export-pdf`. `EvaluateRequest.tender_id` becomes required (`str`, no default). `/api/health` drops `active_tender`.
- CORS: `allow_origins=[o.strip() for o in os.environ.get("ANTOVA_ALLOWED_ORIGINS", "").split(",") if o.strip()]`, `allow_credentials=False`, `allow_methods=["GET","POST","PUT","DELETE"]`, `allow_headers=["Content-Type", REVIEW_HEADER]`.

- [ ] **Step 1: Write failing tests** in `test_antova_auth.py`, parametrized over the nine gated routes: `test_route_requires_token` (no header → 401), `test_route_rejects_wrong_token` (→ 401), `test_route_accepts_token_with_whitespace` (header `" test-review-token\n"` → not 401), `test_unset_server_token_is_503` (monkeypatch env to "" → 503), `test_no_latest_fallback` (`GET /api/tender` with token, no `tender_id` → 422), `test_health_hides_active_tender`, `test_cors_allows_configured_origin_only` (preflight from `http://localhost:5173` gets `access-control-allow-origin`, from `https://evil.example` does not). Update `test_antova.py`: the `client` fixture sends the header by default (`TestClient(app, headers={REVIEW_HEADER: "test-review-token"})`), `tender_id` added where calls relied on the fallback, `test_get_tender_returns_ingested_package` passes `tender_id`.
- [ ] **Step 2: Run** `python -m pytest test_antova_auth.py test_antova.py -q` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** full suite → PASS.
- [ ] **Step 5: Commit** `fix(api): require review token and explicit tender ids; tighten CORS`

### Task 5: Open items and brief payload

**Files:**
- Create: `antova_review.py`
- Test: `test_antova_review.py`

**Interfaces:**
- Consumes: `Override`, `evaluate_vendor_financials` (Task 1); `TenderMeta`, `list_documents`, `get_overrides` (Task 2).
- Produces:
  - `@dataclass OpenItem: kind: Literal["unpriced", "needs_inspection", "missing_price"]; vendor_id: str; param_id: str | None; message: str` with messages `"Gap found but not priced"`, `"Evidence needs inspection"`, `"Bid price not found; fix the source and re-ingest"`.
  - `open_items(tender, overrides) -> list[OpenItem]` (vendor order, then parameter order).
  - `brief_payload(tender, meta, documents, overrides, sensitivity) -> dict` with keys exactly: `share_id, status, verified_at (ISO str | None), synthetic, ingest_mode, ingest_stats, stage_log, documents, tender (tender.model_dump(mode="json")), financials, overrides ([{param_id, vendor_id, adder_eur: str, note}]), open_items ([asdict])`.

- [ ] **Step 1: Write failing tests:** `test_open_items_unpriced_and_inspection` (helpers tender with one cell set to `UNPRICED` and one to `MANUAL_INSPECTION_REQUIRED` → two items in vendor/param order), `test_override_resolves_open_item`, `test_missing_headline_is_open_item` (headline 0 → `missing_price`), `test_brief_payload_keys_and_override_shape` (exact key set; `adder_eur` is a string like `"12000.00"`; financials reflect the override).
- [ ] **Step 2: Run** `python -m pytest test_antova_review.py -q` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(review): open items and brief payload`

### Task 6: Evidence crops

**Files:**
- Create: `antova_evidence.py`
- Test: `test_antova_evidence.py`

**Interfaces:**
- Produces: `class EvidenceNotFound(Exception)`; `citation_for(tender, param_id: str, source: str, which: Literal["primary","secondary"]) -> dict` (source `"mr"` → parameter `requirement_citation` and only `which="primary"`; a vendor ID → that extraction's `citation`/`secondary_citation`; anything missing → `EvidenceNotFound`); `document_path(tender_id: str, filename: str, known_filenames: set[str]) -> Path` (filename must be in `known_filenames`, resolved path must be inside `tender_dir_for(tender_id)`, file must exist, else `EvidenceNotFound`); `crop_text(path, page: int, bbox) -> str` (page is 1-based; test helper and sanity check); `render_crop(path: Path, page: int, bbox: tuple[float, float, float, float]) -> bytes` — PNG, clip = bbox padded 24 pt clamped to the page, zoom 2, width capped at 1600 px, 1.5 pt rectangle in `#9E2B1F` around the unpadded bbox; `@lru_cache(maxsize=128)` on a wrapper keyed by `(str(path), page, bbox)`.

- [ ] **Step 1: Write failing tests** (sample pack): `test_vendor_primary_citation_text` (`crop_text` of vendor-b PARAM-01 primary contains `"NOTE 7"`), `test_secondary_citation_is_cover_letter` (contains `"50 kA / 3 s"`), `test_mr_citation` (MR PARAM-01 contains `"50 kA RMS"`), `test_render_crop_is_png` (bytes start with `b"\x89PNG"`, width ≤ 1600), `test_unknown_filename_rejected`, `test_path_traversal_rejected` (`"../manifest.json"` → `EvidenceNotFound`), `test_missing_secondary_raises` (vendor-b PARAM-02 secondary).
- [ ] **Step 2: Run** `python -m pytest test_antova_evidence.py -q` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(evidence): cited page crops with path containment`

### Task 7: Public brief and founder review routers

**Files:**
- Create: `antova_briefs_api.py` (`router = APIRouter(prefix="/api/briefs")`), `antova_review_api.py` (`router = APIRouter(prefix="/api/review", dependencies=[Depends(require_review_token)])`)
- Modify: `antova_api.py` (include both routers)
- Test: `test_antova_briefs.py`

**Interfaces:**
- Consumes: Tasks 1, 2, 5, 6.
- Produces (spec §6.3, §6.4):
  - `GET /api/briefs/{share_id}` → `brief_payload` with default sensitivity; 404 `{"detail": "Not found"}` when unknown **or** not `VERIFIED` (identical body).
  - `POST /api/briefs/{share_id}/evaluate` body `RatesBody{copper_multiplier: float = 1.0 (0.5–2.5), site_labor_rate: float = 60.0 (20–200), freight_multiplier: float = 1.0 (0.5–2.5)}` → `{"financials": [...]}`.
  - `GET /api/briefs/{share_id}/evidence/{param_id}/{source}/{which}.png` → `image/png`, `Cache-Control: public, max-age=86400`; 404 on `EvidenceNotFound`.
  - `GET /api/review/tenders` → `[{tender_id, title, status, share_id, ingested_at, verified_at, open_items: int}]`.
  - `GET /api/review/tenders/{tender_id}`, `POST .../evaluate`, `GET .../evidence/{param_id}/{source}/{which}.png` (any status).
  - `PUT /api/review/tenders/{tender_id}/overrides/{param_id}/{vendor_id}` body `{adder_eur: Decimal (0 ≤ x ≤ 10_000_000, max 2 dp), note: str (1–500 chars, stripped)}` → 204; 404 if the cell doesn't exist.
  - `DELETE` same path → 204 / 404.
  - `POST .../verify` → 200 `{share_id, verified_at}`; 409 `{"detail": "Open items remain", "open_items": [...]}`.
  - `POST .../withdraw` → 200 `{status: "DRAFT"}`.
  - Override changes and verify/withdraw call `leveling_cache.invalidate_tender(tender_id)`.

- [ ] **Step 1: Write failing tests:** `test_unverified_brief_is_404`, `test_unknown_brief_is_404_with_same_body`, `test_verified_brief_payload` (after verify: `status == "VERIFIED"`, VoltSwitch `true_evaluated_price == 482800.0`), `test_public_evaluate_reprices` (copper 2.0 raises vendor-b above 482800), `test_public_evidence_png`, `test_review_list_counts_open_items`, `test_put_override_validation` (negative → 422, 3 dp → 422, blank note → 422, unknown cell → 404), `test_override_flows_into_public_brief`, `test_verify_blocked_by_open_items` (seed a cell as UNPRICED through the repository → 409 lists it; after override → 200), `test_withdraw_hides_brief`, `test_review_routes_need_token` (each review route without header → 401).
- [ ] **Step 2: Run** `python -m pytest test_antova_briefs.py -q` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** full suite → PASS.
- [ ] **Step 5: Commit** `feat(api): public briefs by share id and founder review routes`

### Task 8: Dev seed and fixture export

**Files:**
- Create: `antova_ingest/dev_seed.py`, `antova_ingest/export_fixtures.py`
- Test: `antova_ingest/tests/test_dev_tools.py`

**Interfaces:**
- Produces:
  - `python -m antova_ingest.dev_seed [--share-id ID] [--draft]` — runs `init_db`, ingests the sample with `AnswerKeyLocator` (never calls the LLM API), persists with `share_id=ID` when given, verifies unless `--draft`, prints `share_id=<id>`.
  - `python -m antova_ingest.export_fixtures <out_dir>` builds everything in memory with `run_ingest` + `brief_payload` (no database) and writes: `verified-brief.json` (payload, share ID `e2e-sample-share-id-000000`), `draft-brief.json` (same tender, status DRAFT, with vendor-c PARAM-05 changed to `pricing_status="UNPRICED"`, `cost_lines=[]`, `cost_adder=0` so it is an open item), `review-list.json`, `parity-cases.json` (`[{rates: {copper, labour, freight}, overrides: [...], expected: [{vendor_id, total_tech_penalty, total_commercial_adder, true_evaluated_price}]}]` for copper ∈ {0.5, 1.0, 1.15, 2.5} × labour ∈ {20, 60, 87.5, 200} × freight ∈ {0.5, 1.0, 2.5} × overrides ∈ {none, PARAM-02/vendor-b → "10000.00"}), `jobs.json` (QUEUED, PROCESSING at each stage, COMPLETED, FAILED samples). Output is deterministic (sorted keys, fixed timestamps `2026-11-05T00:00:00+00:00`).
- [ ] **Step 1: Write failing tests:** `test_seed_prints_share_id_and_verifies`, `test_export_is_deterministic` (run twice into two tmp dirs → identical bytes), `test_committed_fixtures_are_current` (export to tmp and compare with `web/src/test/fixtures/` byte-for-byte; skip with a clear reason if `web/` doesn't exist yet — it will after Task 9).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Both modules import `AnswerKeyLocator` from `antova_ingest.tests.fakes`; module docstrings say "development and tests only".
- [ ] **Step 4: Run** full suite → PASS.
- [ ] **Step 5: Commit** `feat(dev): offline sample seed and frontend fixture export`

## Phase B — Frontend foundation

### Task 9: Scaffold `web/`, design tokens, routing shell

**Files:**
- Modify: `.gitignore` (add `!/web/`, and `web/node_modules/`, `web/dist/`, `web/dist-ssr/`, `web/test-results/`, `web/playwright-report/`)
- Create: `web/package.json`, `vite.config.ts` (proxy `/api` → `http://127.0.0.1:8000`; Vitest `environment: "jsdom"`, `setupFiles: ["src/test/setup.ts"]`), `tsconfig.json` (strict, `noUncheckedIndexedAccess`), `eslint.config.js`, `.prettierrc`, `index.html` (`lang="en"`, `<div id="root"><!--app--></div>`), `src/main.tsx`, `src/router.tsx`, `src/pages/NotFound.tsx`, `src/design/{tokens.css,fonts.css,base.css}`, `src/test/setup.ts`, `src/content/copy.ts`, `web/DESIGN.md`
- Test: `src/pages/NotFound.test.tsx`

**Interfaces:**
- Produces: routes per spec §5.3 with lazy page components (`Landing`, `Brief`, `ReviewIndex`, `ReviewBrief`, `NotFound`; pages other than NotFound are stubs rendering their name until their task); `copy` object with every string of spec §10 (nested by surface: `copy.landing.h1`, `copy.brief.unavailableTitle`, …; parameterized strings as functions, e.g. `copy.verdict.reversal({low, lowBid, lowEval, winner, winnerEval})`); CSS custom properties exactly as spec §8.1 table; fonts from `@fontsource-variable/newsreader` and `@fontsource-variable/instrument-sans` imported in `fonts.css`; `web/DESIGN.md` documents tokens, rules ("colour only when something is wrong", ledger figures) and the component list.
- Scripts in `package.json`: `dev`, `build` (`tsc -b && vite build`; Task 20 appends `&& vite build --ssr src/entry-server.tsx --outDir dist-ssr && tsx scripts/prerender.ts`), `preview`, `test` (`vitest run`), `typecheck`, `lint`, `e2e` (Task 21), `snapshot:sample` (Task 20), `check:launch` (Task 19).

- [ ] **Step 1: Scaffold** with `npm create vite@latest web -- --template react-ts`, then install: `react-router`, `@tanstack/react-query`, `zod`, `decimal.js-light`, `motion`, `@fontsource-variable/newsreader`, `@fontsource-variable/instrument-sans`; dev: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `msw`, `@playwright/test`, `@axe-core/playwright`, `tsx`, `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `prettier`.
- [ ] **Step 2: Write failing tests** `renders the not-found page for unknown routes` (MemoryRouter at `/nope` → heading "Page not found." and link "Go to the home page" to `/`); `sets the document title per route` (`/nope` → "Page not found · Antova"); `app shell has a skip link to main`. `base.css` sets `scroll-padding-top: var(--nav-height)`.
- [ ] **Step 3: Run** `npm test` → FAIL; implement router, NotFound, tokens, copy; run → PASS; `npm run typecheck && npm run lint` clean.
- [ ] **Step 4: Run** `python -m antova_ingest.export_fixtures web/src/test/fixtures` and `python -m pytest antova_ingest/tests/test_dev_tools.py -q` → the committed-fixtures test now runs and passes.
- [ ] **Step 5: Commit** `feat(web): scaffold Vite app, Footnote tokens and routing shell`

### Task 10: API boundary

**Files:**
- Create: `web/src/api/schemas.ts`, `client.ts`, `queries.ts`, `web/src/test/msw/handlers.ts`, `web/src/test/msw/server.ts`
- Test: `web/src/api/schemas.test.ts`, `client.test.ts`

**Interfaces:**
- Produces:
  - zod schemas and inferred types: `Citation`, `Check`, `CostLine` (`qty`, `rate` as strings), `Extraction`, `Parameter`, `Vendor`, `Tender`, `ItemizedAdder`, `VendorFinancials`, `OverrideEntry`, `OpenItem`, `SourceDocument`, `StageLogEntry`, `Brief`, `ReviewTenderSummary`, `Job`. `Brief` mirrors `brief_payload` keys exactly.
  - `type Rates = { copper: number; labour: number; freight: number }`; `DEFAULT_RATES = { copper: 1, labour: 60, freight: 1 }`.
  - `class ApiError extends Error { kind: "not_found" | "unauthorized" | "conflict" | "invalid" | "network" | "server"; status?: number; body?: unknown }`.
  - `apiRequest<T>(method, path, schema: z.ZodType<T>, opts?: { body?: unknown; token?: string; signal?: AbortSignal }): Promise<T>` — prefixes `import.meta.env.VITE_API_BASE ?? ""`, sets `X-Antova-Review-Token` when `token` given, maps status 404/401/409/422/5xx and fetch failures to `ApiError.kind`, validates JSON with the schema (validation failure → `kind: "server"`).
  - `type Scope = { kind: "public"; shareId: string } | { kind: "review"; tenderId: string; token: string }`.
  - `evidenceUrl(scope: Scope, paramId, source, which): string`; `fetchEvidenceObjectUrl(scope: Scope, paramId, source, which, signal?): Promise<string>` — review scope fetches with the token header and returns `URL.createObjectURL(blob)` (an `<img>` can't send headers); public scope returns `evidenceUrl(...)` unchanged. Callers revoke object URLs on unmount.
  - Query hooks: `useBrief(shareId)`, `useEvaluate(scope, rates)` (keyed by rates; `placeholderData: keepPreviousData`), `useReviewTenders(token)`, `useReviewBrief(tenderId, token)`, `usePutOverride`, `useDeleteOverride`, `useVerify`, `useWithdraw`, `useStartIngest`, `useJob(jobId, token)` (refetch every 750 ms until COMPLETED/FAILED).
  - MSW handlers serving `src/test/fixtures/*` for every route above.
- [ ] **Step 1: Write failing tests:** `parses every committed fixture` (each fixture file through its schema), `maps 404 to not_found`, `maps fetch rejection to network`, `sends review token header`, `rejects schema-invalid JSON as server error`, `review evidence is fetched with the token and returned as an object URL`.
- [ ] **Step 2: Run** `npm test -- src/api` → FAIL; implement; run → PASS.
- [ ] **Step 3: Commit** `feat(web): typed API client, schemas and query hooks`

## Phase C — Domain logic (test-first)

### Task 11: Money and status

**Files:** Create `web/src/domain/money.ts`, `status.ts`; tests alongside.

**Interfaces:**
- `toCents(value: number | string): number` (half-up, via decimal.js-light), `formatEur(cents: number): string` (whole euros → `€482,800`; otherwise two decimals `€1,600.50`; negative `−€…`), `formatAdder(cents): string` (`+€18,500`; 0 → `€0`).
- `statusTag(status, pricingStatus, overridden: boolean): { glyph: string; word: string; severity: "ok" | "gap" | "open" }` per spec §8.2 (`COMPLIANT` → ✓ Meets spec ok; `DEVIATION_UPGRADE` → ↑ Exceeds spec ok; `DEVIATION_DOWNGRADE` → ✗ Gap gap; `CONFLICT_DOWNGRADE` → ⇄ Contradiction gap; `OMITTED` → ∅ Missing gap; `UNPRICED` and not overridden → €? Unpriced open; `MANUAL_INSPECTION_REQUIRED` and not overridden → ! Needs inspection open).
- [ ] **Step 1: Failing tests** with exact strings: `formatEur(48280000) === "€482,800"`, `formatAdder(1850000) === "+€18,500"`, `formatEur(160050) === "€1,600.50"`, `toCents("8.505") === 851`, plus one `statusTag` case per row above.
- [ ] **Step 2–4:** run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** `feat(domain): money formatting and status tags`

### Task 12: Leveling engine with Python parity

**Files:** Create `web/src/domain/leveling.ts`, `leveling.test.ts`

**Interfaces:**
- `type CellLevel = { paramId: string; status: string; pricingStatus: string; adderCents: number; overridden: boolean; overrideNote: string | null; commercial: boolean }`
- `type VendorLevel = { vendorId: string; name: string; headlineCents: number; techCents: number; commercialCents: number; evaluatedCents: number; cells: CellLevel[] }`
- `adderCents(extraction: Extraction, rates: Rates): number` — Decimal with `precision: 28`, `rounding: ROUND_HALF_UP`; lines: `fixed` qty×rate, `copper` qty×rate×copper, `labour` qty×labour, `freight` qty×rate×freight; multipliers enter as `new Decimal(String(x))`; sum unrounded, then to cents; no lines → `toCents(extraction.cost_adder)`.
- `levelTender(tender: Tender, rates: Rates, overrides: OverrideEntry[]): VendorLevel[]` — vendor order preserved; overridden cells use `toCents(adder_eur)` regardless of rates; `commercial` when parameter criticality is `COMMERCIAL`.
- [ ] **Step 1: Failing tests:** `matches the Python engine on every parity case` (for each case in `fixtures/parity-cases.json`, `levelTender(...)` totals in cents equal `Math.round(expected × 100)` for tech, commercial and evaluated); `VoltSwitch at default rates is €482,800`; `override ignores copper multiplier`.
- [ ] **Step 2–4:** run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** `feat(domain): leveling engine with Python parity`

### Task 13: Ranking, verdict and footnotes

**Files:** Create `web/src/domain/ranking.ts`, `verdict.ts`, `footnotes.ts` with tests.

**Interfaces:**
- `ranking.ts`: `type RankRow = { vendorId: string; bidRank: number | null; evalRank: number | null; worsened: boolean }`; `rankChanges(levels: VendorLevel[]): RankRow[]` (vendors with `headlineCents === 0` get null ranks; ties share a rank); `layoutFlip(valuesCents: number[], heightPx: number, minGapPx: number): number[]` — y positions on a shared linear scale, then pushed apart so adjacent labels are ≥ `minGapPx`, staying within `[0, heightPx]`.
- `verdict.ts`: `type Verdict = { kind: "reversal" | "holds" | "no_gaps" | "tie" | "no_prices"; sentence: string; caveat: string | null; missingPrice: string[] }`; `buildVerdict(levels, counts: { unpriced: number; inspection: number }): Verdict` using `copy.verdict.*`.
- `footnotes.ts`: `type Footnote = { number: number; vendorId: string; paramId: string; anchor: string }`; `anchorFor(vendorId, paramId) = \`f-${vendorId}-${paramId}\``; `footnoteIndex(tender, levels): Footnote[]` (numbered cells per spec §7.3); `resolveAnchor(tender, hash: string): { vendorId: string; paramId: string } | null` by lookup over all cells (never by splitting on "-"); `defaultSelection(tender, levels, verdict): string | null`.
- [ ] **Step 1: Failing tests:** `reversal sentence for the sample` equals exactly "VoltSwitch Industrial bid €418,000, the lowest. With its gaps priced in, it costs €482,800. Nordwerk Schaltanlagen GmbH is the lowest evaluated bid at €452,000."; `holds`, `no_gaps`, `tie`, `missing price excluded` variants on edited fixture copies; `caveat lists only non-zero parts`; `rankChanges marks VoltSwitch worsened`; `layoutFlip separates close values` (values 45,200,000 and 45,400,000 with height 200 and gap 18 → positions differ by ≥ 18); `numbers ten footnotes in vendor then parameter order`; `ignores unknown anchors` (`resolveAnchor(tender, "#f-garbage") === null`); `default selection is VoltSwitch PARAM-01`.
- [ ] **Step 2–4:** run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** `feat(domain): ranking, verdict and footnote index`

### Task 14: Replay script

**Files:** Create `web/src/domain/replay.ts`, `replay.test.ts`

**Interfaces:**
- `type StageKey = "read" | "find" | "verify" | "values" | "contradictions" | "price"`
- `stageForBackend(name: string): StageKey` (Intake, Parse → read; Locate → find; Verify citations → verify; Read values → values; Resolve precedence → contradictions; Price, Persist → price).
- `type ReplayStage = { key: StageKey; label: string; finding: string; durationMs: number }`
- `buildReplay(brief: Brief, maxMs = 8000): { stages: ReplayStage[]; timing: { recordedAt: string; realSeconds: number; speed: number } | null }` — findings per spec §7.2 (conversion picked where the unit changes beyond its prefix; first conflict with a secondary citation; counts from `ingest_stats`); with a `stage_log`, stage durations are the log's gaps merged per key, scaled so the total is `min(real, maxMs)`, and `timing.speed = real / played` (shown only when > 1); without a log each stage is `maxMs / 6` and `timing` is null.
- [ ] **Step 1: Failing tests:** `six stages with sample findings` (finding 4 equals "Deltaport Skid Consortium B.V.: 104 °F → 40 °C"; finding 5 mentions "p.2", "50 kA", "p.11", "31.5 kA"; finding 6 equals "10 gaps priced. VoltSwitch Industrial +€64,800."); `scales a 40 s log to 8 s with speed 5`; `plays a 0.47 s log at real speed with null speed label`; `no log means even pacing and no timing claim`; `maps every backend stage name`.
- [ ] **Step 2–4:** run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** `feat(domain): replay script from brief data`

## Phase D — Screens

Load `dataviz` before Task 15's charts and `frontend-design` before each screen task; apply `unslop` to any copy you add beyond `copy.ts`.

### Task 15: Evidence components and RankingFlip

**Files:**
- Create: `web/src/components/ui/{Button,Banner,Dialog,BottomSheet}.tsx`, `web/src/components/brief/{FootnoteRef,Sidenote,Quote,PageCrop,CheckRow,StatusTag,MoneyFigure,CheckStrip}.tsx` (+ `.module.css` each), `web/src/components/charts/RankingFlip.tsx`
- Test: `web/src/components/brief/evidence.test.tsx`, `web/src/components/ui/overlays.test.tsx`, `web/src/components/charts/RankingFlip.test.tsx`

**Interfaces:**
- Consumes: Tasks 10–13.
- Produces:
  - `<Sidenote tender, cell: {vendorId, paramId}, scope: Scope, levels: VendorLevel[], headingRef, children? />` — sections in spec §7.3 order; `children` is the review slot (Task 17).
  - `<Quote variant: "requirement" | "governing" | "superseded" citation />` (superseded is struck and prefixed by visually hidden "Contradicted:"), `<PageCrop scope paramId source which alt />` (skeleton → image → "Page image unavailable. The quote above is exact."), `<CheckRow check />`, `<StatusTag status pricingStatus overridden />`, `<MoneyFigure cents variant: "headline" | "struck" | "adder" | "total" />` (values settle over 320 ms when they change; instant under reduced motion), `<CheckStrip cells />` (text equivalent "{n} of {m} requirements met"), `<FootnoteRef footnote selected />` (`<a href="#anchor">` with superscript number).
  - `<Dialog open onClose labelledBy>` and `<BottomSheet open onClose labelledBy>`: focus trap, Escape, return focus to the opener.
  - `<RankingFlip levels height?>` — SVG slope chart using `layoutFlip`; oxblood line only for rows with `worsened`; a visually hidden ordered list of both rankings.
- [ ] **Step 1: Load** the `dataviz` skill (RankingFlip) and `frontend-design` (components); then **write failing tests:** `sidenote shows spec, governing quote, struck cover letter, checks and arithmetic for VoltSwitch PARAM-01` (texts "NOTE 7", "50 kA / 3 s", "11 bays × €1,600", "+€18,500"); `compliant cell sidenote shows Meets spec and no arithmetic`; `override note appears in How it's priced`; `crop failure shows exact-quote note`; `status tags render glyph and word for every status`; `check strip text equivalent`; `dialog traps focus and Escape returns focus`; `bottom sheet closes on Escape`; `RankingFlip exposes both orders as text and marks VoltSwitch worsened` (dashed line plus label "1st → 3rd"); `status glyphs are aria-hidden and the word is announced`; `footnote ref has a padded hit area class` (size itself is measured in Task 21).
- [ ] **Step 2: Run** `npm test -- src/components` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run typecheck && npm run lint` clean.
- [ ] **Step 5: Commit** `feat(web): evidence components, overlays and ranking flip`

### Task 16: The brief page

**Files:**
- Create: `web/src/components/brief/{Masthead,VerdictSentence,LevelingTable,Findings,RateSliders,CheckGrid,Method}.tsx` (+ `.module.css`), `web/src/components/brief/BriefView.tsx`, `web/src/pages/Brief.tsx`, `web/src/design/print.css`
- Test: `web/src/pages/Brief.test.tsx`

**Interfaces:**
- Consumes: Task 15 components; Tasks 10–13.
- Produces: `<BriefView brief: Brief, scope: Scope, reviewSlot?: (cell: {vendorId, paramId}) => ReactNode, cellHighlight?: (cell) => boolean />` (Task 17 reuses it); `Brief` page loads `useBrief(shareId)` and renders `BriefView` or the unavailable state.
- Behaviour: spec §7.3, §7.5, §11. Selection lives in `location.hash` (`resolveAnchor`, else `defaultSelection`); sticky margin ≥ 960 px, `BottomSheet` below (`matchMedia("(min-width: 960px)")`); `RateSliders` call `useEvaluate(scope, rates)` debounced 150 ms and render only the newest settled response; re-priced totals announced in a polite live region; `print.css` hides sliders and chrome and renders all footnotes as endnotes.
- [ ] **Step 1: Write failing tests** (MSW + fixtures): `renders masthead, verdict and all three bidders`; `table header labels match copy`; `opens footnote 1 by default`; `selecting a grid cell updates the hash and the sidenote`; `keyboard: Enter on a footnote focuses the sidenote heading, Escape returns focus`; `shows unavailable page on 404`; `keeps last prices and shows inline note when re-price fails`; `keeps the newest re-price when responses arrive out of order` (first request delayed 300 ms, second immediate; the final total equals the second response); `opens default footnote for unknown hash`; `renders five bidders` (fixture copy with two extra vendors: table, grid and strip show five); `labels synthetic sample and test extraction`; `announces re-priced total in a live region` (region present and empty at first render; announces only the settled value); `sliders expose aria-valuetext`; `check grid scroll region is focusable and labelled`; `page has header, main, aside and footer landmarks`; `sets document title to "Verified brief · TENDER-2026-402 · Antova"`.
- [ ] **Step 2: Run** `npm test -- src/pages/Brief` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; typecheck and lint clean.
- [ ] **Step 5: Commit** `feat(web): verified brief page with sliders, grid and print layout`

### Task 17: Review mode

**Files:**
- Create: `web/src/components/review/{TokenGate,OverrideForm,VerifyBar,RunIngestForm}.tsx`, `web/src/pages/{ReviewIndex,ReviewBrief}.tsx`, `web/src/review/token.ts`
- Test: `web/src/pages/Review.test.tsx`, `web/src/components/review/OverrideForm.test.tsx`

**Interfaces:**
- Consumes: `BriefView` (Task 16), review hooks (Task 10).
- `token.ts`: `getToken(): string | null`, `setToken(raw: string): void` (stores `raw.trim()` in `sessionStorage["antova.reviewToken"]`), `clearToken(): void`.
- `parseEuroInput(raw: string): { ok: true; cents: number } | { ok: false; message: string }` in `OverrideForm.tsx` — accepts `^\d{1,8}(\.\d{1,2})?$` only; anything else returns `"Use digits only, e.g. 18500 or 18500.50"`.
- `VerifyBar` shows the verified stamp (480 ms, once; none under reduced motion) after a successful verify.
- New copy (add to `copy.ts`, run `unslop`): `review.notConfigured` "Review is not configured on this server.", `review.reingested` "Re-ingested. This brief is back to draft and its overrides were cleared.", `review.signOut` "Sign out of review".
- [ ] **Step 1: Write failing tests:** `trims pasted token`; `shows error on 401` (copy "That token didn't work."); `shows not-configured message on 503`; `sign out clears token and shows the gate`; `lists tenders with open-item counts`; `draft banner and highlighted open cells`; `rejects comma and three-digit-dot amounts` (`"18.500"`, `"1,600"`, `"1.600,00"` rejected; `"18500.5"` → 1850050 cents); `saving an override sends PUT and re-renders the adder with the override badge`; `Mark verified is aria-disabled, focusable, and describes the open items until they are resolved`; `amount and note errors set aria-invalid and aria-describedby`; `verify confirmation copy and copies share link`; `withdraw confirmation`; `run ingest validates folder id`; `after a live ingest the re-ingested banner shows`.
- [ ] **Step 2–4:** run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** `feat(web): founder review mode with overrides and verify`

### Task 18: Audit modal

**Files:**
- Create: `web/src/components/modal/{AuditModal,StageList,DocCard}.tsx`, `web/src/components/modal/useReplay.ts`, `useLiveIngest.ts`
- Test: `web/src/components/modal/AuditModal.test.tsx`

**Interfaces:**
- `<AuditModal open onClose source={{ kind: "replay"; brief: Brief; briefHref: string } | { kind: "live"; tenderId: string; mode: "replay" | "auto" | "live"; token: string; onDone: () => void }} />` built on `Dialog` (Task 15).
- `useReplay(script, { reducedMotion }): { activeIndex: number; done: boolean; skip(): void; restart(): void }`; `useLiveIngest(...)` uses `useStartIngest` + `useJob` and `stageForBackend`.
- Motion: stage reveal and finding fade via `motion/react` at spec durations; none under reduced motion.
- [ ] **Step 1: Write failing tests** (fake timers): `labels the replay and lists four documents`; `reveals six findings in order within 8 s`; `announces each completed stage`; `skip shows the result immediately`; `pause stops the replay and play resumes it`; `Open the brief links to the VoltSwitch PARAM-01 anchor`; `Escape closes and returns focus to the trigger`; `reduced motion renders all stages complete`; `live mode maps backend stages and shows failure stage and message`; `timing footer only when speed > 1`.
- [ ] **Step 2–4:** run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** `feat(web): audit replay modal and live ingest mode`

### Task 19: Landing page, sandbox and legal pages

**Files:**
- Create: `web/src/pages/Landing.tsx` (+ sections in `web/src/components/landing/`: `Nav`, `Hero`, `EvidenceCard`, `HowItWorks`, `Sandbox`, `Offer`, `Faq`, `Footer`), `web/src/components/charts/SensitivityBars.tsx`, `web/src/pages/Legal.tsx` (routes `/impressum`, `/privacy`), `web/src/content/{impressum,privacy}.md` (first line `FOUNDER-TO-SUPPLY`), `web/scripts/check-launch.ts`, `web/src/generated/sample-brief.json` (copy of `verified-brief.json` until a live sample exists), `web/PRODUCT.md`
- Test: `web/src/pages/Landing.test.tsx`, `web/scripts/check-launch.test.ts`

**Interfaces:**
- Landing reads `src/generated/sample-brief.json` (no network for first render); `Sandbox` uses `levelTender` locally and `SensitivityBars` (stacked bid / technical / commercial segments, sorted by evaluated price, animated re-sort; none under reduced motion); `mailtoHref(email: string, equipment = "switchgear"): string` builds subject and body from `copy.offer.*`; `VITE_CONTACT_EMAIL` unset → email button and address line are not rendered (never a fake address).
- `launchProblems(env, contentFiles: Record<string, string>, snapshot: Brief): string[]` — one message per problem: a content file containing `FOUNDER-TO-SUPPLY`, `VITE_CONTACT_EMAIL` unset, snapshot `ingest_mode === "answer_key"`; `check-launch.ts` prints them and exits 1 if any.
- `web/PRODUCT.md`: bid-evaluation product truth (spec §2–§3); nothing in `antova/` changes.
- [ ] **Step 1: Load** `frontend-design` and `dataviz`; **write failing tests:** `hero copy and sample label`; `test-extraction label when snapshot is answer_key`; `Watch it check a tender opens the modal`; `sandbox re-sorts bidders when copper changes` (copper 2.5 → VoltSwitch figure equals `levelTender` output); `sensitivity bars have a text alternative listing bidders in order`; `mailto has subject and checklist`; `no contact email hides the email button`; `FAQ answers match copy`; `legal pages render markdown`; `launchProblems lists each placeholder`.
- [ ] **Step 2–4:** run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** `feat(web): landing page, sensitivity sandbox and legal pages`

### Task 20: Prerender and snapshot

**Files:**
- Create: `web/src/entry-server.tsx` (`render(url: string): string` with `StaticRouter` for `/`), `web/scripts/prerender.ts` (inject into `dist/index.html`; copy the unrendered shell to `dist/app.html` for SPA fallback on every other route), `web/scripts/snapshot-sample.ts` (GET `/api/briefs/$VITE_SAMPLE_SHARE_ID` → `src/generated/sample-brief.json` with `snapshot_at`)
- Modify: `web/src/main.tsx` (`hydrateRoot` when `location.pathname === "/"` and `#root` has children, else `createRoot`)
- Test: `web/scripts/prerender.test.ts`

- [ ] **Step 1: Write failing test** `prerendered index contains the hero and the sample table` (`render("/")` HTML contains `"The cheapest bid wasn&#x27;t the cheapest."` and `"€482,800"`).
- [ ] **Step 2–4:** run → FAIL, implement, run → PASS. Then `npm run build`: `dist/index.html` contains the hero text, `dist/app.html` does not; `npm run preview` shows no hydration warning in the console.
- [ ] **Step 5: Commit** `feat(web): prerendered landing and sample snapshot script`

## Phase E — Verification

### Task 21: End-to-end and accessibility

**Files:**
- Create: `web/e2e/start-api.mjs` (deletes `web/e2e/.tmp/e2e.db`, runs `python -m antova_ingest.dev_seed --share-id e2e-sample-share-id-000000` then `python -m uvicorn antova_api:app --port 8000` from the repo root, with env `ANTOVA_DATABASE_URL=sqlite:///<abs path to web/e2e/.tmp/e2e.db>`, `ANTOVA_REVIEW_TOKEN=e2e-token`, `ANTOVA_ALLOWED_ORIGINS=http://localhost:4173`), `web/playwright.config.ts` (`workers: 1`, `fullyParallel: false`; webServer 1: `node e2e/start-api.mjs` on port 8000; webServer 2: `npm run build && npm run preview -- --port 4173` with `VITE_SAMPLE_SHARE_ID=e2e-sample-share-id-000000`, `VITE_CONTACT_EMAIL=e2e@example.invalid`), `web/e2e/{1-landing,2-brief,3-review,keyboard,mobile,a11y}.spec.ts`; add `web/e2e/.tmp/` to `.gitignore`
- [ ] **Step 1: Write the specs:**
  - `1-landing`: `/` → *Watch it check a tender* → *Skip to result* → *Open the brief* → URL hash `#f-vendor-b-PARAM-01`, sidenote shows "NOTE 7".
  - `2-brief`: grid cell click → crop image loads (`naturalWidth > 0`) → copper slider to max → VoltSwitch evaluated figure changes.
  - `3-review` (runs last): `/review` → token `e2e-token` → open TENDER-2026-402 → *Withdraw brief* → public link now shows "This brief isn't available." → override vendor-c PARAM-05 with `2600` and a note → *Mark verified* → success text "Verified. Share link copied." → public link works again.
  - `keyboard`: Tab to footnote 2, Enter, focus is on the sidenote heading, Escape returns focus.
  - `mobile` (390 × 844): footnote opens the bottom sheet; Escape closes it.
  - `a11y`: `@axe-core/playwright` on `/`, `/b/e2e-sample-share-id-000000`, `/review/TENDER-2026-402` (after token) → zero serious or critical violations; every footnote ref's bounding box is ≥ 24 × 24 px; tabbing through `/` and `/b/…` never leaves the focused element's box overlapped by the sticky nav or sidenote (compare bounding rects).
- [ ] **Step 2: Run** `npm run e2e` → fix wiring until it runs; a failing assertion that shows a product defect gets a failing component test first, then the fix.
- [ ] **Step 3: Run** `npm run e2e`, `npm test`, `npm run typecheck`, `npm run lint`, `python -m pytest -q` → all PASS.
- [ ] **Step 4: Commit** `test(web): end-to-end flows, keyboard, mobile and axe`
