# Component catalog

All components live in `web/src/components/`, each with a CSS module beside it. Props below are
the real ones from the source; read the file for the details. Rules every component follows:

- Strings come from `src/content/copy.ts`. No inline user-facing text.
- Colours, type, spacing, radii and durations come from `src/design/tokens.css`. No raw values.
- Motion reads the duration tokens, and a reader who asks for reduced motion gets the final state.
- Anything interactive has a visible `:focus-visible` ring (2 px `--ink`, 2 px offset) and a target
  of at least 24 × 24 px.

Domain logic is in `src/domain/` (pure functions, 100 % covered). Components call it, they do not
re-derive prices, footnote numbers or verdicts.

## ui (shared)

| Component | Props | Notes |
|---|---|---|
| `Button` | `variant?: primary \| secondary \| link`, `loading?`, native button props | `buttonClassName()` gives the look to a link (the modal's *Open the brief*). `loading` disables and sets busy. |
| `Banner` | `variant`, `children`, `actions?`, `details?` | Draft, verified, replay, error. `details` holds block content (a list) that cannot sit in the message paragraph. |
| `Dialog` | `open`, `onClose`, `labelledBy`, `size?: default \| wide`, `children` | Focus trap, Esc, focus returns to the opener, page scroll locked (`useModalFocus`). `wide` is the audit modal. |
| `BottomSheet` | `open`, `onClose`, `labelledBy`, `children` | Dialog semantics under 960 px. |
| `SensitivitySlider` | `label`, `display`, `valueText`, `value`, `min`, `max`, `step`, `onChange` | Native range input. `display` is shown ("×1.20"), `valueText` is announced ("1.20 times the rate table"). |
| `SensitivitySliders` | `rates`, `onChange`, `onReset?`, `layout?: grid \| stack` | Copper, labour, freight, plus *Reset rates* (passes `DEFAULT_RATES`). Controlled. |

## brief

| Component | Props | Notes |
|---|---|---|
| `BriefView` | `brief`, `scope`, `reviewSlot?`, `cellHighlight?` | Whole brief. `reviewSlot(cell)` renders inside the open sidenote (override form). `cellHighlight(cell)` marks grid cells that need the founder. |
| `Masthead` | `brief`, `levels` | Kicker, title, client, meta line, sample and test-extraction labels. |
| `VerdictSentence` | `verdict` | Renders `domain/verdict` output. An empty sentence (`no_prices`) is left out and each unpriced bid gets its own line (R18). |
| `LevelingTable` | `levels` | Real table. A bid with no price says so instead of €0. |
| `Findings` | `tender`, `levels`, `footnotes`, `selected` | One block per bidder, one row per footnoted cell. |
| `CheckGrid` | `tender`, `levels`, `footnotes`, `selected`, `cellHighlight?` | Requirements × bidders, every cell opens its sidenote. Scroll region has `tabindex=0` and a label. |
| `CheckStrip` | `cells` | One mark per requirement, then "2 of 8". Screen readers hear "2 of 8 requirements met". |
| `CheckRow` | `check`, `label?` | ✓/✗ + field + required (with operator) + offered + canonical value. |
| `StatusTag` | `status`, `pricingStatus`, `overridden` | Glyph + word. The glyph is decoration; the word is announced. Mapping in `domain/status.ts`. |
| `FootnoteRef` | `footnote`, `selected` | Superscript link to `#f-{vendor}-{param}`. Padded to a 24 px target. |
| `Sidenote` | `tender`, `cell`, `scope`, `levels`, `headingRef`, `headingId?`, review slot | Your spec, the bid says, also in the bid, on the page, checks, how it's priced. |
| `PageCrop` | `scope`, `paramId`, `source`, `which`, `alt` | Skeleton, image, then text fallback on a 404. Alt text is the quote. |
| `Quote` | `variant: requirement \| governing \| superseded`, `citation` | A superseded quote is struck and announced "Contradicted:" first. |
| `MoneyFigure` | `cents`, `variant: headline \| struck \| adder \| total` | Integer cents in, `€482,800` out. Counts to a new value with `motion`. |
| `RateSliders` | `scope`, `onPriced` | Debounced 150 ms re-price via the evaluate endpoint. `onPriced` fires only with the newest settled result. |
| `Method` | `brief` | Rate table and effective date, cost lines per adder, who did what, ingest mode. |

## charts

| Component | Props | Notes |
|---|---|---|
| `RankingFlip` | `levels`, `height?`, `play?` | SVG slope chart, bid order to evaluated order. `play` (the hero only) runs the flip once at half on screen. Prerender ships `data-flip="armed"`; the settled markup equals the static chart (tested). Text alternative lists both orders. |
| `SensitivityBars` | `levels`, `scaleCents` | Stacked bars (bid, technical, commercial). `scaleCents` is fixed by the caller so a bar changes length only when its own price moves. |
| `flipTimeline.ts` | `flipSchedule(vendors, timing)` | Pure schedule: unworsened vendors first in bid order, a beat, then the fallen vendors, so VoltSwitch lands last. |

## landing

| Component | Props | Notes |
|---|---|---|
| `Nav` | `briefHref`, `howItWorksId`, `offerId`, fill flag | Floating bar. The recheck button fills once the hero buttons leave the screen (`lib/useOnScreen.ts`). |
| `Hero` | `levels`, `testExtraction`, `briefHref`, `offerId`, `onWatch`, button-row ref | Eyebrow, H1, lede, two buttons, offer terms, flip chart, sample label. |
| `Receipt` | `brief`, `levels`, `briefHref` | Where VoltSwitch's extra €64,800 comes from: two real crops beside a receipt table (`domain/receipt.ts`). Crops are static files in `public/sample/evidence/…`. |
| `HowItWorks` | `id`, `brief`, `rates`, `onWatch` | Read, Check, Price, each with a real example (`domain/howItWorks.ts`), then a second watch button. |
| `Sandbox` | `brief` | Three sliders, bars re-sort live with the real formula (`domain/leveling.ts`). Announces the new order after 500 ms of stillness. |
| `Offer` | `id`, `email: string \| null` | Two columns. Left: heading, body, mailto button and copyable address (`mailto.ts`). Right: checklist of what to send and what comes back. No email: no button. |
| `Faq` | none | Reads `copy.landing.faq`. An answer of `null` is unsigned and blocks launch. |
| `Footer` | `tenderId` | Sample disclaimer block inside `main`, not a second footer landmark. |
| `sampleCrops.ts`, `sample.ts` | | Which crops the receipt uses, the committed sample, `briefHref()`. |

## modal

| Component | Props | Notes |
|---|---|---|
| `AuditModal` | `open`, `onClose`, `source` | `source` is replay (from a brief) or live (tender and mode). Esc closes, *Skip to result* always there. |
| `StageList` | `stages`, `label`, `reducedMotion`, `paused?` | Pending, active, done, failed. The active stage's rule fills over its duration. |
| `DocCard` | `title`, `filename`, `pages`, `state` | Follows the reading stage. |
| `useReplay`, `useLiveIngest` | | Replay timing from `stage_log`; live polling of the job. A finished job never reads as lost (R29). |

## review

| Component | Props | Notes |
|---|---|---|
| `TokenGate` | `onSubmit`, `rejected?` | One field. Caller stores the token trimmed. |
| `OverrideForm` | `tenderId`, `token`, `cell`, `override`, `locked`, saved callback | Euro amount plus required note. Rejects comma and three-digit-dot amounts. `locked` on a verified brief (R10). |
| `VerifyBar` | `brief`, `tenderId`, `token` | Mark verified (disabled while open items), stamp once, copy share link, withdraw. |
| `RunIngestForm` | `defaultTenderId?`, `onStart`, folder field ref | Folder ID validated against `^[A-Z0-9-]{1,64}$`, mode `replay`, `auto` or `live`. |
| `ReingestConfirm` | | Confirms by the target tender's state (R28). |

## Adding a component

1. Put the strings in `copy.ts` first (and in spec §10 if the page is public).
2. Take colours, type, spacing and durations from tokens. Run `npm run lint`.
3. Write the unit test beside it. Anything with logic goes in `src/domain` and needs 100 % coverage
   (`npm run test:coverage`).
4. If it appears on a page axe checks, extend `e2e/a11y.spec.ts`.
5. Add a row here.
