import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Spec §11 (WCAG 2.2 AA): axe on each public and review page, target sizes, and focus never
// hidden under the sticky bars.

const BRIEF = '/b/e2e-sample-share-id-000000'
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

/** Runs axe and fails on any serious or critical violation; logs the counts for the record. */
async function expectNoSeriousViolations(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  const summary = violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`).join(', ')
  console.log(
    `axe ${label}: ${violations.length} violations, ${serious.length} serious or critical${summary ? `: ${summary}` : ''}`,
  )
  expect(
    serious.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({ html: n.html, why: n.failureSummary })),
    })),
  ).toEqual([])
}

async function openBrief(page: Page) {
  await page.goto(BRIEF)
  await expect(page.getByRole('link', { name: 'Footnote 1', exact: true })).toBeVisible()
}

type Focus = { key: string; focused: string; obscuredBy: string[] }

/**
 * The focused element, and the sticky or fixed bars painted over its box (the site header, the
 * landing's section links, the brief's sticky margin). An element inside one of those bars is
 * part of it and is not checked. Boxes are compared with getBoundingClientRect; elementFromPoint
 * at the centre of an overlap confirms the bar is the one painted there, so a box drawn above
 * the bar (the skip link sits over the header) does not count. Null once focus leaves the page.
 */
function inspectFocus(page: Page): Promise<Focus | null> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!(el instanceof HTMLElement) || el === document.body) return null
    const describe = (node: Element) =>
      `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}[${
        node.getAttribute('aria-label') ?? (node.textContent ?? '').trim().slice(0, 40)
      }]`
    // A stable key per element, to stop once Tab wraps round.
    const path: number[] = []
    for (let n: Element | null = el; n?.parentElement; n = n.parentElement) {
      path.unshift(Array.prototype.indexOf.call(n.parentElement.children, n))
    }
    const bars = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter((node) => {
      const position = getComputedStyle(node).position
      return position === 'sticky' || position === 'fixed'
    })
    const obscuredBy: string[] = []
    if (!bars.some((bar) => bar.contains(el))) {
      const box = el.getBoundingClientRect()
      for (const bar of bars) {
        if (el.contains(bar)) continue
        const r = bar.getBoundingClientRect()
        const left = Math.max(box.left, r.left)
        const right = Math.min(box.right, r.right)
        const top = Math.max(box.top, r.top)
        const bottom = Math.min(box.bottom, r.bottom)
        if (right - left < 1 || bottom - top < 1) continue
        const x = (left + right) / 2
        const y = (top + bottom) / 2
        const inView = x >= 0 && y >= 0 && x < innerWidth && y < innerHeight
        const painted = inView ? document.elementFromPoint(x, y) : null
        if (painted !== null && !bar.contains(painted)) continue
        obscuredBy.push(describe(bar))
      }
    }
    return { key: path.join('.'), focused: describe(el), obscuredBy }
  })
}

/**
 * Presses `key` until focus leaves the page or comes round again, checking every stop.
 * Returns how many stops there were and each obscured one.
 */
async function tabThrough(page: Page, key: 'Tab' | 'Shift+Tab') {
  const obscured: { focused: string; by: string }[] = []
  const seen = new Set<string>()
  for (let i = 0; i < 400; i++) {
    await page.keyboard.press(key)
    const focus = await inspectFocus(page)
    if (focus === null || seen.has(focus.key)) break
    seen.add(focus.key)
    for (const by of focus.obscuredBy) obscured.push({ focused: focus.focused, by })
  }
  return { stops: seen.size, obscured }
}

test('landing has no serious axe violations, with and without the audit modal', async ({
  page,
}) => {
  await page.goto('/')
  // The hero chart plays its flip once; axe reads colours as painted, so let it settle first.
  await expect(page.locator('figure[data-flip]')).toHaveCount(0)
  await expectNoSeriousViolations(page, '/')

  // The hero's button; How it works has a second one.
  const watch = page
    .getByRole('region', { name: 'The lowest bid is almost never the cheapest.' })
    .getByRole('button', { name: 'Watch 1-Minute Walkthrough' })
  const replay = page.getByRole('dialog', { name: 'Replay: checking TENDER-2026-402' })
  await expect(async () => {
    await watch.click()
    await expect(replay).toBeVisible({ timeout: 1_000 })
  }).toPass()
  // One contentinfo landmark (the site footer), even with the dialog portalled to body.
  await expect(page.getByRole('contentinfo')).toHaveCount(1)
  await expect(page.getByRole('banner')).toHaveCount(1)
  // Axe reads colours as painted: let the dialog finish fading in (Dialog.module.css) first.
  await replay.evaluate((dialog) =>
    Promise.all(
      [dialog, dialog.parentElement]
        .flatMap((node) => node?.getAnimations() ?? [])
        .map((animation) => animation.finished),
    ),
  )
  await expectNoSeriousViolations(page, '/ with the audit modal open')

  await replay.getByRole('button', { name: 'Skip to result' }).click()
  await expect(replay.getByRole('link', { name: 'Open the brief' })).toBeVisible()
  await expect(page.getByRole('contentinfo')).toHaveCount(1)
  await expectNoSeriousViolations(page, '/ with the audit modal at its result')
})

test('brief has no serious axe violations', async ({ page }) => {
  await openBrief(page)
  await expectNoSeriousViolations(page, BRIEF)
})

test('review brief has no serious axe violations', async ({ page }) => {
  await page.goto('/review/TENDER-2026-402')
  await page.getByLabel('Review token').fill('e2e-token')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Verified · shared')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Footnote 1', exact: true })).toBeVisible()
  await expectNoSeriousViolations(page, '/review/TENDER-2026-402')
})

test('every footnote ref is at least 24 × 24 px', async ({ page }) => {
  await openBrief(page)
  const refs = page.getByRole('link', { name: /^Footnote \d+$/ })
  const count = await refs.count()
  expect(count).toBeGreaterThan(0)
  const sizes: string[] = []
  for (let i = 0; i < count; i++) {
    const ref = refs.nth(i)
    await ref.scrollIntoViewIfNeeded()
    const box = await ref.boundingBox()
    expect(box, `footnote ref ${i + 1} has a box`).not.toBeNull()
    const width = box?.width ?? 0
    const height = box?.height ?? 0
    sizes.push(`${width}×${height}`)
    expect(width, `footnote ref ${i + 1} width`).toBeGreaterThanOrEqual(24)
    expect(height, `footnote ref ${i + 1} height`).toBeGreaterThanOrEqual(24)
  }
  console.log(`footnote refs: ${count}, sizes ${[...new Set(sizes)].join(', ')} px`)
})

for (const path of ['/', BRIEF]) {
  test(`tabbing through ${path} never hides focus under a sticky bar`, async ({ page }) => {
    if (path === BRIEF) await openBrief(page)
    else await page.goto(path)
    // Down the page with Tab from the top, then back up with Shift+Tab from the end: a focused
    // element is scrolled in at the bottom going down and at the top (under the bars) going up.
    const down = await tabThrough(page, 'Tab')
    const up = await tabThrough(page, 'Shift+Tab')
    console.log(
      `tab stops on ${path}: ${down.stops} down, ${up.stops} up; obscured: ${down.obscured.length + up.obscured.length}`,
    )
    expect(down.stops).toBeGreaterThan(10)
    expect(up.stops).toBe(down.stops)
    expect([...down.obscured, ...up.obscured]).toEqual([])
  })
}

test('the sticky-bar check catches focus scrolled under the header', async ({ page }) => {
  // Guards the check above: focus a footnote ref, then scroll it to just under the top edge.
  await openBrief(page)
  const ref = page.getByRole('link', { name: 'Footnote 3', exact: true })
  await ref.evaluate((el: HTMLElement) => {
    el.focus({ preventScroll: true })
    window.scrollBy(0, el.getBoundingClientRect().top - 20)
  })
  const focus = await inspectFocus(page)
  expect(focus?.focused).toContain('Footnote 3')
  expect(focus?.obscuredBy).toEqual([expect.stringMatching(/^header/)])
})
