/**
 * `npm run prerender`, the last step of `npm run build` (spec §5.1). It renders `/` to static
 * HTML with the server bundle (`vite build --ssr src/entry-server.tsx`, in dist-ssr/) and
 * writes two pages:
 *
 * - dist/app.html: the shell exactly as Vite built it, with an empty #root. The host serves it
 *   for every route except `/` (the SPA fallback), and main.tsx renders into it.
 * - dist/index.html: the shell with the landing page inside #root, its title, and links to the
 *   landing chunk's CSS and JS, so the page is styled and readable before (or without) any
 *   script, and main.tsx hydrates it.
 *
 * `tsx scripts/prerender.ts [distDir] [ssrDir]` names other build directories, relative to
 * web/ (default dist and dist-ssr); the end-to-end build uses dist-e2e and dist-e2e-ssr, so an
 * e2e run never leaves its environment in dist/.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadEnv } from 'vite'
import { copy } from '../src/content/copy.ts'
import { robotsTxt, seoHead, siteOrigin, sitemapXml } from './seo.ts'

/** Where Vite leaves the app's HTML in index.html (see /index.html). */
export const APP_MARKER = '<!--app-->'

/** `</head>` and the indentation before it, which the inserted links copy (none when inline). */
const HEAD_END = /([ \t]*)<\/head>/

/** The landing page's source, as the build manifest names its lazy chunk. */
const LANDING_SOURCE = 'src/pages/Landing.tsx'

type ManifestChunk = { file: string; css?: string[]; imports?: string[] }
type Manifest = Record<string, ManifestChunk>

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * The files the landing chunk needs, its own and those of the chunks it imports: CSS to link
 * (or the prerendered page would be unstyled until the chunk loads) and JS to preload.
 */
export function landingAssets(manifest: Manifest): { css: string[]; js: string[] } {
  const css = new Set<string>()
  const js = new Set<string>()
  const visit = (key: string) => {
    const chunk = manifest[key]
    if (chunk === undefined) throw new Error(`The build manifest has no entry for ${key}`)
    if (js.has(chunk.file)) return
    js.add(chunk.file)
    for (const file of chunk.css ?? []) css.add(file)
    for (const imported of chunk.imports ?? []) visit(imported)
  }
  visit(LANDING_SOURCE)
  return { css: [...css], js: [...js] }
}

/**
 * The shell with the prerendered app in #root, the landing title, and the given asset links.
 * Assets the shell already links (the entry chunk and its CSS) are not linked twice.
 */
export function prerenderedPage(
  shell: string,
  appHtml: string,
  assets: { css: string[]; js: string[] },
  title: string = copy.landing.title,
  head: readonly string[] = [],
): string {
  if (!shell.includes(APP_MARKER)) throw new Error(`index.html has no ${APP_MARKER} marker`)
  if (!/<title>[^<]*<\/title>/.test(shell)) throw new Error('index.html has no <title>')
  if (!HEAD_END.test(shell)) throw new Error('index.html has no </head>')
  const linked = (file: string) => shell.includes(`/${file}"`)
  // `crossorigin` as on Vite's own links, so the browser reuses these fetches.
  const link = (rel: string) => (file: string) => `<link rel="${rel}" crossorigin href="/${file}">`
  const links = [
    ...head,
    ...assets.css.filter((f) => !linked(f)).map(link('stylesheet')),
    ...assets.js.filter((f) => !linked(f)).map(link('modulepreload')),
  ]
  return shell
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(title)}</title>`)
    .replace(HEAD_END, (_match, indent: string) =>
      [...links.map((l) => `${indent}  ${l}\n`), `${indent}</head>`].join(''),
    )
    .replace(APP_MARKER, () => appHtml)
}

/** The client and server build directories: `[distDir] [ssrDir]`, relative to web/. */
export function buildDirs(args: readonly string[]): { dist: URL; ssr: URL } {
  const [dist = 'dist', ssr = 'dist-ssr'] = args
  const dir = (name: string) => new URL(`../${name.replace(/[\\/]+$/, '')}/`, import.meta.url)
  return { dist: dir(dist), ssr: dir(ssr) }
}

async function main(): Promise<void> {
  const { dist, ssr } = buildDirs(process.argv.slice(2))
  const shell = readFileSync(new URL('index.html', dist), 'utf8')
  const manifestDir = new URL('.vite/', dist)
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', manifestDir), 'utf8'))

  const serverEntry = new URL('entry-server.js', ssr)
  const { render } = (await import(serverEntry.href)) as {
    render: (url: string) => string
  }

  // The production build's VITE_SITE_URL (.env files plus the shell), as Vite itself reads it.
  const env = loadEnv('production', fileURLToPath(new URL('..', import.meta.url)), 'VITE_')
  const site = siteOrigin(env.VITE_SITE_URL)
  const head = seoHead({
    title: copy.landing.title,
    description: copy.landing.description,
    site,
    faq: copy.landing.faq,
  })

  // Render before writing anything, so a failed render leaves dist/ as Vite built it.
  const page = prerenderedPage(
    shell,
    render('/'),
    landingAssets(manifest as Manifest),
    copy.landing.title,
    head,
  )
  writeFileSync(new URL('app.html', dist), shell)
  writeFileSync(new URL('index.html', dist), page)
  writeFileSync(new URL('robots.txt', dist), robotsTxt(site))
  if (site !== null) writeFileSync(new URL('sitemap.xml', dist), sitemapXml(site))
  // The manifest is only for this step; build metadata is not part of the site.
  rmSync(manifestDir, { recursive: true })
  console.log(
    `prerender: wrote index.html (landing) and app.html (shell) in ${fileURLToPath(dist)}`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main()
}
