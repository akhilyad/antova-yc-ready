// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Brief } from '../src/api/schemas.ts'
import { copy, type FaqItem } from '../src/content/copy.ts'
import { launchProblems } from './check-launch.ts'

function fixture(): Brief {
  const url = new URL('../src/test/fixtures/verified-brief.json', import.meta.url)
  return Brief.parse(JSON.parse(readFileSync(url, 'utf8')))
}

const SIGNED: readonly FaqItem[] = copy.landing.faq.map((item) => ({
  question: item.question,
  answer: item.answer ?? 'Signed-off answer.',
}))

const LIVE_SHARE_ID = 'k3v9q2m7x4t8w1z6r5n0p2b8'

const READY = {
  env: {
    VITE_CONTACT_EMAIL: 'founder@example.test',
    VITE_SAMPLE_SHARE_ID: LIVE_SHARE_ID,
    VITE_SITE_URL: 'https://antova.example',
  },
  content: { 'impressum.md': '# Impressum\n\nAntova GmbH', 'privacy.md': '# Privacy\n\nText.' },
  snapshot: { ...fixture(), ingest_mode: 'live', share_id: LIVE_SHARE_ID },
}

describe('launchProblems', () => {
  it('launchProblems lists each placeholder', () => {
    const problems = launchProblems(
      {},
      { 'impressum.md': 'FOUNDER-TO-SUPPLY\n\n# Impressum', 'privacy.md': 'FOUNDER-TO-SUPPLY' },
      fixture(),
      SIGNED,
    )
    expect(problems).toHaveLength(7)
    expect(problems.some((p) => p.includes('VITE_SITE_URL is not set'))).toBe(true)
    expect(problems.filter((p) => p.includes('FOUNDER-TO-SUPPLY'))).toHaveLength(2)
    expect(problems.some((p) => p.includes('impressum.md'))).toBe(true)
    expect(problems.some((p) => p.includes('privacy.md'))).toBe(true)
    expect(problems.some((p) => p.includes('VITE_CONTACT_EMAIL'))).toBe(true)
    expect(problems.some((p) => p.includes('answer_key'))).toBe(true)
    expect(problems.some((p) => p.includes('e2e-sample-share-id-000000'))).toBe(true)
    expect(problems.some((p) => p.includes('VITE_SAMPLE_SHARE_ID is not set'))).toBe(true)
  })

  it('reports a snapshot of the end-to-end sample brief', () => {
    const snapshot = { ...READY.snapshot, share_id: 'e2e-sample-share-id-000000' }
    const env = { ...READY.env, VITE_SAMPLE_SHARE_ID: 'e2e-sample-share-id-000000' }
    expect(launchProblems(env, READY.content, snapshot, SIGNED)).toEqual([
      expect.stringContaining('e2e-sample-share-id-000000'),
    ])
  })

  it('reports VITE_SAMPLE_SHARE_ID unset or naming another brief than the snapshot', () => {
    for (const shareId of [undefined, '  ', 'another-share-id-0000000000']) {
      const env = { ...READY.env, VITE_SAMPLE_SHARE_ID: shareId }
      expect(launchProblems(env, READY.content, READY.snapshot, SIGNED)).toEqual([
        expect.stringContaining('VITE_SAMPLE_SHARE_ID'),
      ])
    }
  })

  it('launchProblems reports the unsigned FAQ answer', () => {
    const faqWithUnsigned: readonly FaqItem[] = [
      ...SIGNED,
      { question: 'Who sees my documents?', answer: null },
    ]
    const problems = launchProblems(READY.env, READY.content, READY.snapshot, faqWithUnsigned)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('Who sees my documents?')
  })

  it('treats a blank contact email as unset', () => {
    const problems = launchProblems(
      { ...READY.env, VITE_CONTACT_EMAIL: '  ' },
      READY.content,
      READY.snapshot,
      SIGNED,
    )
    expect(problems).toEqual([expect.stringContaining('VITE_CONTACT_EMAIL')])
  })

  it('reports VITE_SITE_URL unset or not an http(s) URL', () => {
    for (const site of [undefined, ' ', 'antova.example']) {
      const env = { ...READY.env, VITE_SITE_URL: site }
      expect(launchProblems(env, READY.content, READY.snapshot, SIGNED)).toEqual([
        expect.stringContaining('VITE_SITE_URL'),
      ])
    }
  })

  it('finds nothing when every launch item is supplied', () => {
    expect(launchProblems(READY.env, READY.content, READY.snapshot, SIGNED)).toEqual([])
  })
})
