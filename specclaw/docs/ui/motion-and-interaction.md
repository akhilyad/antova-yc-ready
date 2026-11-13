# Motion and interaction

The rules for anything that moves or responds on the Antova frontend. The tokens are in
`web/src/design/tokens.css`. The landing choices come from `docs/landing-proposal-2026-11-07.md`
(session 8, the user's answers, do not re-ask).

## Principles

1. **One engine.** `motion` (v14, imported from `motion/react`) plus CSS transitions on `--ease`.
   No GSAP, no ScrollTrigger, no second animation library. Today `motion` runs in `MoneyFigure`,
   `RankingFlip` and `StageList`.
2. **One curve.** `--ease: cubic-bezier(0.22, 1, 0.36, 1)`, decelerating. No springs, bounce,
   squash or stretch. The audience is procurement; bounce reads as unserious.
3. **Nothing under 200 ms.** Durations come from tokens, never literals.
4. **The final state is the real state.** Reduced motion, the prerender, jsdom, no JavaScript and
   browsers without `IntersectionObserver` all show the finished page. Motion only ever adds a
   path to that state. It never hides content from someone who cannot see it play.
5. **Motion explains.** If a movement does not show a change of order, price or status, drop it.
6. **One signature moment on the landing.** Everything else on the landing stays still.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--duration-hover` | 300 ms | hover colour and opacity, nav button fill |
| `--duration-swap` | 300 ms | sidenote swap, focus |
| `--duration-settle` | 500 ms | layout and position, number settle, sheet, hero flip settle |
| `--duration-stamp` | 500 ms | verified stamp, once |
| `--duration-reveal` | 700 ms | unused on the landing since step 3 (only `tokens.test.ts` asserts it) |

Under `prefers-reduced-motion: reduce` every duration is 0 ms. JavaScript that cannot read a CSS
token calls `motionOk()` (`lib/motionOk.ts`) once on mount; it is false on the server, without
`IntersectionObserver`, `requestAnimationFrame` or `matchMedia`, and under reduced motion. Timings
that JavaScript needs in milliseconds come from `lib/settleMs.ts`.

## Inventory

| Moment | Trigger | What moves | Notes |
|---|---|---|---|
| Hero flip (signature) | Half the chart on screen, once | Bid labels first. Lines grow from the bid dot, staggered. Evaluated labels appear and count from bid to evaluated. "1st → 3rd" last. | Landing only (`play` prop). Settles in about 2.1 s. |
| Sandbox reorder | slider change | bars slide to their new rank | FLIP animation on `--duration-settle` |
| Vendor highlight | hover on a hero or sandbox vendor | other vendors dim to about 35 % | enhancement only, transition on `--duration-hover` |
| Nav recheck fill | hero buttons leave view | secondary to primary | `lib/useOnScreen.ts`, `--duration-hover` |
| Money figure | value change | counts to the new value | `MoneyFigure`; static first paint |
| Sidenote swap | footnote selected | content swaps | `--duration-swap` |
| Bottom sheet | footnote selected under 960 px | slides up | `--duration-settle` |
| Verified stamp | brief verified | double-ruled stamp pressed once | `VerifyBar`; skipped under reduced motion |
| Audit modal stages | replay or live | each stage's rule fills, findings appear | `StageList`; reduced motion shows all done |
| Buttons | hover, press | colour only | unchanged |

Retired on the landing: the tagline word reveal and the section rise on scroll (both from
session 7). `TaglineReveal`, `Reveal` and `EvidenceCard` are deleted.

## The hero flip, precisely

Schedule: `components/charts/flipTimeline.ts` (`flipSchedule`). Timing (milliseconds): start 200,
stagger 120, beat 160 before the first fallen vendor, settle `--duration-settle`.

Order: vendors whose rank held or improved first, in bid order. Then the beat. Then the vendors
that fell, so VoltSwitch lands last. Each vendor goes through three steps:

| Progress | Meaning |
|---|---|
| 1 | its line is drawing |
| 2 | it has landed: the evaluated label shows and the price counts from bid to evaluated |
| 3 | its rank change is marked ("1st → 3rd"), only for vendors that fell |

Implementation rules that cost time to learn:

- Grow lines by moving `x2` and `y2` (motion `animate`). Do not animate `pathLength`: it overwrites
  the dashed oxblood line's dash pattern.
- The prerender ships `data-flip="armed"` and marks hidden parts with `data-flip-part`. `index.html`
  has a `<noscript>` style that shows every part. JavaScript removes the armed state.
- The settled markup must equal the static chart. `RankingFlip.test.tsx` asserts it. Keep that test
  green when you touch either.
- Play when half the chart is on screen (`IntersectionObserver`, threshold 0.5). A hidden or
  background tab waits until it is shown.
- `e2e/a11y.spec.ts` waits for the flip to settle before running axe.
- Phone budget: at 375 × 812 and 390 × 844 the whole flip including "1st → 3rd" fits the first
  screen (the settled frame ends at 798 px).

## Interaction rules

| Area | Rule |
|---|---|
| Focus | `:focus-visible` ring, 2 px `--ink`, 2 px offset. Nothing may hide focus under the floating nav (`e2e/a11y.spec.ts` tabs through every route to check). Use `scroll-padding-top: var(--nav-height-total)`. |
| Footnotes | Selection is the URL hash. Enter on a footnote focuses the sidenote heading. Escape returns focus to the footnote. |
| Dialog and sheet | Focus trapped, Esc closes, focus returns to the opener, page scroll locked while open. |
| Live regions | Mount empty, then fill. The sandbox announces the new order after 500 ms without slider movement. |
| Sliders | Native range inputs. The announced value includes its unit (`valueText`). Re-price is debounced 150 ms and keeps the last good totals while loading or failed. |
| Targets | At least 24 × 24 px (`e2e/a11y.spec.ts` checks the footnote refs). |
| Sticky | The nav bar is floating (`--nav-height-total` clearance). The margin is sticky at 960 px and up. |

## Adding motion

1. Is the final state identical without it? If not, redesign.
2. Use `--ease` and a duration token. No new tokens without a spec change.
3. Gate JavaScript animation on `motionOk()` and make the static render the default.
4. Add a unit test that the settled DOM matches the static DOM, and extend the axe e2e if the
   element is on a checked page.
5. Update the inventory table above.
