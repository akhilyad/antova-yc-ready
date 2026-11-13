import { expect, test, type Page } from '@playwright/test'

// Flow 3 (spec §3). It withdraws, overrides and re-verifies the seeded tender, so it runs last
// (playwright.config.ts) and leaves the brief verified again.

const SHARE_PATH = '/b/e2e-sample-share-id-000000'
const NOTE = 'e2e: engineer estimate after vendor clarification'

// *Mark verified* copies the share link; the success text says so only if the copy worked.
test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

async function publicBrief(page: Page) {
  const publicPage = await page.context().newPage()
  await publicPage.goto(SHARE_PATH)
  return publicPage
}

test('founder withdraws, overrides an adder, verifies, and the share link works again', async ({
  page,
}) => {
  await page.goto('/review')
  await page.getByLabel('Review token').fill('e2e-token')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('link', { name: 'TENDER-2026-402' }).click()
  await expect(page).toHaveURL(/\/review\/TENDER-2026-402/)
  await expect(page.getByText('Verified · shared')).toBeVisible()

  // Withdraw: the public link stops working.
  await page.getByRole('button', { name: 'Withdraw brief' }).click()
  const withdraw = page.getByRole('dialog', { name: 'Withdraw this brief?' })
  await withdraw.getByRole('button', { name: 'Withdraw', exact: true }).click()
  await expect(page.getByText('Withdrawn. The share link no longer works.')).toBeVisible()
  await expect(page.getByText('Draft. Only you can see this.')).toBeVisible()

  const gone = await publicBrief(page)
  await expect(gone.getByRole('heading', { name: "This brief isn't available." })).toBeVisible()
  await gone.close()

  // Override Deltaport's I-FAT adder.
  await page
    .getByRole('region', { name: /^All checks:/ })
    .getByRole('link', {
      name: /^Deltaport Skid Consortium B\.V\., Witnessed Factory Acceptance Test \(I-FAT\): /,
    })
    .click()
  await expect(page).toHaveURL(/#f-vendor-c-PARAM-05$/)
  const sidenote = page.getByRole('complementary', { name: 'Evidence' })
  await sidenote.getByLabel('Override adder (€)').fill('2600')
  await sidenote.getByLabel('Why').fill(NOTE)
  await sidenote.getByRole('button', { name: 'Save override' }).click()
  await expect(sidenote.getByText('Override saved.')).toBeVisible()
  await expect(sidenote.getByText(`Overridden: ${NOTE}`)).toBeVisible()

  // Verify: the share link is copied and works again, with the override in it.
  await page.getByRole('button', { name: 'Mark verified' }).click()
  const verify = page.getByRole('dialog', { name: 'Share this brief?' })
  await verify.getByRole('button', { name: 'Mark verified' }).click()
  await expect(page.getByText('Verified. Share link copied.')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    new RegExp(`${SHARE_PATH}$`),
  )

  const back = await publicBrief(page)
  await expect(back.getByText('Verified brief · TENDER-2026-402')).toBeVisible()
  await back
    .getByRole('region', { name: /^All checks:/ })
    .getByRole('link', {
      name: /^Deltaport Skid Consortium B\.V\., Witnessed Factory Acceptance Test \(I-FAT\): /,
    })
    .click()
  await expect(
    back.getByRole('complementary', { name: 'Evidence' }).getByText(`Overridden: ${NOTE}`),
  ).toBeVisible()
  await back.close()
})
