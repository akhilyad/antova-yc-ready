import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import draftBrief from '../test/fixtures/draft-brief.json'
import jobs from '../test/fixtures/jobs.json'
import parityCases from '../test/fixtures/parity-cases.json'
import reviewList from '../test/fixtures/review-list.json'
import verifiedBrief from '../test/fixtures/verified-brief.json'
import {
  Brief,
  EvaluateResponse,
  Job,
  ParityCase,
  ReviewTenderSummary,
  StartIngestResponse,
} from './schemas'

describe('schemas', () => {
  // zod drops keys a schema does not name, so a parse that round-trips to the
  // fixture proves the schema covers every key the backend sends.
  it('parses every committed fixture', () => {
    expect(Brief.parse(verifiedBrief)).toEqual(verifiedBrief)
    expect(Brief.parse(draftBrief)).toEqual(draftBrief)
    expect(z.array(ReviewTenderSummary).parse(reviewList)).toEqual(reviewList)
    expect(z.array(ParityCase).parse(parityCases)).toEqual(parityCases)
    expect(StartIngestResponse.parse(jobs.start)).toEqual(jobs.start)
    for (const job of [jobs.queued, ...jobs.processing, jobs.completed, jobs.failed]) {
      expect(Job.parse(job)).toEqual(job)
    }
    const evaluated = { financials: verifiedBrief.financials }
    expect(EvaluateResponse.parse(evaluated)).toEqual(evaluated)
  })

  it('Brief names exactly the brief_payload keys', () => {
    expect(Object.keys(Brief.shape).sort()).toEqual(Object.keys(verifiedBrief).sort())
  })

  it('the public brief carries no run cost; the review payload does', () => {
    const publicBrief = Brief.parse(verifiedBrief)
    expect(publicBrief.ingest_stats).not.toHaveProperty('api_cost_usd')
    expect(publicBrief.ingest_stats).not.toHaveProperty('cogs_usd')
    expect(publicBrief.tender).not.toHaveProperty('compute_cogs')
    const review = Brief.parse(draftBrief)
    expect(review.ingest_stats?.api_cost_usd).toBe(0)
    expect(review.ingest_stats?.cogs_usd).toBe(0)
    expect(review.tender.compute_cogs).toBe(0)
  })

  it('empty ingest stats (a tender migrated from v2) parse to null; partial stats still fail (R27)', () => {
    expect(Brief.parse({ ...draftBrief, ingest_stats: {} }).ingest_stats).toBeNull()
    expect(Brief.safeParse({ ...draftBrief, ingest_stats: { documents: 4 } }).success).toBe(false)
  })

  it('keeps decimal strings as strings', () => {
    const brief = Brief.parse(verifiedBrief)
    const line = brief.tender.parameters
      .flatMap((p) => Object.values(p.vendors))
      .flatMap((cell) => cell.cost_lines)[0]
    expect(line).toBeDefined()
    expect(typeof line?.qty).toBe('string')
    expect(typeof line?.rate).toBe('string')
    const cleared = Job.parse(jobs.completed).result?.overrides_cleared[0]
    expect(cleared?.adder_eur).toBe('10000.00')
  })

  it('rejects a payload with a wrong type', () => {
    expect(Brief.safeParse({ ...verifiedBrief, status: 'PUBLISHED' }).success).toBe(false)
    expect(Brief.safeParse({ ...verifiedBrief, financials: null }).success).toBe(false)
  })
})
