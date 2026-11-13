# Antova design system: "Footnote"

Warm paper, one typeface (Geist), one oxblood accent. The page reads like an annotated
engineering brief: every euro carries a footnote back to the page it came from.

Source of truth: `docs/superpowers/specs/2026-11-05-antova-frontend-design.md` §8. Tokens live in
`src/design/tokens.css`; strings live in `src/content/copy.ts`. Change the spec first, then these.
Since session 7 the type, spacing and motion follow the design-skill repo (`landing-page-design`
Part B); the colour palette is still Footnote. The motion and landing rules are in
`../docs/ui/motion-and-interaction.md`.

## Rules

1. **Colour appears only when something is wrong.** Gaps, hidden cost, footnote markers and ✗ are
   oxblood (`--ox`) on `--ox-wash`. Passing items are ink. **No green anywhere**, including
   success states ("Verified" is ink).
2. **Ledger figures.** Every number uses tabular lining figures (`font-variant-numeric:
var(--figures)`, set on `body`). Geist has no italic; never ask for one.
3. **Nothing under 12 px** except superscript footnote markers.
4. **`--rule` is decorative only.** Anything a user operates (inputs, slider track, checkbox) uses
   `--edge`, which meets 3:1 against paper.
5. **Motion is optional.** `prefers-reduced-motion: reduce` sets every duration to 0; components
   must read the duration tokens, never hard-code times.
6. **No third-party requests at runtime.** Fonts are self-hosted via `@fontsource-variable`. No
   analytics, no cookies.
7. **Copy comes from `copy.ts`.** Components never inline user-facing strings.

## Tokens

### Colour

Contrast is against `--paper`.

| Token       | Value     | Contrast | Use                                                |
| ----------- | --------- | -------- | -------------------------------------------------- |
| `--paper`   | `#FBFAF6` |          | Page                                               |
| `--surface` | `#FFFFFF` |          | Sidenote, crops, inputs                            |
| `--band`    | `#F3EFE6` |          | Section bands, slider track fill                   |
| `--ink`     | `#16130F` | 17.7:1   | Text, ✓ marks, focus ring                          |
| `--ink-2`   | `#4A443C` | 9.2:1    | Secondary text                                     |
| `--ink-3`   | `#675F55` | 6.0:1    | Labels, captions (5.3:1 on wash)                   |
| `--rule`    | `#E4DFD4` |          | Decorative dividers only                           |
| `--edge`    | `#8F877A` | 3.4:1    | Control boundaries: inputs, slider track, checkbox |
| `--ox`      | `#9E2B1F` | 7.1:1    | Gaps, hidden cost, footnote markers, ✗             |
| `--ox-wash` | `#F7EAE6` |          | Background of gap cells                            |

### Type

- One family, Geist Variable (self-hosted, `src/design/fonts.css`). `--font-display` (headings,
  figures, quotes) and `--font-sans` (UI) are both Geist; they are separate so they can diverge.
  `--font-mono` is the system monospace.
- Scale (Tailwind steps only): `--text-12` `14` `16` `18` `20` `24` `30` `36` `48` `60`. Body is
  `--text-16`.

### Space, radius, shadow

- Spacing: `--space-2` `4` `8` `12` `16` `24` `32` `40` `48` `64` `80` `96`. No other values.
- Radius: `--radius-paper` 2 px (paper objects), `--radius-control` 6 px (buttons, inputs),
  `--radius-tag` 999 px (tags), `--radius-bar` 16 px (the floating nav bar).
- Shadow: `--shadow-raised`, one soft elevation, for the sidenote and dialog only.

### Motion

| Token               | Value  | Use                                     |
| ------------------- | ------ | --------------------------------------- |
| `--duration-hover`  | 300 ms | Hover colour and opacity                |
| `--duration-swap`   | 300 ms | Sidenote swap, focus                    |
| `--duration-settle` | 500 ms | Layout, number settle, sheet, hero flip |
| `--duration-stamp`  | 500 ms | Verified stamp, played once             |
| `--duration-reveal` | 700 ms | Unused on the landing since step 3      |
| `--ease`            |        | `cubic-bezier(0.22, 1, 0.36, 1)`        |

Nothing under 200 ms. All durations are 0 under `prefers-reduced-motion: reduce`.

### Layout

- The nav is a floating bar: `--nav-height` 48 px, `--nav-gap` 12 px from the top edge.
  `--nav-height-total` (gap + height + gap) is what everything sticky or anchored must clear.

## Money

- Amounts: `€482,800` (en-GB grouping, matching the bid documents so quotes and figures agree).
- Adders: `+€18,500`.
- Superseded bid ranks show the struck price.
- German formatting arrives with the deferred DE locale.

## Components

Each defines default, hover, focus-visible, active, disabled, loading and error states where
relevant.

| Component                    | Notes                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Button`                     | primary (ink fill), secondary (outline), link                                                                        |
| `FootnoteRef`                | superscript link to `#f-…`; selected state underlined in oxblood                                                     |
| `Sidenote` / `BottomSheet`   | sticky margin ≥ 960 px; modal sheet below                                                                            |
| `Quote`                      | variants: requirement, governing, superseded (struck)                                                                |
| `PageCrop`                   | skeleton → image → text fallback                                                                                     |
| `CheckRow`                   | ✓/✗ + field + required + offered + canonical                                                                         |
| `StatusTag`                  | glyph + word: Meets spec ✓ · Gap ✗ · Contradiction ⇄ · Missing ∅ · Exceeds spec ↑ · Unpriced €? · Needs inspection ! |
| `MoneyFigure`                | headline, struck, adder, total                                                                                       |
| `CheckStrip`                 | 8 marks + text equivalent                                                                                            |
| `LevelingTable`, `CheckGrid` | real `<table>`s with `th`/`scope`                                                                                    |
| `RankingFlip`                | SVG slope chart; the line of a bidder whose rank worsens is oxblood; text alternative lists both orders              |
| `SensitivitySlider`          | native range input; value + unit announced; reset                                                                    |
| `VerdictSentence`            | renders `verdict.ts` output                                                                                          |
| `StageList`, `DocCard`       | modal parts; pending / active / done / failed                                                                        |
| `Dialog`                     | focus trap, Esc, return focus                                                                                        |
| `Banner`                     | draft, verified, replay, error                                                                                       |
| `TokenGate`, `OverrideForm`  | review mode                                                                                                          |

## App shell (accessibility)

- A skip link ("Skip to content") is the first focusable element and targets `<main id="main">`.
- Landmarks: `header` (banner) with the home link, `main`.
- Each route sets `document.title` as "{Page} · Antova" (e.g. "Page not found · Antova").
- Focus ring: 2 px `--ink` outline, 2 px offset, on `:focus-visible`.
