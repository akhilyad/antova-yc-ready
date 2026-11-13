/**
 * The leveling engine: each vendor's evaluated price = headline + technical adders +
 * commercial adders, re-priced in the browser so the sliders answer instantly. It mirrors
 * `specclaw_engine.evaluate_vendor_financials` (line pricing in `line_amount`/`adder_amount`)
 * and must agree with it to the cent; parity-cases.json, generated from the Python engine,
 * is the proof. All arithmetic is Decimal or integer cents; no euro floats are summed.
 */
import Decimal from 'decimal.js-light'
import type {
  ComplianceStatus,
  CostLine,
  Extraction,
  OverrideEntry,
  PricingStatus,
  Rates,
  Tender,
} from '../api/schemas'
import { toCents } from './money'

/** Python's Decimal context: 28 significant digits; half-up per the plan's ruling. */
const D = Decimal.clone({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

/** One requirement × vendor cell of the leveled grid. */
export type CellLevel = {
  paramId: string
  status: ComplianceStatus
  pricingStatus: PricingStatus
  adderCents: number
  overridden: boolean
  overrideNote: string | null
  /** The parameter's criticality is COMMERCIAL, so the adder counts as commercial. */
  commercial: boolean
}

/** A vendor's leveled price; every amount is integer euro cents. */
export type VendorLevel = {
  vendorId: string
  name: string
  headlineCents: number
  techCents: number
  commercialCents: number
  evaluatedCents: number
  cells: CellLevel[]
}

/** A slider value as Python's `Decimal(str(x))` sees it: by its shortest decimal string. */
function multiplier(x: number): Decimal {
  return new D(String(x))
}

/** One cost line under the sliders. Labour lines store hours; the slider is the €/h rate. */
function lineAmount(line: CostLine, rates: Rates): Decimal {
  const qty = new D(line.qty)
  switch (line.driver) {
    case 'copper':
      return qty.times(line.rate).times(multiplier(rates.copper))
    case 'labour':
      return qty.times(multiplier(rates.labour))
    case 'freight':
      return qty.times(line.rate).times(multiplier(rates.freight))
    case 'fixed':
      return qty.times(line.rate)
  }
}

/**
 * One cost line's amount in cents under the sliders, rounded half-up on its own (for display:
 * a cell's adder rounds the unrounded sum once, so lines can differ from it by a cent).
 */
export function lineCents(line: CostLine, rates: Rates): number {
  return toCents(lineAmount(line, rates).toString())
}

/**
 * A cell's computed adder in cents: its cost lines summed unrounded, then rounded half-up
 * to the cent once. Legacy cells without cost lines use their stored `cost_adder`.
 */
export function adderCents(extraction: Extraction, rates: Rates): number {
  if (extraction.cost_lines.length === 0) return toCents(extraction.cost_adder)
  const total = extraction.cost_lines.reduce<Decimal>(
    (sum, line) => sum.plus(lineAmount(line, rates)),
    new D(0),
  )
  return toCents(total.toString())
}

/**
 * Levels every vendor of the tender, in the tender's vendor order. An override, keyed by
 * (param_id, vendor_id), replaces the cell's computed adder whatever the sliders say; a
 * later entry for the same cell wins. A parameter the vendor has no extraction for is skipped.
 */
export function levelTender(
  tender: Tender,
  rates: Rates,
  overrides: OverrideEntry[],
): VendorLevel[] {
  const overrideFor = new Map<string, Map<string, OverrideEntry>>()
  for (const entry of overrides) {
    const byVendor = overrideFor.get(entry.param_id) ?? new Map<string, OverrideEntry>()
    byVendor.set(entry.vendor_id, entry)
    overrideFor.set(entry.param_id, byVendor)
  }

  return tender.vendors.map((vendor) => {
    const cells: CellLevel[] = []
    let techCents = 0
    let commercialCents = 0
    for (const param of tender.parameters) {
      // hasOwn: a vendor ID such as "constructor" must not reach Object.prototype.
      const extraction = Object.hasOwn(param.vendors, vendor.id)
        ? param.vendors[vendor.id]
        : undefined
      if (extraction === undefined) continue
      const override = overrideFor.get(param.id)?.get(vendor.id)
      const cents = override ? toCents(override.adder_eur) : adderCents(extraction, rates)
      const commercial = param.criticality === 'COMMERCIAL'
      if (commercial) commercialCents += cents
      else techCents += cents
      cells.push({
        paramId: param.id,
        status: extraction.status,
        pricingStatus: extraction.pricing_status,
        adderCents: cents,
        overridden: override !== undefined,
        overrideNote: override ? override.note : null,
        commercial,
      })
    }
    // An unknown price arrives as null. Inside the app it is 0 cents, which every view already
    // treats as "not priced".
    const headlineCents = toCents(vendor.headline_price ?? 0)
    return {
      vendorId: vendor.id,
      name: vendor.name,
      headlineCents,
      techCents,
      commercialCents,
      evaluatedCents: headlineCents + techCents + commercialCents,
      cells,
    }
  })
}
