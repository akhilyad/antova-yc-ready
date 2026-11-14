import { describe, expect, it } from 'vitest'
import { Brief, type IngestStats, type StageLogEntry } from '../api/schemas'
import { copy } from '../content/copy'
import draftBrief from '../test/fixtures/draft-brief.json'
import verifiedBrief from '../test/fixtures/verified-brief.json'
import { buildReplay, contradictionCell, stageForBackend, type StageKey } from './replay'

/** A fresh parse each time, so no test can mutate another's brief. */
function sample(): Brief {
  return Brief.parse(verifiedBrief)
}

/** The sample's recorded counts (the fixture always has them). */
function statsOf(brief: Brief): IngestStats {
  if (brief.ingest_stats === null) throw new Error('fixture has no recorded run')
  return brief.ingest_stats
}

/** The sample brief with its stage log replaced. */
function withLog(stageLog: StageLogEntry[]): Brief {
  return { ...sample(), stage_log: stageLog }
}

/** A cumulative log from [backend stage, t_ms] pairs. */
function log(entries: [string, number][]): StageLogEntry[] {
  return entries.map(([stage, t_ms]) => ({ stage, pct: 0, t_ms }))
}

const KEYS: StageKey[] = ['read', 'find', 'verify', 'values', 'contradictions', 'price']

function durations(brief: Brief, maxMs?: number): number[] {
  return buildReplay(brief, maxMs).stages.map((s) => s.durationMs)
}

function total(ms: number[]): number {
  return ms.reduce((a, b) => a + b, 0)
}

function finding(brief: Brief, key: StageKey): string {
  const stage = buildReplay(brief).stages.find((s) => s.key === key)
  if (!stage) throw new Error(`no ${key} stage`)
  return stage.finding
}

