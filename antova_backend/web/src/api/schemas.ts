/**
 * The backend's JSON payloads, as zod schemas with their inferred types.
 *
 * The committed fixtures in src/test/fixtures are the contract (a backend test keeps them
 * byte-identical to a fresh export); schemas.test.ts parses each one. Numbers arrive the
 * way the backend sends them: financial totals as JSON numbers, Decimal values (`qty`,
 * `rate`, an override's `adder_eur`) as strings. Nothing here coerces or does arithmetic;
 * domain code converts to cents. Objects are not strict, so a new backend field is ignored.
 */
import { z } from 'zod'

export const ComplianceStatus = z.enum([
  'COMPLIANT',
  'CONFLICT_DOWNGRADE',
  'DEVIATION_DOWNGRADE',
  'DEVIATION_UPGRADE',
  'OMITTED',
  'MANUAL_INSPECTION_REQUIRED',
])
export type ComplianceStatus = z.infer<typeof ComplianceStatus>

export const Criticality = z.enum(['MANDATORY', 'HIGH', 'MEDIUM', 'COMMERCIAL'])
export type Criticality = z.infer<typeof Criticality>

export const PricingStatus = z.enum(['NONE', 'PRICED', 'UNPRICED'])
export type PricingStatus = z.infer<typeof PricingStatus>

export const BriefStatus = z.enum(['DRAFT', 'VERIFIED'])
export type BriefStatus = z.infer<typeof BriefStatus>

/** Where a quote sits: a page and a PDF-point box [x0, y0, x1, y1]. */
export const Citation = z.object({
  filename: z.string(),
  page: z.number().int(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  quote: z.string(),
  paragraph: z.string(),
  section: z.string(),
  /** "exact", or "dehyphenated" when the quote only matched with a line-end hyphen removed. */
  match: z.string().optional(),
  /** One box per text line of the quote; `bbox` is their outer box. */
  rects: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).optional(),
})
export type Citation = z.infer<typeof Citation>

/** One requirement field of a parameter, as the MR states it. */
export const CheckSpec = z.object({
  field: z.string(),
  label: z.string(),
  operator: z.string(),
  required: z.string(),
})
export type CheckSpec = z.infer<typeof CheckSpec>

/** One field of a bid checked against the requirement. */
export const Check = z.object({
  field: z.string(),
  operator: z.string(),
  required: z.string(),
  offered: z.string(),
  offered_canonical: z.string(),
  passed: z.boolean(),
  citation_ref: z.string(),
  /** Where each side measures a warranty from; null for every other field. */
  required_basis: z.string().nullable().optional(),
  offered_basis: z.string().nullable().optional(),
  /** False when the two sides start from different points and the MR gives no duration between them. */
  comparable: z.boolean().optional(),
  /** The offered months restated on the required basis, when the MR allowed it. */
  offered_equivalent: z.number().nullable().optional(),
})
export type Check = z.infer<typeof Check>

/** One priced line of a gap's adder: qty × rate, scaled by its driver's rate. */
export const CostLine = z.object({
  label: z.string(),
  qty: z.string(),
  unit: z.string(),
  rate: z.string(),
  driver: z.enum(['fixed', 'copper', 'labour', 'freight']),
  /** The rate's range, where the rate table states one; null means the base rate. */
  rate_low: z.string().nullable().optional(),
  rate_high: z.string().nullable().optional(),
})
export type CostLine = z.infer<typeof CostLine>

/** Something a person must look at before the result is final. */
export const ReviewFlag = z.object({ code: z.string(), message: z.string() })
export type ReviewFlag = z.infer<typeof ReviewFlag>

/** One value shown in `extracted_text`, with the passage it was read from. */
export const Segment = z.object({
  field: z.string(),
  label: z.string(),
  text: z.string(),
  citation: Citation,
})
export type Segment = z.infer<typeof Segment>

