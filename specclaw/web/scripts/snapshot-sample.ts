/**
 * `npm run snapshot:sample`: refreshes src/generated/sample-brief.json, the snapshot the
 * landing page renders from (spec §5.1, §7.1), from a running API's public endpoint
 * GET /api/briefs/{VITE_SAMPLE_SHARE_ID} (spec §6.3), together with the page crops the landing
 * shows (sampleCrops.ts), saved under public/sample/ so the landing makes no API request.
 *
 * It never invents data. If a request fails, the brief is not a verified Brief for that share
 * ID, or a crop is not a PNG, it exits 1 and leaves every file as it was. Otherwise it writes
 * the crops, then the brief with `snapshot_at` (when it was taken) added: keys sorted,
 * two-space indent, LF line endings and a trailing newline, the layout of the test fixture it
 * started from.
 *
 * `npm run snapshot:crops` (`--crops-only`) fetches only the crops for the brief already in
 * the snapshot file, from its own share ID, and leaves that file alone.
 *
 * The API is VITE_API_BASE, or the dev API at http://127.0.0.1:8000 when that is empty.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadEnv } from 'vite'
import { Brief } from '../src/api/schemas.ts'
import {
  landingCrops,
  sampleCropPath,
  type CropRef,
} from '../src/components/landing/sampleCrops.ts'

/** The dev API, where Vite's /api proxy points (vite.config.ts). */
export const DEV_API = 'http://127.0.0.1:8000'

export const SNAPSHOT_FILE = new URL('../src/generated/sample-brief.json', import.meta.url)

/** Vite's public directory: served at the site root and copied into every build. */
export const PUBLIC_DIR = new URL('../public/', import.meta.url)

export type SnapshotOptions = {
  shareId: string | undefined
  apiBase: string
  outFile: URL
  /** Where the crops go (public/ in the app), at their `sampleCropPath`. */
  publicDir: URL
  fetch?: typeof fetch
  now?: () => Date
}

export type Crop = { ref: CropRef; bytes: Uint8Array }

/** Every PNG file starts with these eight bytes. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)
}

/**
 * Fetches every crop the landing shows for `brief` from the public evidence route, in memory.
 * Throws, having written nothing, on a failed request or a response that is not a PNG.
 */
export async function fetchCrops(brief: Brief, apiBase: string, get = fetch): Promise<Crop[]> {
  const base = `${apiBase.replace(/\/+$/, '')}/api/briefs/${encodeURIComponent(brief.share_id)}`
  const crops: Crop[] = []
  for (const ref of landingCrops(brief)) {
    const url = `${base}/evidence/${encodeURIComponent(ref.paramId)}/${encodeURIComponent(ref.source)}/${ref.which}.png`
    let response: Response
    try {
      response = await get(url, { headers: { Accept: 'image/png' } })
    } catch (error) {
      throw new Error(`GET ${url} failed: ${error instanceof Error ? error.message : error}`)
    }
    if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (!isPng(bytes)) throw new Error(`GET ${url} did not return a PNG`)
    crops.push({ ref, bytes })
  }
  return crops
}

/** Writes each crop under `publicDir` at its `sampleCropPath`. */
export function writeCrops(crops: readonly Crop[], publicDir: URL): void {
  for (const { ref, bytes } of crops) {
    const file = new URL(`.${sampleCropPath(ref)}`, publicDir)
    mkdirSync(dirname(fileURLToPath(file)), { recursive: true })
    writeFileSync(file, bytes)
  }
}

export type CropsOnlyOptions = {
  snapshotFile: URL
  apiBase: string
  publicDir: URL
  fetch?: typeof fetch
}

/** `--crops-only`: the crops for the brief already in `snapshotFile`, which is not touched. */
export async function snapshotCrops(options: CropsOnlyOptions): Promise<Crop[]> {
  const brief = Brief.parse(JSON.parse(readFileSync(options.snapshotFile, 'utf8')))
  const crops = await fetchCrops(brief, options.apiBase, options.fetch)
  writeCrops(crops, options.publicDir)
  return crops
}

/** Objects with their keys in order, so a refreshed snapshot diffs cleanly against the last. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}

/**
 * Fetches the sample brief, validates it, and only then writes it to `outFile`. Throws, having
 * written nothing, on a missing share ID, a failed request, or a response that is not a
 * verified Brief for that share ID. Returns the brief it wrote.
 */
export async function snapshotSample(options: SnapshotOptions): Promise<Brief> {
  const { apiBase, outFile, fetch: get = fetch, now = () => new Date() } = options
  const shareId = options.shareId?.trim()
  if (!shareId) throw new Error('VITE_SAMPLE_SHARE_ID is not set: which brief is the sample?')

  const url = `${apiBase.replace(/\/+$/, '')}/api/briefs/${encodeURIComponent(shareId)}`
  let response: Response
  try {
    response = await get(url, { headers: { Accept: 'application/json' } })
  } catch (error) {
    throw new Error(`GET ${url} failed: ${error instanceof Error ? error.message : error}`)
  }
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`)

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error(`GET ${url} did not return JSON`)
  }
  const parsed = Brief.safeParse(body)
  if (!parsed.success) {
    throw new Error(`GET ${url} is not a valid Brief:\n${parsed.error.message}`)
  }
  const brief = parsed.data
  if (brief.share_id !== shareId) {
    throw new Error(`GET ${url} returned the brief ${brief.share_id}, not ${shareId}`)
  }
  if (brief.status !== 'VERIFIED') {
    throw new Error(`The brief ${shareId} is ${brief.status}, not VERIFIED`)
  }

  // Every crop is in hand before anything is written: a brief never lands without its crops.
  const crops = await fetchCrops(brief, apiBase, get)
  writeCrops(crops, options.publicDir)
  const snapshot = sortKeys({ ...(body as object), snapshot_at: now().toISOString() })
  writeFileSync(outFile, `${JSON.stringify(snapshot, null, 2)}\n`)
  return brief
}

async function main(): Promise<void> {
  const root = fileURLToPath(new URL('..', import.meta.url))
  // The production build's view of the environment: .env files plus the shell's VITE_ vars.
  const env = loadEnv('production', root, 'VITE_')
  const apiBase = env.VITE_API_BASE?.trim() || DEV_API
  try {
    if (process.argv.includes('--crops-only')) {
      const crops = await snapshotCrops({
        snapshotFile: SNAPSHOT_FILE,
        apiBase,
        publicDir: PUBLIC_DIR,
      })
      for (const { ref } of crops) console.log(`snapshot:crops: wrote public${sampleCropPath(ref)}`)
      return
    }
    const brief = await snapshotSample({
      shareId: env.VITE_SAMPLE_SHARE_ID,
      apiBase,
      outFile: SNAPSHOT_FILE,
      publicDir: PUBLIC_DIR,
    })
    console.log(
      `snapshot:sample: wrote ${brief.share_id} (${brief.tender.id}) and its crops to ${fileURLToPath(SNAPSHOT_FILE)}`,
    )
  } catch (error) {
    console.error(`snapshot:sample: ${error instanceof Error ? error.message : error}`)
    console.error('snapshot:sample: the snapshot and its crops were left unchanged.')
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main()
}
