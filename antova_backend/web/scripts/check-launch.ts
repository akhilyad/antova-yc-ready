/**
 * `npm run check:launch`: the founder-supplied launch items (spec §13) that code can check.
 * Prints one line per problem and exits 1 if there is any, so a deploy can gate on it.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadEnv } from 'vite'
import { Brief } from '../src/api/schemas.ts'
import { copy, type FaqItem } from '../src/content/copy.ts'
import { siteOrigin } from './seo.ts'

/** The marker each founder-supplied content file starts with until its text is in. */
export const PLACEHOLDER = 'FOUNDER-TO-SUPPLY'

/** The founder-supplied content files, relative to src/content. */
export const CONTENT_FILES = ['impressum.md', 'privacy.md'] as const

/** The share ID the end-to-end run seeds (e2e/start-api.mjs); never the live sample. */
export const E2E_SHARE_ID = 'e2e-sample-share-id-000000'

/**
 * Everything that would make the public site untrue or incomplete, one message per problem:
 * a content file still holding the placeholder, no contact address, a sample snapshot that
 * is test (answer-key) output or the end-to-end brief, VITE_SAMPLE_SHARE_ID unset or naming
 * another brief than the snapshot, and an FAQ answer the founder hasn't signed off.
 */
export function launchProblems(
  env: Record<string, string | undefined>,
  contentFiles: Record<string, string>,
  snapshot: Brief,
  faq: readonly FaqItem[] = copy.landing.faq,
): string[] {
  const problems: string[] = []
  for (const [name, text] of Object.entries(contentFiles)) {
    if (text.includes(PLACEHOLDER)) {
      problems.push(
        `src/content/${name} still contains ${PLACEHOLDER}: replace it with the founder's text.`,
      )
    }
  }
  if (!env.VITE_CONTACT_EMAIL?.trim()) {
    problems.push('VITE_CONTACT_EMAIL is not set: the landing page has no contact address.')
  }
  try {
    if (siteOrigin(env.VITE_SITE_URL) === null) {
      problems.push(
        'VITE_SITE_URL is not set: the landing page has no canonical link, structured data or sitemap.',
      )
    }
  } catch (error) {
    problems.push(`${(error as Error).message}: set it to the site's https origin.`)
  }
  if (snapshot.ingest_mode === 'answer_key') {
    problems.push(
      'The sample snapshot is a test extraction (ingest_mode "answer_key"): ingest the sample live, verify it, then run npm run snapshot:sample.',
    )
  }
  if (snapshot.share_id === E2E_SHARE_ID) {
    problems.push(
      `The sample snapshot is the end-to-end test brief (${E2E_SHARE_ID}): run npm run snapshot:sample against the production API.`,
    )
  }
  const sampleShareId = env.VITE_SAMPLE_SHARE_ID?.trim()
  if (!sampleShareId) {
    problems.push('VITE_SAMPLE_SHARE_ID is not set: the landing page links to no sample brief.')
  } else if (sampleShareId !== snapshot.share_id) {
    problems.push(
      `VITE_SAMPLE_SHARE_ID (${sampleShareId}) is not the snapshot's brief (${snapshot.share_id}): the landing page would link to a different brief than it shows.`,
    )
  }
  for (const item of faq) {
    if (item.answer === null) {
      problems.push(
        `The FAQ answer to "${item.question}" is not signed off: fill it in src/content/copy.ts.`,
      )
    }
  }
  return problems
}

function main(): void {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  // The production build's view of the environment: .env files plus the shell's VITE_ vars.
  const env = loadEnv('production', root, 'VITE_')
  const content = Object.fromEntries(
    CONTENT_FILES.map((name) => [name, read(`src/content/${name}`)]),
  )
  const snapshot = Brief.parse(JSON.parse(read('src/generated/sample-brief.json')))
  const problems = launchProblems(env, content, snapshot)
  for (const problem of problems) console.error(`✗ ${problem}`)
  if (problems.length > 0) process.exit(1)
  console.log('Launch check passed.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