/** What one bid says about one parameter: a grid cell. */
export const Extraction = z.object({
  extracted_text: z.string(),
  status: ComplianceStatus,
  confidence: z.number(),
  bbox: z.string(),
  snippet: z.string(),
  conflict_note: z.string().nullable(),
  cost_adder: z.number(),
  adder_formula: z.string(),
  cost_lines: z.array(CostLine),
  pricing_status: PricingStatus,
  citation: Citation.nullable(),
  secondary_citation: Citation.nullable(),
  checks: z.array(Check),
  rate_table_version: z.string().nullable(),
  flags: z.array(ReviewFlag).optional(),
  /** For a compliant cell: "documentary", or "claim_only" (claimed, not shown). */
  evidence: z.string().nullable().optional(),
  segments: z.array(Segment).optional(),
  /** Keyed by field name. */
  field_citations: z.record(z.string(), Citation).optional(),
  /** e.g. "assembled from p.11 and p.3" when the values come from different pages. */
  assembled_from: z.string().nullable().optional(),
})
export type Extraction = z.infer<typeof Extraction>

export const Parameter = z.object({
  id: z.string(),
  category: z.string(),
  name: z.string(),
  mr_requirement: z.string(),
  pint_rule: z.string(),
  criticality: Criticality,
  /** Keyed by vendor ID. */
  vendors: z.record(z.string(), Extraction),
  requirement_citation: Citation.nullable(),
  checks_spec: z.array(CheckSpec),
})
export type Parameter = z.infer<typeof Parameter>

export const Vendor = z.object({
  id: z.string(),
  name: z.string(),
  country: z.string(),
  /** Null when the price is unknown (not found, no currency, no FX rate): never 0. */
  headline_price: z.number().nullable(),
  doc_name: z.string(),
  cover_claim: z.string(),
  badge: z.string(),
  headline_citation: Citation.nullable(),
  /** PRICED, NOT_FOUND, CURRENCY_UNKNOWN or FX_MISSING. */
  headline_status: z.string().nullable().optional(),
  /** The currency the bid is priced in, and the amount as the bid states it. */
  currency: z.string().nullable().optional(),
  headline_original: z.string().nullable().optional(),
  fx_rate: z.string().nullable().optional(),
  fx_date: z.string().nullable().optional(),
})
export type Vendor = z.infer<typeof Vendor>

export const Tender = z.object({
  id: z.string(),
  title: z.string(),
  client: z.string(),
  mr_doc: z.string(),
  pages_parsed: z.number().int(),
  latency_sec: z.number().int(),
  /** Antova's run cost: on the founder's review payload only, never on the public brief. */
  compute_cogs: z.number().optional(),
  vendors: z.array(Vendor),
  parameters: z.array(Parameter),
  equipment_class: z.string(),
  rate_table_version: z.string(),
})
export type Tender = z.infer<typeof Tender>

/** One parameter's adder in a vendor's evaluated price. */
export const ItemizedAdder = z.object({
  param_id: z.string(),
  param_name: z.string(),
  status: ComplianceStatus,
  is_conceded: z.boolean(),
  adder_eur: z.number(),
  adder_low_eur: z.number().optional(),
  adder_high_eur: z.number().optional(),
  criticality: Criticality,
  /** NONE, PRICED, UNPRICED, or OVERRIDDEN for a founder's figure. */
  pricing_status: z.string().optional(),
  is_overridden: z.boolean(),
  override_note: z.string().nullable(),
})
export type ItemizedAdder = z.infer<typeof ItemizedAdder>

export const VendorFinancials = z.object({
  vendor_id: z.string(),
  name: z.string(),
  country: z.string(),
  badge: z.string(),
  /** Null when the vendor has no usable headline price; `price_status` says why. */
  headline_price: z.number().nullable(),
  /** The currency every figure in this row is in. */
  currency: z.string().optional(),
  total_tech_penalty: z.number(),
  total_commercial_adder: z.number(),
  total_adders: z.number(),
  total_adders_low: z.number().optional(),
  total_adders_high: z.number().optional(),
  clawed_back_amount: z.number(),
  /** Null with the headline: there is no true price without one, only the adders. */
  true_evaluated_price: z.number().nullable(),
  true_evaluated_low: z.number().nullable().optional(),
  true_evaluated_high: z.number().nullable().optional(),
  /** PRICED, UNPRICED_ITEMS (a lower bound), NO_HEADLINE, CURRENCY_UNKNOWN or FX_MISSING. */
  price_status: z.string().optional(),
  itemized_breakdown: z.array(ItemizedAdder),
})
export type VendorFinancials = z.infer<typeof VendorFinancials>