describe('buildReplay', () => {
  it('six stages with sample findings', () => {
    const { stages } = buildReplay(sample())
    expect(stages.map((s) => s.key)).toEqual(KEYS)
    expect(stages.map((s) => s.label)).toEqual([...copy.modal.stages])
    expect(stages.map((s) => s.finding)).toEqual([
      '4 documents, 116 pages, 12 drawing sheets',
      '36 quotes located',
      '36 of 36 found word for word',
      'Deltaport Skid Consortium B.V.: 104 °F → 40 °C',
      expect.any(String),
      '10 gaps priced. VoltSwitch Industrial +€64,800.',
    ])
    const contradiction = stages[4]?.finding ?? ''
    for (const part of ['p.2', '50 kA', 'p.11', '31.5 kA']) {
      expect(contradiction).toContain(part)
    }
    expect(contradiction).toBe(
      'VoltSwitch Industrial: cover letter p.2 says 50 kA / 3 s; drawing p.11 says 31.5 kA / 1 s. The drawing governs.',
    )
  })

  it("times the sample's recorded run", () => {
    const { stages, timing } = buildReplay(sample())
    expect(timing).toEqual({
      recordedAt: '2026-11-05T00:00:00+00:00',
      realSeconds: 41.66,
      speed: 5.2,
      speedLabel: '5.2',
    })
    expect(total(stages.map((s) => s.durationMs))).toBe(8000)
  })

  it('credits each stage with the time before its report (R19)', () => {
    // Recorded: read 2840 ms (Intake 15 + Parse 2825), find 38420 ms (Locate's LLM call),
    // verify 130, values 130, contradictions 60, price 80; scaled from 41.66 s to 8 s.
    const ms = durations(sample())
    expect(ms).toEqual([545, 7378, 25, 25, 12, 15])
    const [read = 0, find = 0] = ms
    expect(read).toBeLessThan(1000)
    expect(find).toBeGreaterThan(10 * read)
  })

  it('scales a 40 s log to 8 s with speed 5', () => {
    const brief = withLog(
      log([
        ['Intake', 0],
        ['Parse', 4000],
        ['Locate', 20000],
        ['Verify citations', 28000],
        ['Read values', 32000],
        ['Resolve precedence', 36000],
        ['Price', 38000],
        ['Persist', 40000],
      ]),
    )
    // Recorded: read 4000, find 16000, verify 8000, values 4000, contradictions 4000, price 4000.
    expect(durations(brief)).toEqual([800, 3200, 1600, 800, 800, 800])
    expect(buildReplay(brief).timing).toEqual({
      recordedAt: '2026-11-05T00:00:00+00:00',
      realSeconds: 40,
      speed: 5,
      speedLabel: '5',
    })
  })

  it('plays a 0.47 s log at real speed with null speed label', () => {
    const brief = withLog(
      log([
        ['Intake', 0],
        ['Parse', 100],
        ['Locate', 300],
        ['Verify citations', 350],
        ['Read values', 400],
        ['Resolve precedence', 430],
        ['Price', 450],
        ['Persist', 470],
      ]),
    )
    expect(durations(brief)).toEqual([100, 200, 50, 50, 30, 40])
    expect(buildReplay(brief).timing).toEqual({
      recordedAt: '2026-11-05T00:00:00+00:00',
      realSeconds: 0.47,
      speed: 1,
      speedLabel: null,
    })
  })

  it('no log means even pacing and no timing claim', () => {
    const brief = withLog([])
    expect(durations(brief)).toEqual(Array(6).fill(8000 / 6))
    expect(durations(brief, 6000)).toEqual(Array(6).fill(1000))
    expect(buildReplay(brief).timing).toBeNull()
  })

  it('treats a log that ends at 0 ms as no log', () => {
    const brief = withLog(log([['Intake', 0]]))
    expect(durations(brief, 6000)).toEqual(Array(6).fill(1000))
    expect(buildReplay(brief).timing).toBeNull()
  })

  it('gives a stage with no log entries 0 ms, never NaN', () => {
    const brief = withLog(
      log([
        ['Intake', 0],
        ['Price', 2000],
        ['Persist', 4000],
      ]),
    )
    // A 4 s run plays at real speed: Intake took 0 ms; Price and Persist took 2 s each.
    expect(durations(brief)).toEqual([0, 0, 0, 0, 0, 4000])
  })

  it('credits a lone report with the time since start', () => {
    const brief = withLog(log([['Parse', 600]]))
    expect(durations(brief)).toEqual([600, 0, 0, 0, 0, 0])
    expect(buildReplay(brief).timing?.realSeconds).toBe(0.6)
  })

  it('never gives a stage negative time when the log goes backwards', () => {
    const brief = withLog(
      log([
        ['Intake', 500],
        ['Parse', 300],
        ['Locate', 800],
      ]),
    )
    // Recorded: read 500 (Parse's −200 counts as 0), find 500; scaled to the 800 ms the log ends at.
    expect(durations(brief)).toEqual([400, 400, 0, 0, 0, 0])
  })

  it('a draft brief still has timing, with no recorded date', () => {
    const { timing } = buildReplay(Brief.parse(draftBrief))
    expect(timing).toMatchObject({ recordedAt: null, realSeconds: 41.66, speed: 5.2 })
  })

  it('fails loudly on a backend stage it does not know', () => {
    const brief = withLog(log([['Reticulate splines', 100]]))
    expect(() => buildReplay(brief)).toThrow('Reticulate splines')
  })
})

