/**
 * The API for the end-to-end run (spec §14): a fresh SQLite database, the sample tender seeded
 * offline with a known share ID, then uvicorn on port 8000. Playwright starts and stops it.
 *
 * The database is deleted first because dev_seed applies --share-id only to a tender that is
 * not in the database yet.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const tmp = resolve(here, '.tmp')
const db = resolve(tmp, 'e2e.db')
const python = process.env.PYTHON || 'python'

mkdirSync(tmp, { recursive: true })
rmSync(db, { force: true })

const env = {
  ...process.env,
  // SQLAlchemy takes forward slashes on Windows too: sqlite:///C:/…/e2e.db, sqlite:////home/….
  ANTOVA_DATABASE_URL: `sqlite:///${db.replaceAll('\\', '/')}`,
  ANTOVA_REVIEW_TOKEN: 'e2e-token',
  ANTOVA_ALLOWED_ORIGINS: 'http://localhost:4173',
}

const seed = spawnSync(
  python,
  ['-m', 'antova_ingest.dev_seed', '--share-id', 'e2e-sample-share-id-000000'],
  { cwd: repoRoot, env, stdio: 'inherit' },
)
if (seed.status !== 0) {
  console.error(`start-api: dev_seed failed (${seed.error?.message ?? `exit ${seed.status}`})`)
  process.exit(1)
}

const api = spawn(python, ['-m', 'uvicorn', 'antova_api:app', '--port', '8000'], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
})
api.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => api.kill(signal))
}