/** A founder's adder for one cell; `adder_eur` is a two-decimal string ("18500.00"). */
export const OverrideEntry = z.object({
  param_id: z.string(),
  vendor_id: z.string(),
  adder_eur: z.string(),
  note: z.string(),
})
export type OverrideEntry = z.infer<typeof OverrideEntry>

/** What blocks verifying a brief; `param_id` is null for a vendor-level item. */
export const OpenItem = z.object({
  kind: z.enum(['unpriced', 'needs_inspection', 'missing_price', 'review_flag']),
  vendor_id: z.string(),
  param_id: z.string().nullable(),
  message: z.string(),
})
export type OpenItem = z.infer<typeof OpenItem>

export const SourceDocument = z.object({
  filename: z.string(),
  role: z.string(),
  vendor_id: z.string().nullable(),
  page_count: z.number().int(),
})
export type SourceDocument = z.infer<typeof SourceDocument>

export const StageLogEntry = z.object({
  stage: z.string(),
  pct: z.number().int(),
  t_ms: z.number().int(),
})
export type StageLogEntry = z.infer<typeof StageLogEntry>

export const UnpricedItem = z.object({
  vendor_id: z.string(),
  param_id: z.string(),
  classes: z.array(z.string()),
})
export type UnpricedItem = z.infer<typeof UnpricedItem>

/** Amendment A2: the vendor with the lowest true evaluated price among fully priced bids. */
export const NegotiatingVendor = z.object({
  vendor_id: z.string().nullable(),
  basis: z.string(),
  true_evaluated_price: z.number().nullable(),
  lowest_headline: z.string().nullable(),
  excluded: z.array(z.object({ vendor_id: z.string(), reason: z.string(), detail: z.string() })),
})
export type NegotiatingVendor = z.infer<typeof NegotiatingVendor>

/** The ingest run's counters, as stored with the tender. */
export const IngestStats = z.object({
  tender_id: z.string(),
  documents: z.number().int(),
  pages_parsed: z.number().int(),
  sld_sheets: z.number().int(),
  candidates_accepted: z.number().int(),
  candidates_rejected: z.number().int(),
  rules_evaluated: z.number().int(),
  deviations_found: z.number().int(),
  exposed_risk_eur: z.number(),
  /** Who to negotiate with (lowest true evaluated price) and who was left out, with the reason. */
  negotiating_vendor: NegotiatingVendor.optional(),
  /** Recall sweep: sentences found, ones the locator had not cited, and the share of located passages re-found. */
  sweep_hits: z.number().int().optional(),
  sweep_new_candidates: z.number().int().optional(),
  sweep_recall: z.number().optional(),
  flags_raised: z.number().int().optional(),
  /** Number locale per document: en, eu, mixed or unknown. */
  locales: z.record(z.string(), z.string()).optional(),
  /** Pages with no text layer, per document. */
  no_text_pages: z.record(z.string(), z.array(z.number().int())).optional(),
  run_fingerprint: z.string().optional(),
  run_id: z.string().optional(),
  unpriced_items: z.array(UnpricedItem),
  warnings: z.array(z.string()),
  /** The rate table's effective date ("2026-11-03"); absent on tenders ingested before R26. */
  rate_table_effective_date: z.string().optional(),
  /** Antova's run cost: on the review payload and job result only, never on the public brief. */
  api_cost_usd: z.number().optional(),
  cogs_usd: z.number().optional(),
  duration_s: z.number(),
  ingest_mode: z.string(),
  synthetic: z.boolean(),
})
export type IngestStats = z.infer<typeof IngestStats>

