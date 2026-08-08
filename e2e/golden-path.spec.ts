import { test, expect } from '@playwright/test'

/**
 * The end-to-end path the whole app exists to support: register, start a
 * project from a template, edit it in the builder, publish it, and see the
 * published snapshot on the tenant's own subdomain. Depends on the seeded
 * "SaaS Launch" template (see prisma/seed.ts) — run `prisma db seed` first.
 */
test('register, create from template, edit, publish, view live', async ({
  page,
}) => {
  const stamp = Date.now()
  const email = `e2e-${stamp}@example.com`

  await test.step('register', async () => {
    await page.goto('/register')
    await page.getByLabel('Name').fill('E2E Test User')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('Sup3rSecure!Passw0rd')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
  })

  await test.step('start a project from the seeded template', async () => {
    await page.goto('/templates')
    const templateCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: 'SaaS Launch' })
    await expect(templateCard).toBeVisible()

    await templateCard.getByRole('button', { name: 'Use template' }).click()

    await expect(page).toHaveURL(/\/projects\/new\?template=/)
    await page.getByLabel('Project name').fill(`E2E Project ${stamp}`)
    await page.getByRole('button', { name: 'Create project' }).click()
    await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/)
  })

  const subdomain = await test.step('read the assigned subdomain', async () => {
    const text = await page.getByText(/\.ncom\.app$/).textContent()
    const value = text?.replace('.ncom.app', '').trim()
    if (!value) throw new Error('Could not read project subdomain')
    return value
  })

  await test.step('open the builder and confirm sections render', async () => {
    await page.getByRole('button', { name: 'Edit' }).first().click()
    await expect(page.getByText('Hero', { exact: true })).toBeVisible()
    await expect(
      page
        .frameLocator('iframe')
        .getByText('Ship a landing page your customers actually believe')
    ).toBeVisible()
    await page.getByRole('button', { name: '← Back' }).click()
  })

  await test.step('publish', async () => {
    await page.getByRole('button', { name: 'Page actions' }).first().click()
    await page.getByRole('menuitem', { name: 'Publish', exact: true }).click()
    await expect(page.getByText('PUBLISHED')).toBeVisible()
  })

  await test.step('view the published page on its own subdomain', async () => {
    const base = new URL(page.url())
    const publicUrl = `${base.protocol}//${subdomain}.${base.host}/`
    await page.goto(publicUrl)
    await expect(
      page.getByText('Ship a landing page your customers actually believe')
    ).toBeVisible()
  })
})
