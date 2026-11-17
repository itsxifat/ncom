import { expect, type Page } from '@playwright/test'

/**
 * Starts a package on its free trial — what every new workspace does first.
 *
 * NCOM has no free tier: until a package is chosen the dashboard shows only
 * "Choose a package", so any test that builds something starts here. Business
 * by default, because templates create several sites' worth of pages and the
 * smaller packages would turn a test about something else into a quota test.
 */
export async function startTrial(page: Page, packageName = 'Business') {
  await page.goto('/billing/plans')
  await page
    .getByRole('heading', { name: packageName, exact: true, level: 3 })
    .click()
  await page.getByRole('button', { name: 'Start free trial' }).click()
  await expect(page).toHaveURL(/\/billing\?trial=started/, { timeout: 30_000 })
}
