# UI QA checklist

Run this before merging UI work and before any deploy. It is also the step 7 criteria for the
landing pass (`docs/landing-proposal-2026-11-07.md`). Commands run from `web/` unless noted.

## 1. Automated gates (all must pass)

| Command | What it covers | Last recorded result |
|---|---|---|
| `npm run typecheck` | `tsc -b`, strict | clean |
| `npm run lint` | ESLint and Prettier | clean (delete `web/.impeccable/hook.cache.json` first: the design hook writes it and Prettier flags it) |
| `npm test` | Vitest unit and component tests | 418 passing at landing step 6 |
| `npm run test:coverage` | `src/domain` must stay at 100 % lines and branches | 100 % |
| `npm run e2e` | Playwright against the real FastAPI backend and a production build, one worker, `3-review` last | 14 of 14 at landing step 6, axe 0 violations |
| `pytest` (from `antova_backend/`, with `antova_requirements.txt` installed) | backend | 369 passing |
| `npm run check:launch` | founder-supplied launch items | fails until they are supplied (below) |

Numbers drift. Record the new ones in `HANDOFF.md` when they change.

## 2. Viewports

Check each page at these widths. The first two are the ones the design critique uses.

| Width | Why |
|---|---|
| 1440 px | desktop with the sticky margin |
| 375 × 812 | small phone: the hero flip must fit the first screen |
| 390 × 844 | the e2e mobile project; bottom sheet instead of margin |
| 360 × 740 | smallest supported phone; the flip ends about 858 px down (known, accepted) |
| 768 and 959 px | just under the 960 px margin breakpoint |
| 960 px | margin appears |

For each: no horizontal page scroll, 16 px side gutters, nothing under 12 px except footnote
superscripts, targets at least 24 × 24 px, nothing covered by the floating nav.

## 3. Page by page

**Landing `/`**
- [ ] Hero flip plays once at half on screen, settles, and the final chart equals the static one.
- [ ] Reload with reduced motion on: final chart at once, no flicker of hidden parts.
- [ ] JavaScript disabled: every part visible (`<noscript>` style).
- [ ] Both hero buttons work. The nav recheck fills only after the hero buttons scroll away.
- [ ] Receipt crops load from `public/sample/` with no API request (network panel empty of `/api`).
- [ ] Sandbox: each slider re-sorts the bars and the announced order settles after 500 ms.
- [ ] Offer shows the button and the address. With the email unset, neither shows.
- [ ] Replay modal: opens, traps focus, Esc closes, focus returns to the button, *Skip to result*
  works, *Open the brief* lands on the VoltSwitch contradiction footnote.
- [ ] No claim on the page is untrue today (see `content-guide.md`).

**Brief `/b/:shareId`**
- [ ] Unknown or unverified share ID shows the same "not available" page, with `noindex`.
- [ ] A footnote opens its evidence: margin at 960 px and up, bottom sheet below.
- [ ] Hash survives reload and selects the footnote. Skip link does not overwrite it.
- [ ] Rate sliders re-price. Kill the API: old totals stay, banner offers retry.
- [ ] Crop 404 falls back to the quote text.
- [ ] Print preview: one column, sliders hidden, endnotes for every footnote, URL and date at the end.

**Review `/review`, `/review/:tenderId`** (needs a seeded API and a review token you were given;
never paste a token into a doc or a commit)
- [ ] Wrong token shows the gate error. No token configured shows "not configured".
- [ ] Override: comma and three-digit-dot amounts rejected, note required.
- [ ] Mark verified disabled while open items exist, enabled after, stamp plays once.
- [ ] Verified brief locks overrides until withdrawn.
- [ ] Re-ingest of a verified tender asks for confirmation.
- [ ] Live ingest modal: progress, failure with *Try again*, unknown stage stays "running".

## 4. Accessibility (WCAG 2.2 AA)

- [ ] axe: zero violations on `/`, with the modal open, on a brief and on a review brief
  (`e2e/a11y.spec.ts`).
- [ ] Keyboard only: Tab reaches every control in a sensible order. Tab through each route and
  confirm focus is never hidden under the nav bar.
- [ ] Footnote: Tab to it, Enter focuses the sidenote heading, Escape returns focus
  (`e2e/keyboard.spec.ts`).
- [ ] Screen reader pass on the hero chart (text alternative lists both orders), the leveling table
  and the check grid (real tables, `th` with `scope`).
- [ ] Colour is never the only signal: every status has a glyph and a word.
- [ ] Contrast: only token colours are used. `--ink-3` text is at least 5.3:1, `--edge` controls 3:1.
- [ ] Zoom to 200 % and 400 %: no clipped content, no horizontal scroll at 400 % on a brief.
- [ ] Reduced motion: every moment in `motion-and-interaction.md` shows its final state.
- [ ] Each page sets a unique `document.title`.

## 5. Privacy and network

- [ ] No third-party request at runtime: fonts are self-hosted, no analytics, no cookies.
- [ ] No `credentials` on any request. The token is only in the header and `sessionStorage`.
- [ ] Public brief payload has no `api_cost_usd` or `cogs_usd`.
- [ ] `robots.txt`, `sitemap.xml`, canonical link and structured data come from `VITE_SITE_URL`.

## 6. Design critique

Use the `design:design-critique` and `web-design-guidelines` skills on each changed page at 1440
and 375, then `design:accessibility-review` on the built UI. Judge against `web/DESIGN.md`:
colour only when something is wrong, one typeface, one curve, tokens only.

## 7. Launch gate (`npm run check:launch`)

Fails while any of these is open. They need the founder, not code.

1. `VITE_CONTACT_EMAIL` set.
2. `VITE_SITE_URL` set (an https origin).
3. Impressum and privacy text replacing `FOUNDER-TO-SUPPLY` in `src/content/impressum.md` and
   `privacy.md`.
4. The FAQ answer to "Who sees my documents?" signed off (copy deck holds `null`).
5. The sample snapshot is a live, verified ingest (not `answer_key`, not the e2e brief) and
   `VITE_SAMPLE_SHARE_ID` names it. Needs `ANTHROPIC_API_KEY` on the backend.

Deploy steps: `docs/deploy-checklist.md`.

## 8. Still open from earlier phases

- A GIF of the key flows (needs the model in Chrome, which did not connect in session 6).
- Hosting choice for the static build and the API.