describe('findings', () => {
  it('counts every quote located, and the ones found word for word', () => {
    const brief = sample()
    statsOf(brief).candidates_rejected = 2
    expect(finding(brief, 'find')).toBe('38 quotes located')
    expect(finding(brief, 'verify')).toBe('36 of 38 found word for word')
  })

  it('a tender with no recorded run says so instead of showing counts (R27)', () => {
    const brief = { ...sample(), ingest_stats: null }
    const unrecorded = copy.modal.findings.unrecorded
    for (const stage of ['read', 'find', 'verify', 'price'] as const) {
      expect(finding(brief, stage)).toBe(unrecorded)
    }
    expect(finding(brief, 'contradictions')).toBe(finding(sample(), 'contradictions'))
  })

  it('uses the singular for counts of one', () => {
    const brief = sample()
    Object.assign(statsOf(brief), {
      documents: 1,
      pages_parsed: 1,
      sld_sheets: 1,
      candidates_accepted: 1,
      candidates_rejected: 0,
      deviations_found: 1,
    })
    expect(finding(brief, 'read')).toBe('1 document, 1 page, 1 drawing sheet')
    expect(finding(brief, 'find')).toBe('1 quote located')
    expect(finding(brief, 'verify')).toBe('1 of 1 found word for word')
    expect(finding(brief, 'price')).toBe('1 gap priced. VoltSwitch Industrial +€64,800.')
  })

  it('falls back to a prefix-only conversion, first in vendor/parameter order', () => {
    const brief = sample()
    const ambient = brief.tender.parameters.find((p) => p.id === 'PARAM-08')
    const cell = ambient?.vendors['vendor-c']
    if (!cell) throw new Error('fixture changed')
    cell.checks = []
    // Nordwerk's "2.5 kA → 2500 A" comes before VoltSwitch's "36000 V → 36 kV".
    expect(finding(brief, 'values')).toBe('Nordwerk Schaltanlagen GmbH: 2.5 kA → 2500 A')
  })

  it('shows "values read" alone when nothing was converted', () => {
    const brief = sample()
    for (const param of brief.tender.parameters) {
      for (const cell of Object.values(param.vendors)) {
        cell.checks = cell.checks.map((c) => ({ ...c, offered_canonical: c.offered }))
      }
    }
    expect(finding(brief, 'values')).toBe('Values read')
  })

  it('compares units with no number in front', () => {
    const brief = sample()
    const ambient = brief.tender.parameters.find((p) => p.id === 'PARAM-08')
    const check = ambient?.vendors['vendor-c']?.checks[0]
    if (!check) throw new Error('fixture changed')
    check.offered = 'hot'
    check.offered_canonical = 'HOT'
    expect(finding(brief, 'values')).toBe('Deltaport Skid Consortium B.V.: hot → HOT')
  })

  it('keeps acronym section names in capitals', () => {
    const brief = sample()
    const p01 = brief.tender.parameters.find((p) => p.id === 'PARAM-01')?.vendors['vendor-b']
    if (!p01) throw new Error('fixture changed')
    p01.secondary_citation = null
    expect(finding(brief, 'contradictions')).toBe(
      'VoltSwitch Industrial: compliance table p.3 says IEC 61850 Ed. 2 with PRP; BOM p.15 says not IEC 61850. The BOM governs.',
    )
  })

  it('shows a conflict note it cannot parse as written', () => {
    const brief = sample()
    const p01 = brief.tender.parameters.find((p) => p.id === 'PARAM-01')?.vendors['vendor-b']
    if (!p01) throw new Error('fixture changed')
    p01.conflict_note = 'The drawing and the cover letter disagree.'
    expect(finding(brief, 'contradictions')).toBe(
      'VoltSwitch Industrial: The drawing and the cover letter disagree.',
    )
  })

  it('says so when there is no contradiction', () => {
    const brief = sample()
    for (const param of brief.tender.parameters) {
      for (const cell of Object.values(param.vendors)) cell.secondary_citation = null
    }
    expect(finding(brief, 'contradictions')).toBe('No contradictions found')
  })

  it('counts the gaps alone when no bid has a price', () => {
    const brief = sample()
    for (const f of brief.financials) f.headline_price = 0
    expect(finding(brief, 'price')).toBe('10 gaps priced.')
  })
})

describe('stageForBackend', () => {
  it('maps every backend stage name', () => {
    expect(
      [
        'Intake',
        'Parse',
        'Locate',
        'Verify citations',
        'Read values',
        'Resolve precedence',
        'Price',
        'Persist',
      ].map(stageForBackend),
    ).toEqual(['read', 'read', 'find', 'verify', 'values', 'contradictions', 'price', 'price'])
  })

  it('throws on an unknown stage name', () => {
    expect(() => stageForBackend('Queued in worker pipeline')).toThrow(
      'Unknown backend stage: Queued in worker pipeline',
    )
  })
})

describe('contradictionCell', () => {
  it('is the cell the contradiction finding describes', () => {
    expect(contradictionCell(sample().tender)).toEqual({
      vendorId: 'vendor-b',
      paramId: 'PARAM-01',
    })
  })

  it('is null when no cell has a contradiction', () => {
    const brief = sample()
    for (const param of brief.tender.parameters) {
      for (const cell of Object.values(param.vendors)) cell.secondary_citation = null
    }
    expect(contradictionCell(brief.tender)).toBeNull()
  })
})
