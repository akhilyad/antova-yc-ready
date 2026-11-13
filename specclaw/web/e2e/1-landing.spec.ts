import { expect, test } from '@playwright/test'

// Flow 1 (spec §3): landing → replay → the brief at the footnote the replay ends on.
test('landing replay opens the brief at the VoltSwitch contradiction', async ({ page }) => {
  await page.goto('/')
  // The hero's button; How it works has a second one.
  const watch = page
    .getByRole('region', { name: "The cheapest bid wasn't the cheapest." })
    .getByRole('button', { name: 'Watch it check a tender' })
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

// Landing proposal, step 3: the receipt's two page crops are static files in the build (saved
// by snapshot:sample), so they load without the API.
test('receipt crops load from the static build', async ({ page }) => {
  await page.goto('/')
  const receipt = page.getByRole('region', { name: /extra €64,800 comes from/ })
  await receipt.scrollIntoViewIfNeeded()
  const crops = receipt.getByRole('img')
  await expect(crops).toHaveCount(2)
  for (const crop of await crops.all()) {
    await expect
      .poll(() => crop.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true)
  }
  await expect(receipt.getByRole('table')).toContainText('€482,800')
})
