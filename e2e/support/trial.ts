import { expect, type Page } from '@playwright/test'

/**
 * Starts a package on its free trial — what every new workspace does first.
 *
 * NCOM has no free tier. A new owner is sent through onboarding (business,
 * then package) before the dashboard opens, so for a fresh account this
 * walks that; for one already onboarded it uses Billing's package picker.
 * Business by default, because templates create several sites' worth of
 * pages and the smaller packages would turn a test about something else into
 * a quota test.
 */
export async function startTrial(page: Page, packageName = 'Business') {
  await page.goto('/billing/plans')
  if (new URL(page.url()).pathname === '/onboarding') {
    await completeOnboarding(page, packageName)
    return
  }
  await page
    .getByRole('heading', { name: packageName, exact: true, level: 3 })
    .click()
  await page.getByRole('button', { name: 'Start free trial' }).click()
  await expect(page).toHaveURL(/\/billing\?trial=started/, { timeout: 30_000 })
}

/** Walks /onboarding: names the business, then starts the package's trial. */
export async function completeOnboarding(page: Page, packageName = 'Business') {
  await expect(page).toHaveURL(/\/onboarding/)
  const businessName = page.getByLabel('Business name')
  if (await businessName.isVisible()) {
    await businessName.fill('E2E Business')
    await page.getByRole('button', { name: 'Continue' }).click()
  }
  await page
    .getByRole('radio', { name: new RegExp(`^${packageName}\\b`) })
    .click()
  await page.getByRole('button', { name: /Start my free trial/ }).click()
  await expect(
    page.getByRole('heading', { name: /You’re all set/ })
  ).toBeVisible({ timeout: 30_000 })
}