/**
 * A tender migrated from schema v2 has no recorded run: the migration stores `{}` (ruling
 * R27). It parses to null rather than failing the whole brief.
 */
const NoRecordedRun = z
  .object({})
  .strict()
  .transform(() => null)

/** GET /api/briefs/{share_id} and GET /api/review/tenders/{tender_id}: `brief_payload`. */
export const Brief = z.object({
  share_id: z.string(),
  status: BriefStatus,
  verified_at: z.string().nullable(),
  synthetic: z.boolean(),
  ingest_mode: z.string(),
  /** null: no recorded run (a tender migrated from v2, ruling R27). */
  ingest_stats: z.union([IngestStats, NoRecordedRun]),
  stage_log: z.array(StageLogEntry),
  documents: z.array(SourceDocument),
  tender: Tender,
  financials: z.array(VendorFinancials),
  overrides: z.array(OverrideEntry),
  open_items: z.array(OpenItem),
  /** Flagged cells by review state. Nothing is final while a flag is open or the brief is unverified. */
  review: z
    .object({
      open_flags: z.number().int(),
      stale: z.number().int(),
      rejected: z.number().int(),
      reviewed: z.number().int(),
      final: z.boolean(),
    })
    .optional(),
})
export type Brief = z.infer<typeof Brief>

/** POST …/evaluate. */
export const EvaluateResponse = z.object({ financials: z.array(VendorFinancials) })
export type EvaluateResponse = z.infer<typeof EvaluateResponse>

/** One row of GET /api/review/tenders; `open_items` is a count. */
export const ReviewTenderSummary = z.object({
  tender_id: z.string(),
  title: z.string(),
  status: BriefStatus,
  share_id: z.string(),
  ingested_at: z.string(),
  verified_at: z.string().nullable(),
  open_items: z.number().int(),
})
export type ReviewTenderSummary = z.infer<typeof ReviewTenderSummary>

/** POST /api/review/tenders/{id}/verify. A 409 instead carries `{detail, open_items: OpenItem[]}`. */
export const VerifyResponse = z.object({ share_id: z.string(), verified_at: z.string() })
export type VerifyResponse = z.infer<typeof VerifyResponse>

/** POST /api/review/tenders/{id}/withdraw. */
export const WithdrawResponse = z.object({ status: z.literal('DRAFT') })
export type WithdrawResponse = z.infer<typeof WithdrawResponse>

/** POST /api/jobs/ingest. */
export const StartIngestResponse = z.object({ job_id: z.string(), status: z.literal('QUEUED') })
export type StartIngestResponse = z.infer<typeof StartIngestResponse>

export const JobStatus = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'])
export type JobStatus = z.infer<typeof JobStatus>

/** A completed job's result: the run's stats, its stage log and the overrides the re-ingest cleared. */
export const JobResult = IngestStats.extend({
  stage_log: z.array(StageLogEntry),
  overrides_cleared: z.array(OverrideEntry),
})
export type JobResult = z.infer<typeof JobResult>

/** GET /api/jobs/{job_id}. */
export const Job = z.object({
  job_id: z.string(),
  status: JobStatus,
  progress_pct: z.number().int(),
  stage: z.string(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  result: JobResult.nullable(),
  error: z.string().nullable(),
})
export type Job = z.infer<typeof Job>

/** The slider settings the frontend works in (the wire names are in client.ts). */
export const Rates = z.object({ copper: z.number(), labour: z.number(), freight: z.number() })
export type Rates = z.infer<typeof Rates>

/** One case of parity-cases.json: rates and overrides in, the backend's totals out. */
export const ParityCase = z.object({
  rates: Rates,
  overrides: z.array(OverrideEntry),
  expected: z.array(
    VendorFinancials.pick({
      vendor_id: true,
      total_tech_penalty: true,
      total_commercial_adder: true,
      true_evaluated_price: true,
    }),
  ),
})
export type ParityCase = z.infer<typeof ParityCase>
