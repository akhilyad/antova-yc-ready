# Antova UI docs

Start here when you build or change the frontend in `web/`.

## Read in this order

1. `../superpowers/specs/2026-11-05-antova-frontend-design.md`: the binding spec (routes, behaviour,
   design system, copy deck, accessibility). Change the spec first, then the files below.
2. `../../web/PRODUCT.md`: what Antova is and how a brief is made.
3. `../../web/DESIGN.md` and `../../web/src/design/tokens.css`: the Footnote design system.
4. `../landing-proposal-2026-11-07.md`: the current landing pass and its build order.
5. `../../../HANDOFF.md` (in the `Antova/` workspace folder): decisions already made. Do not re-ask.

## The UI docs in this folder

| File | Answers |
|---|---|
| `screen-inventory.md` | What screens exist, what data each reads, which states each must handle |
| `component-catalog.md` | Which component to use, its props, and how to add one |
| `api-contract.md` | Which hook calls which endpoint, errors, polling, fixtures, env vars |
| `motion-and-interaction.md` | Motion rules, token values, the hero flip, focus and interaction rules |
| `qa-checklist.md` | Gates, viewports, per-page and accessibility checks, the launch gate |
| `content-guide.md` | Voice, vocabulary, what copy may claim, open copy items |

## Ignore

`antova/PRODUCT.md` and `antova/DESIGN.md` (in the workspace folder) describe an abandoned
carbon-emissions product. The `antova/` folder is never modified.

## Keeping these in sync

These files describe code that changes. When you change a route, a component's props, an endpoint,
a token or a copy rule, update the matching file in the same commit. The spec stays the source of
truth for behaviour, `tokens.css` for values, `copy.ts` for strings, `schemas.ts` for the API.
