// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Brief } from '../src/api/schemas.ts'
import { landingCrops, sampleCropPath } from '../src/components/landing/sampleCrops.ts'
import { PUBLIC_DIR, SNAPSHOT_FILE, snapshotCrops, snapshotSample } from './snapshot-sample.ts'

const FIXTURE = readFileSync(
  new URL('../src/test/fixtures/verified-brief.json', import.meta.url),
  'utf8',
)
const SHARE_ID = (JSON.parse(FIXTURE) as { share_id: string }).share_id
const EXISTING = '{ "the": "existing snapshot" }\n'
const NOW = () => new Date('2026-11-06T09:30:00.000Z')

/** The PNG signature and a few more bytes: enough to pass as a crop. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

/** The fixture's one contradiction: VoltSwitch's short-time withstand rating. */
const CROP_PATHS = ['primary', 'secondary'].map(
  (which) => `/api/briefs/${SHARE_ID}/evidence/PARAM-01/vendor-b/${which}.png`,
)

/**
 * A fetch that answers the brief with `body` and `status` and every crop with `crop` and
 * `cropStatus`, and records each URL.
 */
function answer(body: string, status = 200, crop: Uint8Array | string = PNG, cropStatus = 200) {
  const urls: string[] = []
  const fake = (async (url: string | URL | Request) => {
    urls.push(String(url))
    if (String(url).includes('/evidence/')) {
      return new Response(crop, { status: cropStatus, headers: { 'Content-Type': 'image/png' } })
    }
    return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  return { fake, urls }
}

let dir: string
let outFile: URL
let publicDir: URL

/** A crop as written under the temporary public directory. */
const cropFile = (which: 'primary' | 'secondary') =>
  new URL(`sample/evidence/PARAM-01/vendor-b/${which}.png`, publicDir)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'antova-snapshot-'))
  outFile = pathToFileURL(join(dir, 'sample-brief.json'))
  publicDir = new URL('public/', outFile)
  writeFileSync(outFile, EXISTING)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('snapshotSample', () => {
  it('writes the verified brief with snapshot_at, LF line endings and a trailing newline', async () => {
    const { fake, urls } = answer(FIXTURE)
    await snapshotSample({
      shareId: SHARE_ID,
      apiBase: 'http://api.test/',
      outFile,
      publicDir,
      fetch: fake,
      now: NOW,
    })

    expect(urls).toEqual([
      `http://api.test/api/briefs/${SHARE_ID}`,
      ...CROP_PATHS.map((path) => `http://api.test${path}`),
    ])
    const written = readFileSync(outFile, 'utf8')
    expect(written.endsWith('}\n')).toBe(true)
    expect(written).not.toContain('\r')
    const snapshot = JSON.parse(written) as Record<string, unknown>
    expect(snapshot.snapshot_at).toBe('2026-11-06T09:30:00.000Z')
    expect({ ...snapshot, snapshot_at: undefined }).toEqual({
      ...(JSON.parse(FIXTURE) as object),
      snapshot_at: undefined,
    })
  })

  it('saves the landing crops beside the brief, under public/sample', async () => {
    const { fake } = answer(FIXTURE)
    await snapshotSample({
      shareId: SHARE_ID,
      apiBase: 'http://api.test',
      outFile,
      publicDir,
      fetch: fake,
    })
    for (const which of ['primary', 'secondary'] as const) {
      expect(new Uint8Array(readFileSync(cropFile(which)))).toEqual(PNG)
    }
  })

  it('leaves every file untouched when a crop is not a PNG', async () => {
    const { fake } = answer(FIXTURE, 200, '{"detail":"oops"}')
    await expect(
      snapshotSample({
        shareId: SHARE_ID,
        apiBase: 'http://api.test',
        outFile,
        publicDir,
        fetch: fake,
      }),
    ).rejects.toThrow('did not return a PNG')
    expect(readFileSync(outFile, 'utf8')).toBe(EXISTING)
    expect(existsSync(cropFile('primary'))).toBe(false)
  })

  it('leaves every file untouched when a crop GET fails', async () => {
    const { fake } = answer(FIXTURE, 200, PNG, 404)
    await expect(
      snapshotSample({
        shareId: SHARE_ID,
        apiBase: 'http://api.test',
        outFile,
        publicDir,
        fetch: fake,
      }),
    ).rejects.toThrow('primary.png returned 404')
    expect(readFileSync(outFile, 'utf8')).toBe(EXISTING)
    expect(existsSync(cropFile('primary'))).toBe(false)
  })

  it('leaves the file untouched when the GET fails', async () => {
    const { fake } = answer('{"detail":"Not found"}', 404)
    await expect(
      snapshotSample({
        shareId: SHARE_ID,
        apiBase: 'http://api.test',
        outFile,
        publicDir,
        fetch: fake,
      }),
    ).rejects.toThrow('returned 404')
    expect(readFileSync(outFile, 'utf8')).toBe(EXISTING)
  })

  it('leaves the file untouched when the API cannot be reached', async () => {
    const fake = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch
    await expect(
      snapshotSample({
        shareId: SHARE_ID,
        apiBase: 'http://api.test',
        outFile,
        publicDir,
        fetch: fake,
      }),
    ).rejects.toThrow('fetch failed')
    expect(readFileSync(outFile, 'utf8')).toBe(EXISTING)
  })

  it('leaves the file untouched when the response is not a valid Brief', async () => {
    const broken = JSON.stringify({ ...(JSON.parse(FIXTURE) as object), financials: 'none' })
    const { fake } = answer(broken)
    await expect(
      snapshotSample({
        shareId: SHARE_ID,
        apiBase: 'http://api.test',
        outFile,
        publicDir,
        fetch: fake,
      }),
    ).rejects.toThrow('not a valid Brief')
    expect(readFileSync(outFile, 'utf8')).toBe(EXISTING)
  })

  it('refuses to run without VITE_SAMPLE_SHARE_ID', async () => {
    const { fake, urls } = answer(FIXTURE)
    await expect(
      snapshotSample({
        shareId: '  ',
        apiBase: 'http://api.test',
        outFile,
        publicDir,
        fetch: fake,
      }),
    ).rejects.toThrow('VITE_SAMPLE_SHARE_ID is not set')
    expect(urls).toEqual([])
    expect(readFileSync(outFile, 'utf8')).toBe(EXISTING)
  })
})

