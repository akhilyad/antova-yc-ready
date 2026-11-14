# Content guide

How UI copy is written, where it lives and what it may claim. The audience is a buyer or
procurement engineer at an industrial company who has just awarded, or is about to award, a
switchgear tender. They are sceptical, technical and short of time.

## Where copy lives

- `web/src/content/copy.ts` holds every user-facing string. Components never inline text.
  Parameterised strings are functions that take already formatted values (money, dates).
- Spec §10 is the original copy deck. `copy.ts` is now ahead of it in places (the FAQ was
  extended in session 7, and the hero, receipt and How it works changed in session 8). When they
  disagree, `copy.ts` is current. Bring the spec back in line when you next edit a section.
- Long-form legal text is in `src/content/impressum.md` and `privacy.md`, rendered by `Legal.tsx`.
  The founder supplies them. A file that starts with `FOUNDER-TO-SUPPLY` blocks launch.
- Count strings pluralise by `n` (R12): "1 item needs you", "2 items need you".

## Voice

- Plain, factual, first person plural only where the offer needs it ("We re-check a tender you
  already awarded"). Short sentences. Name the thing: "the drawing governs", not "the more
  authoritative document prevails".
- Say what happened and what the reader can do. No hype, no urgency, no superlatives.
- Numbers are exact and sourced. If a number is on the page it is footnoted or comes from the
  committed sample. Never type a figure by hand that a brief already holds: read it from the data
  so it cannot drift.
- Errors state what failed and what is still safe: "Couldn't re-price. Showing the last prices."

## Fixed vocabulary

Use these words everywhere (`copy.terms`):

| Term | Meaning |
|---|---|
| bid | a vendor's offer |
| spec | the buyer's requirements. First mention: "spec (material requisition)" |
| gap | any shortfall against the spec that costs money to close |
| evaluated price | the bid plus what it costs to close every gap |
| brief | the output document |
| footnote | the link from a figure to the page it came from |

Do not swap in "deviation", "non-conformance", "TCO" or "adjusted price" in UI copy.

## Hard rules

1. **True content only.** The page may state only what is true today. No invented proof: no
   customer logos, pilots, testimonials, results, counts of tenders checked or founder bio. The
   page sells on the sample and the demo (landing proposal, user's choice).
2. **Restate, don't add.** A new FAQ answer must restate something the page or the sample already
   shows. Design-skill rule: never invent facts.
3. **The sample is labelled.** "Sample tender · synthetic documents, fictional vendors", plus
   "· test extraction" while `ingest_mode` is `answer_key`.
4. **Who sees my documents** is unanswered (`answer: null`) until the founder signs it off. It must
   state factually that page text is sent to Anthropic's LLM API to locate quotes, and the
   retention policy. Do not draft it as if settled.
5. **No hyphens or italics in UI copy.** Write "medium voltage gas insulated switchgear" and
   "re-check" only where the existing text already does. Geist has no italic.
6. **No green.** Not in copy about success either: "Verified" is plain, not celebratory.
7. **No promises the product can't keep.** "Within 24 hours" and "a person checks each brief"
   are founder commitments. Re-read them with the founder before launch.
8. Run new copy through the `unslop` skill, then `design:ux-copy` for buttons, empty states and
   errors.

## Patterns

| Element | Pattern | Example |
|---|---|---|
| Primary button | verb plus object | *Watch it check a tender* |
| Secondary button | verb plus object, says the cost | *Recheck a tender for free* |
| Link | names the destination | *Read the full sample brief* |
| Status tag | glyph plus word | ✓ Meets spec, ✗ Gap, ⇄ Contradiction, ∅ Missing, ↑ Exceeds spec, €? Unpriced, ! Needs inspection |
| Count | pluralised | "2 of 8 requirements met" |
| Money | `€482,800`, adder `+€18,500`, struck for superseded | en-GB grouping, matching the bid documents |
| Date | day month year in full | "5 November 2026" (`copy.months`) |
| Empty state | what is empty, how to fill it | "No tenders yet. Ingest one with … or *Run ingest*." |
| Error | what failed, what is safe, one action | "Can't reach Antova right now. The figures shown are from the last successful load." |
| Confirmation | state the consequence | "The share link will stop working until you verify it again." |

German formatting and UI are deferred. Keep strings out of components so the locale can be added
later.

## Open copy items

| Item | Owner | State |
|---|---|---|
| FAQ "Who sees my documents?" | founder | `null`, blocks launch |
| Contact email (`VITE_CONTACT_EMAIL`) | founder | unset, blocks launch |
| Impressum and privacy text | founder | placeholder, blocks launch |
| Hero heading gradient greys the word "cheapest." on the last line | founder decision | narrowing it (for example `#000` to `#444`) keeps the effect and the punch; left as is |
| "No such tender" message on `/review/:tenderId` | needs a copy line | the page shows the generic unreachable banner |
| Spec §10 out of date against `copy.ts` | any editor | bring back in line |

## Checklist for a new string

- [ ] In `copy.ts`, not in a component.
- [ ] Uses the fixed vocabulary.
- [ ] States nothing that isn't true today, or is read from the data.
- [ ] No hyphen or italic styling added, no green.
- [ ] Passed through `unslop` (and `design:ux-copy` if it is a button, error or empty state).
- [ ] Makes sense read aloud by a screen reader, with no meaning carried by colour alone.
- [ ] A test or the e2e covers it if the string is a contract (`copy.test.ts`).
