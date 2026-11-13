/**
 * The real examples under the landing's How it works steps (landing proposal, step 4), taken
 * from the brief so nothing is typed by hand. Read: a requirement and the sentence a bid
 * answers it with, page and box kept. Check: one value converted to the spec's unit and
 * compared, and how many quotes were found on their page. Price: one gap's cost lines.
 *
 * Read and Price use the replay's contradiction (the sample's VoltSwitch PARAM-01), the cell
 * the landing's receipt shows just above; Check uses the replay's unit conversion.
 */
import type { Brief, Check, Citation, Rates } from '../api/schemas'
import { firstConflict } from './contradiction'
import { lineCents } from './leveling'
import { toCents } from './money'
import { conversionCheck } from './replay'

export type ReadSpecimen = { requirement: Citation; vendorName: string; found: Citation }

/** The spec's requirement and the bid's answer; null without both quotes on record. */
export function readSpecimen(brief: Brief): ReadSpecimen | null {
  const conflict = firstConflict(brief.tender)
  const requirement = conflict?.param.requirement_citation
  const found = conflict?.cell.citation
  if (!conflict || !requirement || !found) return null
  return { requirement, vendorName: conflict.vendor.name, found }
}

export type CheckSpecimen = {
  vendorName: string
  paramName: string
  check: Check
  /** Quotes found on their page word for word, of those located; null with no recorded run. */
  verified: { found: number; total: number } | null
}

/** A converted value as the code compared it; null when no value was converted. */
export function checkSpecimen(brief: Brief): CheckSpecimen | null {
  const conversion = conversionCheck(brief.tender)
  if (conversion === null) return null
  const stats = brief.ingest_stats
  return {
    vendorName: conversion.vendor.name,
    paramName: conversion.param.name,
    check: conversion.check,
    verified: stats && {
      found: stats.candidates_accepted,
      total: stats.candidates_accepted + stats.candidates_rejected,
    },
  }
}

export type PriceLine = {
  label: string
  qty: string
  unit: string
  /** The rate table's rate per unit, before any slider. */
  rateCents: number
  /** The line at `rates`. */
  cents: number
}

export type PriceSpecimen = {
  vendorName: string
  paramName: string
  lines: PriceLine[]
  totalCents: number
}

/**
 * The gap's cost lines priced at `rates`, and their sum. Null when it has no cost lines, or a
 * founder's override priced it instead: then the lines would not add up to its adder.
 */
export function priceSpecimen(brief: Brief, rates: Rates): PriceSpecimen | null {
  const conflict = firstConflict(brief.tender)
  if (!conflict || conflict.cell.cost_lines.length === 0) return null
  const overridden = brief.overrides.some(
    (o) => o.vendor_id === conflict.vendor.id && o.param_id === conflict.paramId,
  )
  if (overridden) return null
  const lines = conflict.cell.cost_lines.map((line) => ({
    label: line.label,
    qty: line.qty,
    unit: line.unit,
    rateCents: toCents(line.rate),
    cents: lineCents(line, rates),
  }))
  return {
    vendorName: conflict.vendor.name,
    paramName: conflict.param.name,
    lines,
    totalCents: lines.reduce((sum, line) => sum + line.cents, 0),
  }
}
