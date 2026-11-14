import { expect, test } from '@playwright/test'

// Spec §11: footnote refs are links in reading order; Enter moves focus to the sidenote
// heading, Escape returns it to the ref. Keyboard only, from the top of the page.
test('Tab to footnote 2, Enter focuses its sidenote heading, Escape returns focus', async ({
  page,
}) => {
  await page.goto('/b/e2e-sample-share-id-000000')
  const ref = page.getByRole('link', { name: 'Footnote 2', exact: true })
  await expect(ref).toBeVisible()

  let reached = false
  for (let i = 0; i < 200 && !reached; i++) {
    await page.keyboard.press('Tab')
    reached = await ref.evaluate((el) => el === document.activeElement)
  }
  expect(reached, 'Tab reaches footnote 2').toBe(true)

  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#f-vendor-b-PARAM-02$/)
  const heading = page
    .getByRole('complementary', { name: 'Evidence' })
    .getByRole('heading', { level: 2, name: 'Main Busbar Material & Continuous Current' })
  await expect(heading).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(ref).toBeFocused()
})
