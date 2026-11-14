// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { robotsTxt, seoHead, siteOrigin, sitemapXml } from './seo.ts'

describe('siteOrigin', () => {
  it('is null when unset or blank', () => {
    expect(siteOrigin(undefined)).toBeNull()
    expect(siteOrigin('  ')).toBeNull()
  })

  it('drops a trailing slash and keeps a base path', () => {
    expect(siteOrigin('https://antova.example/')).toBe('https://antova.example')
    expect(siteOrigin(' https://example.org/antova/ ')).toBe('https://example.org/antova')
  })

  it('throws on a value that is not an http(s) URL', () => {
    expect(() => siteOrigin('antova.example')).toThrow('not a URL')
    expect(() => siteOrigin('ftp://antova.example')).toThrow('http(s)')
  })
})

describe('seoHead', () => {
  it('has description and Open Graph text but no absolute URLs without a site', () => {
    const tags = seoHead({ title: 'A & B', description: 'Says "hi"', site: null }).join('\n')
    expect(tags).toContain('<meta name="description" content="Says &quot;hi&quot;">')
    expect(tags).toContain('<meta property="og:title" content="A &amp; B">')
    expect(tags).not.toContain('canonical')
    expect(tags).not.toContain('og:url')
    expect(tags).not.toContain('ld+json')
  })

  it('adds canonical, og:url and structured data with a site', () => {
    const tags = seoHead({ title: 'T', description: 'D </script>', site: 'https://a.example' })
    expect(tags).toContain('<link rel="canonical" href="https://a.example/">')
    expect(tags).toContain('<meta property="og:url" content="https://a.example/">')
    const ld = tags.find((t) => t.includes('ld+json'))!
    expect(ld).not.toContain('</script><') // the description cannot close the element early
    const json = JSON.parse(ld.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''))
    expect(json).toMatchObject({ '@type': 'SoftwareApplication', url: 'https://a.example/' })
    expect(json.description).toBe('D </script>')
  })
})

describe('seoHead FAQ data', () => {
  it('lists only answered questions, with `<` escaped', () => {
    const tags = seoHead({
      title: 'T',
      description: 'D',
      site: null,
      faq: [
        { question: 'Q1 <b>?', answer: 'A1 </script>' },
        { question: 'Q2?', answer: null },
      ],
    })
    const ld = tags.find((t) => t.includes('FAQPage'))!
    expect(ld).not.toContain('</script><')
    expect(ld).not.toContain('<b>')
    const json = JSON.parse(ld.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''))
    expect(json.mainEntity).toEqual([
      {
        '@type': 'Question',
        name: 'Q1 <b>?',
        acceptedAnswer: { '@type': 'Answer', text: 'A1 </script>' },
      },
    ])
  })

  it('adds no FAQ data when nothing is answered', () => {
    const tags = seoHead({ title: 'T', description: 'D', site: null, faq: [] })
    expect(tags.some((t) => t.includes('FAQPage'))).toBe(false)
  })
})

describe('robotsTxt and sitemapXml', () => {
  it('disallows review mode and names the sitemap when the site is known', () => {
    expect(robotsTxt(null)).toBe('User-agent: *\nDisallow: /review\n')
    expect(robotsTxt('https://a.example')).toContain('Sitemap: https://a.example/sitemap.xml')
  })

  it('lists the landing and legal pages', () => {
    const xml = sitemapXml('https://a.example')
    expect(xml).toContain('<loc>https://a.example/</loc>')
    expect(xml).toContain('<loc>https://a.example/privacy</loc>')
    expect(xml).not.toContain('/review')
    expect(xml).not.toContain('/b/')
  })
})
