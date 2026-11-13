import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Brief } from '../../api/schemas'
import verifiedJson from '../../test/fixtures/verified-brief.json'
import { Method } from './Method'

const brief = Brief.parse(verifiedJson)

describe('Method', () => {
  it('names the rate table with its effective date (R26)', () => {
    render(<Method brief={brief} />)
    expect(
      screen.getByText(
        'Gaps are priced from rate table mv_gis_switchgear_v1, effective 3 November 2026.',
      ),
    ).toBeInTheDocument()
  })

  it('names the rate table alone when the run recorded no date (ingested before R26)', () => {
    const old = structuredClone(brief)
    delete old.ingest_stats?.rate_table_effective_date
    render(<Method brief={old} />)
    expect(
      screen.getByText('Gaps are priced from rate table mv_gis_switchgear_v1.'),
    ).toBeInTheDocument()
  })
})