describe('snapshotCrops (--crops-only)', () => {
  it("fetches the committed brief's crops by its own share ID and leaves the brief alone", async () => {
    writeFileSync(outFile, FIXTURE)
    const { fake, urls } = answer('never asked for')
    await snapshotCrops({
      snapshotFile: outFile,
      apiBase: 'http://api.test',
      publicDir,
      fetch: fake,
    })
    expect(urls).toEqual(CROP_PATHS.map((path) => `http://api.test${path}`))
    expect(readFileSync(outFile, 'utf8')).toBe(FIXTURE)
    expect(new Uint8Array(readFileSync(cropFile('secondary')))).toEqual(PNG)
  })

  it('writes no crop when one of them is not a PNG', async () => {
    writeFileSync(outFile, FIXTURE)
    const { fake } = answer('unused', 200, 'not a png')
    await expect(
      snapshotCrops({ snapshotFile: outFile, apiBase: 'http://api.test', publicDir, fetch: fake }),
    ).rejects.toThrow('did not return a PNG')
    expect(existsSync(cropFile('primary'))).toBe(false)
  })
})

describe('the committed snapshot', () => {
  it('has every crop the landing shows saved under public/, as a PNG', () => {
    const brief = Brief.parse(JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8')))
    const crops = landingCrops(brief)
    expect(crops.length).toBeGreaterThan(0)
    for (const ref of crops) {
      const bytes = readFileSync(new URL(`.${sampleCropPath(ref)}`, PUBLIC_DIR))
      expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    }
  })
})
