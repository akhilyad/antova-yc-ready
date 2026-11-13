/**
 * The audit modal's replay script (spec §7.2): six plain-language stages, each with one
 * finding taken from the brief, and the time each stage gets on screen. The replay is
 * labelled as a recording, so it never claims more speed than the recording shows: with a
 * stage log, the real stage durations are scaled to fit `maxMs` and `timing.speed` is
 * real ÷ played; without one, the stages advance evenly and there is no timing claim.
 * A log entry is reported when its stage finishes, so each stage is credited with the time
 * before its report (see `recordedMs`).
 */
import type { Brief, Check, IngestStats, Parameter, Tender, Vendor } from '../api/schemas'
import { copy } from '../content/copy'
import { cellsInOrder, contradictionCell, firstConflict } from './contradiction'
import type { VendorLevel } from './leveling'
import { formatAdder, toCents } from './money'
import { apparentLowBidder } from './ranking'

export type StageKey = 'read' | 'find' | 'verify' | 'values' | 'contradictions' | 'price'

export type ReplayStage = { key: StageKey; label: string; finding: string; durationMs: number }

export type ReplayTiming = {
  /** When the brief was verified (ISO); null for a draft. */
  recordedAt: string | null
  /** The recorded run's length: the stage log's last `t_ms`, in seconds. */
  realSeconds: number
  /** Real ÷ played, to one decimal; 1 when the run fits in the replay. */
  speed: number
  /** `speed` as text for "shown at {x}× speed"; null when the replay is not sped up. */
  speedLabel: string | null
}

export type Replay = { stages: ReplayStage[]; timing: ReplayTiming | null }

/** The six plain stages, in the order they run. */
export const STAGE_KEYS: readonly StageKey[] = [
  'read',
  'find',
  'verify',
  'values',
  'contradictions',
  'price',
]

/** The pipeline's stage reports (and the worker's final Persist) to the six plain stages. */
const BACKEND_STAGES = new Map<string, StageKey>([
  ['Intake', 'read'],
  ['Parse', 'read'],
  ['Locate', 'find'],
  ['Verify citations', 'verify'],
  ['Read values', 'values'],
  ['Resolve precedence', 'contradictions'],
  ['Price', 'price'],
  ['Persist', 'price'],
])

/** The plain stage a backend stage name belongs to. Throws on a name it doesn't know. */
export function stageForBackend(name: string): StageKey {
  const key = BACKEND_STAGES.get(name)
  if (key === undefined) throw new Error(`Unknown backend stage: ${name}`)
  return key
}

// The contradiction lookup lives in a leaf module a build script can share; the replay and
// its callers keep importing it from here.
export { contradictionCell }

const SI_PREFIXES = new Set(['k', 'M', 'G', 'm', 'µ', 'μ'])

/** "104 °F" → "°F"; "2.5 kA" → "A" (the prefix dropped); a value with no number is its own unit. */
function baseUnit(value: string): string {
  const trimmed = value.trim()
  const unit = /^[-+]?[\d.,]+\s*(.*)$/.exec(trimmed)?.[1] ?? trimmed
  return unit.length > 1 && SI_PREFIXES.has(unit.charAt(0)) ? unit.slice(1) : unit
}

/**
 * A unit conversion the checks made (`offered` ≠ `offered_canonical`), preferring one where the
 * unit itself changes over one where only its prefix does; ties go to vendor/parameter order.
 * Null when no value was converted.
 */
export function conversionCheck(
  tender: Tender,
): { vendor: Vendor; param: Parameter; check: Check } | null {
  let prefixOnly: { vendor: Vendor; param: Parameter; check: Check } | null = null
  for (const { vendor, param, cell } of cellsInOrder(tender)) {
    for (const check of cell.checks) {
      if (check.offered === check.offered_canonical) continue
      const found = { vendor, param, check }
      if (baseUnit(check.offered) !== baseUnit(check.offered_canonical)) return found
      prefixOnly ??= found
    }
  }
  return prefixOnly
}

/** The conversion `conversionCheck` picks, in words; "Values read" when nothing was converted. */
function conversionFinding(tender: Tender): string {
  const found = conversionCheck(tender)
  return found ? conversionText(found.vendor, found.check) : copy.modal.findings.valuesRead
}

function conversionText(vendor: Vendor, check: Check): string {
  return copy.modal.findings.conversion({
    vendor: vendor.name,
    from: check.offered,
    to: check.offered_canonical,
  })
}

/** The backend's conflict note: "Cover letter p.2 claims X; Drawing p.11 states Y. Drawing governs." */
const CONFLICT_NOTE = /^(.+?) p\.(\d+) claims (.+); (.+?) p\.(\d+) states (.+)\. \4 governs\.$/

/** "Cover letter" → "cover letter"; an acronym such as "BOM" keeps its capitals. */
function sectionName(label: string): string {
  return /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label
}

/** The first conflict, restated: which source claimed what, and which governs. */
function contradictionFinding(tender: Tender): string {
  const conflict = firstConflict(tender)
  if (conflict !== null) {
    const { vendor } = conflict
    const note = conflict.cell.conflict_note ?? ''
    const match = CONFLICT_NOTE.exec(note)
    if (match === null) {
      return copy.modal.findings.conflictNote({ vendor: vendor.name, note })
    }
    const [
      claim = '',
      claimPage = '',
      claimed = '',
      governing = '',
      governingPage = '',
      stated = '',
    ] = match.slice(1)
    return copy.modal.findings.contradiction({
      vendor: vendor.name,
      claimSource: sectionName(claim),
      claimPage,
      claimed,
      governingSource: sectionName(governing),
      governingPage,
      stated,
    })
  }
  return copy.modal.findings.noContradictions
}

