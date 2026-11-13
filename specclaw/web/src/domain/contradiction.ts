/**
 * The tender's contradiction: the first cell whose bid says two different things, which the
 * replay's contradictions stage describes and the landing's receipt shows.
 *
 * A leaf module: it imports only schema types, by their `.ts` path, so a build script type
 * checked as Node ESM (scripts/snapshot-sample.ts, through sampleCrops.ts) can share it.
 */
import type { Extraction, Parameter, Tender, Vendor } from '../api/schemas.ts'

/** Every grid cell, vendor by vendor in tender order, parameters in tender order. */
export function* cellsInOrder(
  tender: Tender,
): Generator<{ vendor: Vendor; param: Parameter; paramId: string; cell: Extraction }> {
  for (const vendor of tender.vendors) {
    for (const param of tender.parameters) {
      // hasOwn: a vendor ID such as "constructor" must not reach Object.prototype.
      const cell = Object.hasOwn(param.vendors, vendor.id) ? param.vendors[vendor.id] : undefined
      if (cell !== undefined) yield { vendor, param, paramId: param.id, cell }
    }
  }
}

/** The first conflict (vendor/parameter order) that has a secondary citation. */
export function firstConflict(tender: Tender) {
  for (const entry of cellsInOrder(tender)) {
    if (entry.cell.secondary_citation !== null && entry.cell.conflict_note !== null) return entry
  }
  return null
}

/**
 * The cell the contradictions stage describes, where the replay's *Open the brief* lands
 * (the sample's VoltSwitch PARAM-01); null when the brief has no contradiction.
 */
export function contradictionCell(tender: Tender): { vendorId: string; paramId: string } | null {
  const conflict = firstConflict(tender)
  return conflict && { vendorId: conflict.vendor.id, paramId: conflict.paramId }
}
