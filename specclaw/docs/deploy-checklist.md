# Antova deploy checklist

The static site (`web/dist/`) and the FastAPI backend (`specclaw_api:app`) deploy separately.
Nothing here is done until the hosting choice is made.

## 1. Before any deploy: launch items (founder)

`cd web && npm run check:launch` must pass. It fails today on:

- [ ] `VITE_CONTACT_EMAIL`: the public contact address.
- [ ] `VITE_SITE_URL`: the site's https origin (canonical link, structured data, sitemap).
- [ ] `src/content/impressum.md` and `src/content/privacy.md`: the founder's text, replacing `FOUNDER-TO-SUPPLY`.
- [ ] FAQ "Who sees my documents?" in `src/content/copy.ts`: signed-off answer (Claude API processing, retention).
- [ ] Live sample: with `ANTHROPIC_API_KEY` set, ingest `TENDER-2026-402` in live mode, review and verify it, then set `VITE_SAMPLE_SHARE_ID` to its share ID and run `npm run snapshot:sample` against the production API.

## 2. Backend

- [ ] Python 3.12+ with `pip install -r specclaw_requirements.txt`. (`requirements.txt` is the old carbon product's and is git-ignored; don't use it.)
- [ ] Environment:
  - `SPECCLAW_DATABASE_URL`: a persistent database. The SQLite default (`./specclaw_enterprise.db`) is lost on most container hosts.
  - `ANTOVA_REVIEW_TOKEN`: a long random secret. Review mode answers 503 without it (or without `ANTOVA_REVIEWERS`).
  - `ANTOVA_REVIEWERS` (optional): one token per reviewer, as JSON, so reviews, overrides and verification are attributed to a person. Prefer this over the shared token once more than one person reviews.
  - `ANTOVA_ALLOWED_ORIGINS`: the site's origin, comma-separated if several. Leave empty when the API is served on the same origin.
  - `SPECCLAW_TENDERS_DIR`: where tender folders live, and where uploads are written. Uploads (`PUT /api/review/tenders/{id}/files/{name}`, then `PUT .../manifest`) answer 503 without it. Limits: `SPECCLAW_MAX_UPLOAD_MB` (50), `SPECCLAW_MAX_PDF_PAGES` (600), `SPECCLAW_MAX_TENDER_FILES` (40).
  - `ANTHROPIC_API_KEY` or `EXPLABS_API_KEY`: needed for live ingests only. With only `EXPLABS_API_KEY` set, the locate step uses Experiential Labs (`gpt-6-luna`); see `.env.example`.
  - `SPECCLAW_TENDERS_DIR`: where tender folders live, if not the default.
- [ ] Run with `uvicorn specclaw_api:app --host 0.0.0.0 --port $PORT` on a **single worker**: the job queue is in-process, so jobs started on one worker are invisible to another.
- [ ] `GET /api/health` answers 200.
- [ ] Decide whether `/docs` and `/redoc` should stay public.

## 3. Static site

- [ ] `cd web && npm ci && npm run build` with the production `VITE_*` values. `VITE_API_BASE` is empty for same origin, else the API's origin.
- [ ] Host rules: `/` serves `index.html` (the prerendered landing); every other path that isn't a file falls back to `app.html` (SPA). Never fall back to `index.html`, or the landing would flash on brief links.
- [ ] Cache `assets/*` long (hashed names); `index.html`, `app.html`, `robots.txt` and `sitemap.xml` short.
- [ ] If the API shares the origin, proxy `/api/*` to it.

## 4. After deploy

- [ ] `/`, the sample brief `/b/<share id>`, `/review`, `/impressum` and `/privacy` load with a clean console.
- [ ] The review token works; a wrong one is refused.
- [ ] `robots.txt` disallows `/review`; `sitemap.xml` lists `/`, `/impressum` and `/privacy`.
- [ ] Share the landing URL in a link-preview checker (title and description show).
- [ ] Re-run the e2e suite against the build locally before each later release: `cd web && npx playwright test`.
