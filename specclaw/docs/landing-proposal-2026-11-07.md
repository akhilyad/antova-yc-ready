# Landing conversion pass: proposal (2026-11-07, session 8)

Status: proposed, not built. Applies to `web/src/pages/Landing.tsx` and `web/src/components/landing/*`.

## User's choices (session 8, do not re-ask)

| Topic | Choice |
|---|---|
| Hero action | Demo first, offer beside: *Watch it check a tender* stays primary, the free recheck becomes the second hero button, the nav's *Recheck a tender* becomes the persistent conversion |
| Motion | One signature moment: the hero chart plays the flip once; sandbox bars reorder; hovering a vendor highlights it. Everything else on the landing stays still |
| Visual direction | Annotated documents: real crops of the vendors' pages with oxblood markup become the main visuals. Footnote palette and Geist unchanged |
| Proof beyond the sample | None yet. No founder note, logos, pilots or results. The page sells on the demo alone |

Consequence of the motion choice: the tagline word reveal and the section rise on scroll (both picked in session 7) retire on the landing. The tagline's sentence survives as the receipt section's lead line.

## What the review found

Strong, keep as is: the H1 ("The cheapest bid wasn't the cheapest."), proof in the first viewport, the replay modal (a working demo, not a video), the sandbox running the real formula, the FAQ, and the accessibility work.

Holding conversion back:

1. **The flip never plays.** The slope chart is static, so the one moment that sells (VoltSwitch going from 1st to 3rd) happens before anyone looks. On a 375 × 812 phone the chart starts about 545 px down and VoltSwitch's evaluated price sits below the fold.
2. **The offer is buried.** The free recheck is the business conversion but is never a primary button; it first appears about 2,300 px down. The nav's *Recheck a tender* is styled secondary.
3. **No visual peak.** Seven sections share one treatment (left heading, body, paper, 96 px gaps). The strongest evidence, the struck cover-letter claim against the drawing, is small text in a thin box.
4. **The thesis is said three times** (lede, footnote card, tagline section) while the €64,800 hidden in VoltSwitch's bid is never totalled on the page.
5. **Who it's for is missing from the hero.** "Medium voltage gas insulated switchgear" appears only in the FAQ.
6. **Launch blocker that kills conversion:** with `VITE_CONTACT_EMAIL` unset the offer renders no button at all (already on the `check:launch` list).

## Toolset

| Tool | Verdict | Why |
|---|---|---|
| `motion` (installed, v14) via `motion/react` | Keep, the only animation engine | Already ships for MoneyFigure and the replay. Covers the flip, `layout` reorder and `useInView` |
| CSS transitions + `--ease` | Keep | Hover and press already use the one curve |
| GSAP + ScrollTrigger | Don't add | A second engine whose value is pinning and scrubbing; the chosen motion level has neither |
| `framer-motion` skill | Reference only | Same API as `motion`. Skip its squash, stretch and spring advice: the system keeps one curve and a procurement audience reads bounce as unserious |
| `theme-factory` | Skip | Its preset themes would replace the Footnote palette |
| `web-artifacts-builder` | Skip | Builds single-file claude.ai artifacts with Tailwind and shadcn, not this Vite + CSS modules app |
| `design:design-system` | Later, if someone else builds on it | `design/tokens.css` already is the system |
| `design:ux-copy` | Use | Hero second button, receipt captions, offer checklist |
| `design:design-critique` | Use after each section | At 1440 and 375 px |
| `web-design-guidelines` | Use as the final audit | Before merge, with axe and e2e |

## Proposed page, top to bottom

1. **Nav.** Wordmark, How it works, Sample brief, *Recheck a tender*. The button is secondary while the hero is on screen and fills to primary once the hero scrolls out, so each viewport has one primary.
2. **Hero.** A one-line eyebrow naming the equipment (copy from the FAQ's "medium voltage gas insulated switchgear"), the H1 and lede unchanged. Buttons: *Watch it check a tender* (primary) and a recheck button (secondary, to `#offer`), with one line beneath restating the offer body: within 24 hours, nothing sent to vendors. *Read the sample brief* moves under the chart as a text link, since the chart is the sample. The chart plays the flip (motion budget below).
3. **Receipt: where VoltSwitch's +€64,800 came from.** Replaces the footnote card and the tagline section. Lead line: the tagline sentence. Left: the two real crops, the cover letter p. 2 claim struck in oxblood and the drawing p. 11 NOTE 7 marked, with "+€18,500" in the margin. Right: a receipt of VoltSwitch's gaps from the sample data (technical €49,000, commercial €15,800), each line linking to its footnote in the brief, totalling €418,000 → €482,800.
4. **How it works.** Each step shows its real artifact under the text. Read: a small crop with its highlight box. Check: "104 °F → 40 °C" against the 40 °C limit, and "36 of 36 quotes found word for word". Price: "11 bays × €1,600 + €900". Closing line unchanged, then a second *Watch it check a tender* button.
5. **Sandbox.** As now, plus the reorder.
6. **Offer.** Two columns. Left: heading, body, button. Right: what to send (the mailto checklist: equipment type, package value range, number of bids, spec and bid PDFs) and what comes back (a brief like the sample, every gap priced and footnoted).
7. **FAQ** and footer, unchanged.

Seven sections become six and the page gets shorter.

## Motion budget

Reduced motion, the prerender and jsdom all show the final state.

| Moment | Trigger | What moves | Notes |
|---|---|---|---|
| Hero flip (signature) | Page load at ≥ 60 rem; entering view on phones; once | Bid labels show first. Each line grows from its bid dot, staggered about 120 ms; evaluated labels appear as their line lands; VoltSwitch's oxblood dashed line lands last, its figure counts €418,000 → €482,800 (MoneyFigure) and "1st → 3rd" appears. About 1.6 s in all | Grow lines by moving `x2`/`y2` from the start point, not `pathLength`, which would overwrite the dash pattern. Landing only: add an opt-in prop so the brief page's chart stays static |
| Sandbox reorder | Slider change | Bars slide to their new rank (`layout`, `--duration-settle`); figures already count | |
| Vendor highlight | Hover on the hero chart or a sandbox bar | Other vendors dim to about 35 % across both columns | Enhancement only; the hidden lists carry the information |
| Nav button fill | Hero leaves view | Secondary → primary over `--duration-hover` | IntersectionObserver |
| Buttons | Hover, press | Unchanged | |

## Data and build notes

- The crops come from the API today (`evidenceUrl`). Extend `npm run snapshot:sample` to write the needed crops to `web/public/sample/` so the landing still makes no API request; lazy-load them below the fold.
- The receipt and the How it works artifacts read the committed snapshot through `footnoteIndex` and `levelTender`: nothing typed by hand, so they can't drift from the brief.
- New copy goes through `copy.ts` and unslop; no hyphens or italics in UI copy.

## Build order

Each step lands with unit, e2e and axe green.

1. Hero buttons, eyebrow, offer line, nav fill.
2. Hero flip in RankingFlip, with a test that the final DOM equals today's static chart.
3. Snapshot crops; receipt section; retire TaglineReveal and Reveal on the landing.
4. How it works artifacts.
5. Sandbox reorder and vendor highlight.
6. Offer two columns.
7. design-critique at 1440 and 375, web-design-guidelines audit, e2e.

## Small item for the user

The black-to-grey heading gradient (session 7) greys out the punchline word "cheapest." at the end of the last line. Narrowing it (for example `#000` → `#444`) keeps the effect and the punch. Left as is until the user says.
