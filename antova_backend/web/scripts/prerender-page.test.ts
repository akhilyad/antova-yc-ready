// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildDirs, prerenderedPage } from './prerender.ts'

const ASSETS = { css: ['assets/Landing-abc.css'], js: ['assets/Landing-abc.js'] }

describe('prerenderedPage', () => {
  it('links the landing assets before an indented </head>', () => {
    const shell =
      '<html>\n  <head>\n    <title>x</title>\n  </head>\n  <body><!--app--></body>\n</html>'
    const page = prerenderedPage(shell, '<p>hi</p>', ASSETS, 'T')
    expect(page).toContain(
      '    <title>T</title>\n' +
        '    <link rel="stylesheet" crossorigin href="/assets/Landing-abc.css">\n' +
        '    <link rel="modulepreload" crossorigin href="/assets/Landing-abc.js">\n' +
        '  </head>',
    )
    expect(page).toContain('<body><p>hi</p></body>')
  })

  it('links the landing assets when </head> follows other markup on its line', () => {
    const shell = '<html><head><title>x</title></head><body><!--app--></body></html>'
    const page = prerenderedPage(shell, '<p>hi</p>', ASSETS, 'T')
    const head = page.slice(0, page.indexOf('</head>'))
    expect(head).toContain('<link rel="stylesheet" crossorigin href="/assets/Landing-abc.css">')
    expect(head).toContain('<link rel="modulepreload" crossorigin href="/assets/Landing-abc.js">')
  })

  it('puts the head tags before the asset links', () => {
    const shell = '<html><head><title>x</title></head><body><!--app--></body></html>'
    const page = prerenderedPage(shell, '<p>hi</p>', ASSETS, 'T', ['<meta name="description">'])
    const head = page.slice(0, page.indexOf('</head>'))
    expect(head.indexOf('<meta name="description">')).toBeGreaterThan(head.indexOf('<title>'))
    expect(head.indexOf('<meta name="description">')).toBeLessThan(head.indexOf('stylesheet'))
  })

  it('throws when the shell has no </head>', () => {
    const shell = '<html><head><title>x</title><body><!--app--></body></html>'
    expect(() => prerenderedPage(shell, '<p>hi</p>', ASSETS, 'T')).toThrow('</head>')
  })
})

describe('buildDirs', () => {
  it('defaults to dist and dist-ssr', () => {
    const { dist, ssr } = buildDirs([])
    expect(dist.href).toMatch(/\/web\/dist\/$/)
    expect(ssr.href).toMatch(/\/web\/dist-ssr\/$/)
  })

  it('reads the end-to-end build directories from its arguments', () => {
    const { dist, ssr } = buildDirs(['dist-e2e', 'dist-e2e-ssr/'])
    expect(dist.href).toMatch(/\/web\/dist-e2e\/$/)
    expect(ssr.href).toMatch(/\/web\/dist-e2e-ssr\/$/)
  })
})
