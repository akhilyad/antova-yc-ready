# Antova backend roadmap for the YC demo

Written 2026-11-13. Scope decisions this follows:

- **The backend is the demo.** The YC application and the demo video show the ingest pipeline, the rule engine and the structured output. The landing page stays a marketing page and gets no live tool.
- **Automation up to a gate, then a person.** Parsing, cross-checking and pricing run without help. A person approves every flag before an audit is final, and the award decision stays with the buyer. The code already works this way (`final` in `POST /api/evaluate` needs `VERIFIED` status and zero open flags). The landing copy now says so.

## What the demo has to show (90 seconds)

1. Three bids and a spec go in. One command, no UI.
2. The lowest headline price drops to last once gaps are priced (sample: €418,000 becomes €482,800).
3. Every flagged cell prints the page and the exact quote behind it.
4. A reviewer approves the flags. The result flips from draft to final and the PDF loses its draft mark.
5. The run prints its own cost, time and the share of cells that match the answer key.

Everything below is ordered by what that sequence needs.

## Phase 0: make the demo run for real (days 1 to 4)

| # | Work | Done when |
|---|------|-----------|
| 0.1 | **First live ingest.** Run `python -m antova_ingest.run samples/TENDER-2026-402 --mode live --verify` with `ANTHROPIC_API_KEY`. Saved responses land in `saved_responses/`. | Live output matches `expected.json`, or each difference is written down. Replay mode then reproduces it offline, which is how the video gets recorded. |
| 0.2 | **Warranty rule: decided, strict v2.** A warranty on a different start point than the MR's is flagged and left unpriced unless the MR states the gap. This moves the sample numbers. | Sample keys, fixtures and `src/data/tender402.ts` regenerated from v2. Vendor B's price becomes a lower bound. |
| 0.3 | **Rate ranges: decided, cut.** The range deliverable is removed from the landing page. Rate tables keep a single rate; FX stays out of scope. | No "low to high range" claim anywhere. Ranges can return later as their own task. |
| 0.4 | **Draft until approved.** The PDF and the audit JSON carry a visible DRAFT state while `open_flags > 0`. | Generating a PDF before approval is possible but unmistakably marked. |
| 0.5 | **Review gate walkthrough as a script.** Ingest, list open flags, approve, re-evaluate, export. | `demo.sh` (or `demo.py`) runs the whole sequence against a fresh database. |
| 0.6 | **Anonymise the sample pack.** `Bid_vendor-a_Nordwerk.pdf` and the other PDFs, plus `expected.json`, carry real vendor names. Regenerate with `generate_sample_pack.py` using Vendor A/B/C. | No real vendor name in `antova_backend/samples/` or in anything the demo prints. Vendor names and PDF filenames are part of the review app's fixture contract (about 35 files under `antova_backend/web/`), so do this with that app's tests runnable. |

## Phase 1: take a bid pack you did not generate (weeks 1 to 2)

The parser has only seen synthetic 30-page PDFs. Investors will ask about real ones.

| # | Work | Done when |
|---|------|-----------|
| 1.1 | **Upload path.** `POST /api/tenders`, multipart: one spec, 2 to 8 bids. The server creates the tender ID and folder and writes `manifest.json`. Checks: PDF magic bytes, size cap, page cap, vendor cap. | A new pack can be ingested without touching the server's filesystem. "Up to 8 bids" is enforced here. |
| 1.2 | **Scale test.** Generate a 300-page bid with the pack generator, plus a bid where a table splits across pages. | Pipeline finishes inside a stated time and cost, and recall is reported. |
| 1.3 | **Messy real documents.** Collect 3 to 5 public or redacted tender PDFs with real layouts. Run them with the live locator. | `eval.py` prints recall and false-flag rate for them. Failures become mutation operators. |
| 1.4 | **Scanned pages.** Detect them, flag the cell as "needs manual review", never guess. OCR stays out of scope. | A scanned page produces a flagged cell, not a silent miss. |
| 1.6 | **Reviewer identity.** Replace the shared review token with named reviewers per organisation, each tied to the tenders their org owns. | A reviewer sees only their org's tenders. Every approval carries a reviewer ID. |
| 1.5 | **Job safety.** Persist jobs to the database (today they sit in an in-memory dict and vanish on restart). One worker. Per-job cost cap that aborts the run and says why. Per-tender timeout. | A killed server resumes or fails jobs cleanly. A run cannot exceed its budget. |

## Phase 2: output a buyer can act on (weeks 2 to 3)

| # | Work | Done when |
|---|------|-----------|
| 2.1 | **Versioned audit JSON.** `GET /api/tenders/{id}/audit`: evaluated price per vendor, flagged cells with citations, conflicts with both pages, claimed-only passes, status (draft or final), reviewer, timestamps, rule-table version. | Schema committed, documented, tested. The PDF and the CSV of vendor questions are rendered from it. |
| 2.2 | **Approval ledger.** Who approved which flag and when, exported with the report. | The PDF shows the approval trail. |
| 2.3 | **Second equipment class.** One only, after 402 passes live. Needs an ontology, a rate table and a passing `validate_config()`. | A second tender type ingests with no engine change. This is the generality claim for the application. |

Dropped from the earlier list: an endpoint shaped as a landing-page snippet. The landing page stays static, so nothing needs it.

## Phase 3: deploy (only when the demo is stable)

- Single container, persistent database via `ANTOVA_DATABASE_URL` (SQLite is lost on most hosts), single uvicorn worker.
- `ANTOVA_REVIEW_TOKEN` set, `ANTOVA_ALLOWED_ORIGINS` set, `/docs` closed or gated.
- Hosting choice is open. See `deploy-checklist.md`.

No public intake route is planned. If one is added later it needs its own per-tender token, separate from the review token, plus per-visitor rate and cost limits.

## Numbers to put in the application

Take these from `eval.py` and live runs, not from the synthetic key alone:

- Cell accuracy against the answer key, live locator, across all mutation operators.
- Recall of the sweep on the messy documents from 1.3.
- API cost and wall time per tender at 30 and 300 pages.
- Share of flags a reviewer changed. This is the honest measure of how much the gate matters.

## Landing claims with no code behind them

Left in place because they are commitments the founder can keep by hand, but nothing enforces them yet:

- "Results in 24 hours" and "reviewed by an engineer": a process, not software.
- "Under NDA" and "never used to train models": legal text and LLM API terms. The privacy text is still a placeholder.
- "Up to 8 bids": enforced by 1.1.
- "Low to high range": cut (0.3).

## Housekeeping

- `fable-pipeline-handoff-brief.md` names an employer and is still tracked. Remove it. It stays in git history unless that is rewritten.
- `specs/` and `plans/` at the repo root duplicate `antova_backend/docs`. Keep one.
- Two branches still need PRs. Nothing is pushed until the founder approves.
- The review app's launch items (legal text, contact email, site URL) are listed in `deploy-checklist.md`. Its dependencies are not installed here, so its tests have not been run.

## Decisions made (2026-11-13)

1. Warranty rule: strict v2.
2. Range deliverable: cut.
3. "A person" at the gate is any manager, engineer or analyst on the buyer's procurement team who uses Antova. Not Antova staff. So the review role is a customer role: reviewers need accounts scoped to their organisation, and the approval ledger (2.2) records the reviewer's name and role. The single shared `ANTOVA_REVIEW_TOKEN` is a stopgap and cannot do that. Per-organisation reviewer auth moves into Phase 1 (1.6).
