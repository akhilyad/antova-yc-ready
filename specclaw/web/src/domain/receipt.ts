/**
 * One vendor's evaluated price as a receipt (landing proposal, step 3): the bid, each priced
 * gap with its footnote, technical then commercial, and the total. Lines and totals come from
 * the same leveling, so the receipt always adds up to the brief's evaluated price.
 */
import type { Tender } from '../api/schemas'
import { footnoteIndex, type Footnote } from './footnotes'
import type { VendorLevel } from './leveling'

export type ReceiptLine = {
  paramId: string
  /** The requirement's name, or its ID when the tender doesn't name it. */
  name: string
  adderCents: number
  /** The cell's footnote in the brief, or null when it has none. */
  footnote: Footnote | null
}

export type Receipt = {
  vendorId: string
  name: string
  bidCents: number
  technical: ReceiptLine[]
  techCents: number
  commercial: ReceiptLine[]
  commercialCents: number
  evaluatedCents: number
}

/**
 * The receipt for `vendorId` at the rates `levels` were priced with, or null for a vendor
 * `levels` doesn't have. A line is a cell whose adder is not zero, in the leveled cell order
 * (the tender's parameter order); a commercial parameter's line is commercial.
 */
export function receiptFor(
  tender: Tender,
  levels: readonly VendorLevel[],
  vendorId: string,
): Receipt | null {
  const level = levels.find((l) => l.vendorId === vendorId)
  if (level === undefined) return null
  const notes = new Map(
    footnoteIndex(tender, levels)
      .filter((note) => note.vendorId === vendorId)
      .map((note) => [note.paramId, note]),
  )
  const names = new Map(tender.parameters.map((p) => [p.id, p.name]))
  const technical: ReceiptLine[] = []
  const commercial: ReceiptLine[] = []
  for (const cell of level.cells) {
    if (cell.adderCents === 0) continue
    const line: ReceiptLine = {
      paramId: cell.paramId,
      name: names.get(cell.paramId) ?? cell.paramId,
      adderCents: cell.adderCents,
      footnote: notes.get(cell.paramId) ?? null,
    }
    ;(cell.commercial ? commercial : technical).push(line)
  }
  return {
    vendorId,
    name: level.name,
    bidCents: level.headlineCents,
    technical,
    techCents: level.techCents,
    commercial,
    commercialCents: level.commercialCents,
    evaluatedCents: level.evaluatedCents,
  }
}
