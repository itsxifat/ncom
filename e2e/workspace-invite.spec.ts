import { test, expect } from '@playwright/test'

/**
 * The cold open of an invitation link.
 *
 * This is the one dashboard URL routinely opened by someone who is not signed
 * in — often by someone with no account at all — and it is the only part of the
 * invitation flow that can be tested without a seat on the plan or a verified
 * mailbox, so it is the part pinned here.
 *
 * The regression it guards: /invitations/* was missing from the proxy's auth
 * gate, so an anonymous request fell through to the dashboard layout, which
 * *throws* rather than redirects when there is no session. The recipient got the
 * error boundary instead of a login prompt, and the invitation was unusable.
 */
test('an invitation link opened signed-out asks for sign-in, not an error', async ({
  page,
}) => {
  // The token does not have to be real: the gate runs long before anything
  // looks it up, and an invalid token exercises the same path a valid one takes.
  const token = 'e2e-not-a-real-token'
  await page.goto(`/invitations/accept?token=${token}`)

  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByText('An unexpected error occurred')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

  // Signing in has to come back to the invitation, token intact — landing on
  // the dashboard instead loses the invitation just as thoroughly as erroring.
  const callback = new URL(page.url()).searchParams.get('callbackUrl')
  expect(callback).toContain(`/invitations/accept?token=${token}`)

  await expect(
    page.locator('form input[name="callbackUrl"]').first()
  ).toHaveValue(`/invitations/accept?token=${token}`)
})
