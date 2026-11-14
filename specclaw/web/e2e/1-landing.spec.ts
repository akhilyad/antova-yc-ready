import { expect, test } from '@playwright/test'

// Flow 1 (spec §3): landing → replay → the brief at the footnote the replay ends on.
test('landing replay opens the brief at the VoltSwitch contradiction', async ({ page }) => {
  await page.goto('/')
  // The hero's button; How it works has a second one.
  const watch = page
    .getByRole('region', { name: 'The lowest bid is almost never the cheapest.' })
    .getByRole('button', { name: 'Watch 1-Minute Walkthrough' })
  const replay = page.getByRole('dialog', { name: 'Replay: checking TENDER-2026-402' })

  // The landing is prerendered: a click before hydration does nothing, so retry until it opens.
  await expect(async () => {
    await watch.click()
    await expect(replay).toBeVisible({ timeout: 1_000 })
  }).toPass()

  await replay.getByRole('button', { name: 'Skip to result' }).click()
  await replay.getByRole('link', { name: 'Open the brief' }).click()

  await expect(page).toHaveURL(/\/b\/e2e-sample-share-id-000000#f-vendor-b-PARAM-01$/)
  await expect(replay).toBeHidden()
  const sidenote = page.getByRole('complementary', { name: 'Evidence' })
  await expect(sidenote).toContainText('NOTE 7')
})

// Landing proposal, step 2: the hero chart ships armed (bid column only) and plays its flip
// once, ending on the final chart with VoltSwitch's fall marked.
test('hero chart is prerendered armed and settles after its flip', async ({ page, request }) => {
  const html = await (await request.get('/')).text()
  expect(html).toContain('data-flip="armed"')

  await page.goto('/')
  const chart = page.locator('figure').first()
  await expect(chart).not.toHaveAttribute('data-flip')
  await expect(chart.getByText('1st → 3rd')).toBeVisible()
  await expect(chart.locator('[data-flip-part]')).toHaveCount(0)
  // VoltSwitch's line ends at its evaluated price, as the static chart draws it.
  await expect(chart.locator('line[data-vendor="vendor-b"]')).toHaveAttribute('x2', '100')
})

// The side-by-side example links to the full sample brief, which the landing ships without the API.
test('the side-by-side example opens the sample brief', async ({ page }) => {
  await page.goto('/')
  const example = page.getByRole('region', { name: 'How buyers get tricked by low bids' })
  await example.scrollIntoViewIfNeeded()
  const link = example.getByRole('link', { name: /See full sample check with direct page proof/ })
  await expect(link).toHaveAttribute('href', /\/b\/e2e-sample-share-id-000000/)
  // Prerendered: a click before hydration is a full page load, which also lands on the brief.
  await link.click()
  await expect(page).toHaveURL(/\/b\/e2e-sample-share-id-000000/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