/** The gap count, and what the apparent low bidder's gaps add to its bid (the backend's totals). */
function gapsFinding(brief: Brief, stats: IngestStats): string {
  const levels: VendorLevel[] = brief.financials.map((f) => ({
    vendorId: f.vendor_id,
    name: f.name,
    headlineCents: toCents(f.headline_price ?? 0),
    techCents: toCents(f.total_tech_penalty),
    commercialCents: toCents(f.total_commercial_adder),
    evaluatedCents: toCents(f.true_evaluated_price ?? f.total_adders),
    cells: [],
  }))
  const low = apparentLowBidder(levels)
  return copy.modal.findings.gaps({
    n: stats.deviations_found,
    lowBidder: low && {
      name: low.name,
      adder: formatAdder(low.evaluatedCents - low.headlineCents),
    },
  })
}

/**
 * What each stage found. A tender with no recorded run (R27) has no counts: those findings
 * say so rather than show invented numbers; the two read from the tender itself still show.
 */
function findings(brief: Brief): Record<StageKey, string> {
  const stats = brief.ingest_stats
  if (stats === null) {
    const unrecorded = copy.modal.findings.unrecorded
    return {
      read: unrecorded,
      find: unrecorded,
      verify: unrecorded,
      values: conversionFinding(brief.tender),
      contradictions: contradictionFinding(brief.tender),
      price: unrecorded,
    }
  }
  const located = stats.candidates_accepted + stats.candidates_rejected
  return {
    read: copy.modal.findings.read({
      documents: stats.documents,
      pages: stats.pages_parsed,
      sheets: stats.sld_sheets,
    }),
    find: copy.modal.findings.find(located),
    verify: copy.modal.findings.verify({ found: stats.candidates_accepted, total: located }),
    values: conversionFinding(brief.tender),
    contradictions: contradictionFinding(brief.tender),
    price: gapsFinding(brief, stats),
  }
}

/**
 * Each stage's recorded time (ruling R19). The pipeline calls `report(stage)` after that
 * stage's work is done (specclaw_ingest/pipeline.py), so an entry's `t_ms` (cumulative since
 * start) marks when its stage finished: its duration is its own `t_ms` minus the previous
 * entry's, and the first entry's is its own `t_ms`. Crediting the gap *after* an entry instead
 * would hand Locate's long LLM call to Parse. Durations are summed per stage and never negative.
 */
function recordedMs(stageLog: Brief['stage_log']): Map<StageKey, number> {
  const ms = new Map<StageKey, number>(STAGE_KEYS.map((k) => [k, 0]))
  stageLog.forEach((entry, i) => {
    const key = stageForBackend(entry.stage)
    const previousT = stageLog[i - 1]?.t_ms ?? 0
    ms.set(key, (ms.get(key) ?? 0) + Math.max(0, entry.t_ms - previousT))
  })
  return ms
}

/**
 * Scales the recorded times to sum to `playedMs`, in whole milliseconds that add up exactly
 * (each stage ends at its rounded cumulative time). Only called when the log ends after 0 ms,
 * so the recorded times sum to at least that and the division is safe.
 */
function scale(recorded: Map<StageKey, number>, playedMs: number): number[] {
  const raw = STAGE_KEYS.map((k) => recorded.get(k) ?? 0)
  const sum = raw.reduce((a, b) => a + b, 0)
  let cumulative = 0
  let previousEnd = 0
  return raw.map((ms) => {
    cumulative += ms
    const end = Math.round((cumulative * playedMs) / sum)
    const duration = end - previousEnd
    previousEnd = end
    return duration
  })
}

/**
 * The replay for a brief. With a stage log, stage durations are the recorded times merged per
 * stage, scaled so the total is min(real, maxMs). A log that is empty or ends at 0 ms counts
 * as no log: each stage gets maxMs / 6 and `timing` is null. Throws on an unknown stage name.
 */
export function buildReplay(brief: Brief, maxMs = 8000): Replay {
  const text = findings(brief)
  const recorded = recordedMs(brief.stage_log)
  const realMs = brief.stage_log.at(-1)?.t_ms ?? 0

  let durations: number[]
  let timing: ReplayTiming | null = null
  if (realMs <= 0) {
    durations = STAGE_KEYS.map(() => maxMs / STAGE_KEYS.length)
  } else {
    const playedMs = Math.min(realMs, maxMs)
    durations = scale(recorded, playedMs)
    const speed = Math.round((realMs / playedMs) * 10) / 10
    timing = {
      recordedAt: brief.verified_at,
      realSeconds: realMs / 1000,
      speed,
      speedLabel: speed > 1 ? String(speed) : null,
    }
  }

  const labels = copy.modal.stages
  return {
    stages: STAGE_KEYS.map((key, i) => ({
      key,
      label: labels[i] ?? key,
      finding: text[key],
      durationMs: durations[i] ?? 0,
    })),
    timing,
  }
}
