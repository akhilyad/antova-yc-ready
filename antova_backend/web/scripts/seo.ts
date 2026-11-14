/**
 * Search and link-preview metadata for the prerendered landing page, plus robots.txt and
 * sitemap.xml (Phase 5). Only `/` is indexable: briefs and review pages carry
 * `noindex` at runtime (useNoIndex), and /review is also disallowed in robots.txt.
 *
 * The site's public origin comes from VITE_SITE_URL. Without it the page still gets its
 * description and Open Graph text, but no canonical link, og:url, structured data or sitemap,
 * because those need absolute URLs; `npm run check:launch` reports it unset.
 */

/** The indexable pages, as paths below the site URL. */
export const SITEMAP_PATHS = ['/', '/impressum', '/privacy'] as const

function escapeAttr(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * VITE_SITE_URL as an origin with no trailing slash, or null when unset or blank. Throws on
 * a value that is not an absolute http(s) URL, so a typo fails the build instead of shipping
 * broken canonical links.
 */
export function siteOrigin(raw: string | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`VITE_SITE_URL is not a URL: ${value}`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`VITE_SITE_URL must be http(s): ${value}`)
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/** The tags the landing page's head gets, one per line, in a stable order. */
export function seoHead(opts: {
  title: string
  description: string
  site: string | null
  /** The landing FAQ; only answered items go into the FAQPage data. */
  faq?: readonly { question: string; answer: string | null }[]
}): string[] {
  const { title, description, site, faq = [] } = opts
  const t = escapeAttr(title)
  const d = escapeAttr(description)
  const tags = [
    `<meta name="description" content="${d}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Antova">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta name="twitter:card" content="summary">`,
  ]
  if (site !== null) {
    const home = `${site}/`
    tags.push(`<link rel="canonical" href="${escapeAttr(home)}">`)
    tags.push(`<meta property="og:url" content="${escapeAttr(home)}">`)
    tags.push(
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Antova',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: home,
        description,
      }),
    )
  }
  const answered = faq.filter((item) => item.answer !== null)
  if (answered.length > 0) {
    tags.push(
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: answered.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      }),
    )
  }
  return tags
}

/** A JSON-LD script element; `<` is escaped so the JSON can never close the element. */
function jsonLd(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`
}

/** robots.txt: everything but review mode may be crawled; names the sitemap when known. */
export function robotsTxt(site: string | null): string {
  const lines = ['User-agent: *', 'Disallow: /review', '']
  if (site !== null) lines.push(`Sitemap: ${site}/sitemap.xml`, '')
  return lines.join('\n')
}

/** sitemap.xml for the indexable pages. */
export function sitemapXml(site: string): string {
  const urls = SITEMAP_PATHS.map(
    (path) => `  <url><loc>${escapeAttr(site + path)}</loc></url>`,
  ).join('\n')
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${urls}\n` +
    '</urlset>\n'
  )
}
