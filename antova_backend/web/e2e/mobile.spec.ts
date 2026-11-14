import { expect, test } from '@playwright/test'

// Below 960 px the sidenote is a bottom sheet (spec §7.3), with dialog semantics (spec §11).
test.use({ viewport: { width: 390, height: 844 } })

test('a footnote opens the bottom sheet and Escape closes it', async ({ page }) => {
  await page.goto('/b/e2e-sample-share-id-000000')
  const ref = page.getByRole('link', { name: 'Footnote 2', exact: true })
  await expect(ref).toBeVisible()
  // No margin at this width: the evidence waits for a footnote.
  await expect(page.getByRole('complementary', { name: 'Evidence' })).toHaveCount(0)

  await ref.click()
  const sheet = page.getByRole('dialog', { name: 'Main Busbar Material & Continuous Current' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('heading', { level: 2 })).toBeFocused()
  // Measure once the slide-in has finished.
  await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  const box = await sheet.boundingBox()
  expect(box).not.toBeNull()
  // A sheet from the bottom edge, inside the 390 px viewport.
  expect(box?.width ?? 0).toBeLessThanOrEqual(390)
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(844)

  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(ref).toBeFocused()
})
