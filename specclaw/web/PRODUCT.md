# Antova: product truth

Source: `docs/superpowers/specs/2026-11-05-antova-frontend-design.md` §2–§3. Change the spec first,
then this file. (`antova/PRODUCT.md` describes an older carbon-emissions product and is not this.)

## What it is

Antova (codename SpecClaw) evaluates bids for heavy electrical equipment. The input is a spec
(material requisition, "MR") and 3–5 vendor bid PDFs. The output is a brief: each bid's
evaluated price, with every euro footnoted to the page it came from.

How a brief is made:

1. The ingest pipeline parses every page and asks Claude to find the quote in each bid that
   answers each requirement.
2. Code checks that each quote appears word for word on its page; a quote that doesn't is thrown
   out.
3. Code reads the values and checks them with Pint, so "104 °F" meets a 40 °C limit only after
   conversion.
4. Where documents disagree, precedence decides (a drawing governs over a cover letter).
5. Each gap is priced from a rate table anyone can read.

Evaluated price = bid price + technical adders + commercial adders. The model finds quotes; code
does the maths.

## The sample tender

`TENDER-2026-402` (33 kV GIS switchgear) is synthetic: the PDFs are generated, and the vendors
Nordwerk, VoltSwitch and Deltaport are fictional. The pipeline run on it gives:

| Bidder                         | Bid price | Technical adders | Commercial adders | Evaluated    |
| ------------------------------ | --------- | ---------------- | ----------------- | ------------ |
| Nordwerk Schaltanlagen GmbH    | €452,000  | €0               | €0                | **€452,000** |
| Deltaport Skid Consortium B.V. | €439,000  | €10,300          | €4,700            | €454,000     |
| VoltSwitch Industrial          | €418,000  | €49,000          | €15,800           | €482,800     |

116 pages, 12 drawing sheets, 36 quotes accepted and 0 rejected, 39 checks, 10 non-compliant
cells. The lowest bid (VoltSwitch, €418,000) is the dearest once its gaps are priced.

Until a live Claude run of the sample is reviewed and verified, the public sample is answer-key
output and the site says so ("test extraction").

## What the UI must show honestly

- Pricing status: priced, unpriced (a gap found but no rate, so its adder is €0), or none.
- Compliance status: meets spec, gap (deviation or omission), contradiction, exceeds spec, or
  needs inspection.
- A bid price of 0 means the price wasn't found: that bidder is excluded from the ranking.
- No number appears that doesn't trace to the data.

## Users

- **Prospect**: a package engineer or procurement director at an EPC, DACH first. Arrives by a
  share link after a re-check of a tender they already awarded, or through the landing page.
  Success: understands within 10 seconds that the cheapest bid wasn't the cheapest, and can open
  the vendor's own sentence and page behind any euro.
- **Founder**: runs re-checks by hand (the prospect emails PDFs; the founder ingests, reviews and
  sends a link). Success: can check citations, override a wrong or missing adder with a note, and
  only then publish a brief.
- **YC partner** watching the demo. Success: follows the reversal (€418,000 → €482,800) without
  knowing the domain, and sees that the numbers come from code and pages, not the model.

## Done means

1. Landing → _Watch it check a tender_ → replay → _Open the brief_ → the brief at footnote 1.
2. Share link → brief → footnote → sidenote with quotes, page crop, checks and arithmetic →
   sliders re-price.
3. Founder → review token → draft brief → override an adder → mark verified → copy share link.

All three work end to end against the real backend, pass the test suite and meet WCAG 2.2 AA.
