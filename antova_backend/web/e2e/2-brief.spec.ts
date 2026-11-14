import { expect, test } from '@playwright/test'

// Flow 2 (spec §3): share link → brief → a cell's evidence with its page crop → sliders re-price.
test('a grid cell shows its page crop and the copper slider re-prices VoltSwitch', async ({
  page,
}) => {
  await page.goto('/b/e2e-sample-share-id-000000')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const grid = page.getByRole('region', { name: /^All checks:/ })
  await grid
    .getByRole('link', {
      name: /^VoltSwitch Industrial, Main Busbar Material & Continuous Current: /,
    })
    .click()
  await expect(page).toHaveURL(/#f-vendor-b-PARAM-02$/)

  const sidenote = page.getByRole('complementary', { name: 'Evidence' })
  await expect(
    sidenote.getByRole('heading', { name: 'Main Busbar Material & Continuous Current' }),
  ).toBeVisible()
  // The crop sits inside its "Open full size" link, which names it; the image itself is
  // decorative there (alt=""), so it is found through the link.
  const crop = sidenote.getByRole('link', { name: /Open full size/ }).locator('img')
  await expect(crop).toBeVisible()
  await expect
    .poll(() => crop.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBeGreaterThan(0)

  const voltSwitch = page
    .getByRole('region', { name: 'Bid prices and evaluated prices' })
    .getByRole('row', { name: /^VoltSwitch Industrial/ })
  // Bid price · Technical gaps · Commercial gaps · Evaluated price · Requirements met
  const evaluated = voltSwitch.getByRole('cell').nth(3)
  const before = await evaluated.innerText()
  expect(before).toMatch(/^€\d/)

  const copper = page.getByRole('slider', { name: 'Copper price' })
  await copper.focus()
  await copper.press('End')
  const max = await copper.getAttribute('max')
  expect(max).not.toBeNull()
  await expect(copper).toHaveValue(max ?? '')

  // The settled re-price is announced; the table counts to the same figure.
  const announced = page
    .getByRole('status')
    .filter({ hasText: 'VoltSwitch Industrial evaluated price' })
  await expect(announced).toHaveCount(1)
  const price = /VoltSwitch Industrial evaluated price (€[\d,]+(?:\.\d\d)?)/.exec(
    await announced.innerText(),
  )
  expect(price?.[1]).toBeDefined()
  expect(price?.[1]).not.toBe(before)
  await expect(evaluated).toHaveText(price?.[1] ?? '')
})
