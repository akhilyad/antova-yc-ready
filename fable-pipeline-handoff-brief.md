# Handoff brief for Fable 5.2: build the SpecClaw ingestion pipeline

Updated 2026-11-12. Load this first, then the docs below.

## FINAL RULES (set by the founder, not negotiable)
- Build the pipeline only. Free work only.
- Do NOT run Task 10 (live verification run, recorded responses, replay test built from live recordings).
- Do NOT call the Anthropic API or any other paid or networked service. No API key is available and none will be added. Never run `--mode live`. Never set or read `ANTHROPIC_API_KEY`.
- Testing is allowed and expected, as long as it is free and offline: `python -m pytest -q`. Keep tests credential-isolated and offline.
- If a step needs the API, skip it, note it in the ledger as "deferred: needs API", and move on. Do not ask the founder to add a key.

## Scope
"Antova pipeline" means the ingestion pipeline in `specclaw_ingest/` (inside the `specclaw` folder, not the `antova-yc-ready` website repo). Antova's old Scope 3 code, landing pages and hero are out of scope. Do not merge Antova into SpecClaw.

## Source of truth: the plans and specs folders
Both are in the founder's folder `D:\antova-yc-ready-main\antova-yc-ready-main\`:

| File | What it is | Use |
|---|---|---|
| `specs/2026-11-03-specclaw-ingestion-pipeline-design.md` | Design spec, sections 1 to 20 | Authority for every section number in the ledger (6 parsing, 7 locate, 8 citation check, 9 values, 10 precedence, 11 costs, 12 DB, 13 API, 15 verification, 17 testing, 18 deps, 19 out of scope, 20 build order) |
| `plans/2026-11-03-specclaw-ingestion-pipeline.md` | Implementation plan, Tasks 1 to 10 | The work breakdown. Tasks 1 to 9 are done; Task 10 is excluded (see rules) |
| `specs/2026-11-05-antova-frontend-design.md` and `plans/2026-11-05-antova-frontend.md` | Separate frontend plan (Tasks 1 to 21: schema v3, overrides, token-gated routes, `web/` app) | NOT part of "the pipeline". Do not start it unless the founder says so. Read only for interface conflicts (it builds on schema v2 and adds v3) |

## Also read
1. `2026-11-03-specclaw-ingestion-pipeline/progress.md` (in this project): the ledger. Rulings are settled unless you have a concrete reason to reopen one. Deferred minors M3 to M12 are listed at the end.
2. `Antova/specclaw/specclaw_yc_2027_master_blueprint.md`: product intent.
3. `claude/specclaw-antova-analysis.md`: decisions and weak spots.
4. `claude/yc-application-fix-list.md`: claims boundary.
5. Code: `specclaw_ingest/` (`pipeline.py`, `extract.py`, `parse.py`, `values.py`, `verify.py`, `precedence.py`, `ontology.py`, `costs.py`, `run.py`, `rates/mv_gis_switchgear_v1.json`) and `tests/`. Older engine: `specclaw_engine.py`, `specclaw_db.py`.

Ignore: `task-10-brief.md` and `live-run-1.log` (excluded work), `task-N-tests.log`, `review-ee799b7..8e77c83.diff` (reference only), everything under `Antova/antova`, `hero`, `landing`, screenshots, Scope 3 routers/payments/suppliers, and `Antova/specclaw/requirements.txt` (Antova's; pins pydantic 1.10 and breaks the pipeline).

## State at handoff
- Plan Tasks 1 to 9 complete and merged to main at 8697b26. 228 tests pass offline on the synthetic pack `TENDER-2026-402`, using the answer-key locator.
- Task 10 is out of scope for good. The pipeline stays verified offline only.
- Real DB was upgraded to schema v2; backup at `scratchpad/specclaw_enterprise.backup-before-v2.db`.

## Work order (all free, all offline)
1. Re-read the design spec and plan against the code. List any place where the code and spec disagree. Fix code to match spec unless a ledger ruling says otherwise.
2. Fix the deferred items from the ledger, each test-first (RED then GREEN):
   - M3: confine manifest file paths and rate table to the tender folder; reject duplicate vendor_id and file entries at load time, not at persist.
   - M4: add `pricing_status` to `/api/evaluate` itemized breakdown; a vendor with no price must not show a true evaluated price of 0.0.
   - M5: export-pdf clawback figures are hardcoded (57,400 / 33,900). Derive them from the computed negotiating vendor. `specclaw_pdf.py` internals were declared a spec boundary; if the fix needs it, pass computed figures in from the caller instead.
   - M6: add a tender revision to the leveling cache key.
   - M9: replay key must include a hash of the system prompt, so a `locate_hint` edit cannot replay stale responses.
   - M10: labour line must use the rate table's labour rate.
   - M11: a new ontology field without a `_CLASS_SUFFIX` entry must not raise KeyError; the incoterm class must not assume a DDP requirement.
   - M12: corrupt saved response gives a clean error; record the server-side fallback model; XML-escape page text in the prompt.
3. I1 follow-up: plausibility warning when a headline price is far from the median of the other bids.
4. Harden section tagging for real PDFs (running headers, multi-column pages, headings split across lines). Spec 6 is the baseline; add tests with synthetic PDFs built in the test, not downloaded.
5. Add 1 or 2 more synthetic sample packs with answer keys (different vendor counts, a missing headline, an unreadable bid, a scanned page with no text) to widen offline coverage. Generate them with the same `samples/generate_sample_pack.py` approach. Never use employer files.
6. Update `progress.md` with every ruling and anything deferred.

## Rules to preserve
- Claude only locates passages (design, not run here). Parsing, Pint checks, precedence and pricing stay deterministic.
- Every quote must verify against parsed page text; page and parsed values must match exactly.
- Never silently zero a price. An unknown quantity makes the whole deviation class UNPRICED.
- Human approves every flag in v1.
- Fix causes, never the answer key.

## Constraints
- Public or synthetic data only. No employer-confidential files (ib vogt or others).
- Fly.io with a volume is the eventual deployment target (SQLite). Do not deploy now.
- The plan's ignore rules matter: `.gitignore` ignores every top-level path not whitelisted. New backend modules must be named `specclaw_*.py` or live in `specclaw_ingest/` to be tracked.
- Project docs are a 3 Nov snapshot. The local repo is the source of truth.

## Claims boundary (for any copy Fable writes)
Say "228 tests pass on a synthetic sample pack." Never say "works on real tenders" and never claim a live Claude run happened. Do not add SOC 2, encryption or company-entity claims. No supplier names, project names or money figures from the founder's employer.
