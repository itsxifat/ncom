import 'server-only'
import { prisma } from '@/server/db/client'
import { requireOrgAccess } from '@/server/auth/rbac'
import { encryptSecret, decryptSecret } from '@/lib/crypto'
import {
  forgetFraudSessions,
  testAccountLogin,
  type SteadfastFraudCredentials,
} from '@/server/courier/steadfastFraud'

/**
 * Steadfast merchant portal logins, used to read customer delivery history.
 *
 * Kept apart from courierConfigService because these are a different kind of
 * credential doing a different job: that one holds the API key pair that
 * *creates* parcels, this holds the portal logins that *read* what happened to
 * other merchants' parcels for a phone number. Merchants routinely assume one
 * implies the other; it does not, and a store can perfectly well ship without
 * screening or screen without shipping.
 *
 * Plural on purpose. The portal rate limits, locks accounts and expires
 * sessions, so a single login is a screen that will stop working on a Tuesday
 * without telling anyone. Lookups try each account in order; the health of each
 * is tracked separately, because one working account otherwise hides three dead
 * ones until the last one dies.
 */

export interface FraudAccountView {
  id: string
  email: string
  label: string | null
  isActive: boolean
  position: number
  isPrimary: boolean
  lastTestedAt: Date | null
  lastTestOk: boolean | null
  lastTestMessage: string | null
  lastUsedAt: Date | null
}

export async function listFraudAccounts(
  organizationId: string
): Promise<FraudAccountView[]> {
  await requireOrgAccess(organizationId, 'VIEWER')

  const accounts = await prisma.fraudAccount.findMany({
    where: { organizationId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  })

  return accounts.map((account, index) => ({
    id: account.id,
    email: account.email,
    label: account.label,
    isActive: account.isActive,
    position: account.position,
    // The first active account is the one that will actually answer lookups —
    // worth showing, because a merchant debugging a wrong-looking result needs
    // to know which login produced it.
    isPrimary: index === 0 && account.isActive,
    lastTestedAt: account.lastTestedAt,
    lastTestOk: account.lastTestOk,
    lastTestMessage: account.lastTestMessage,
    lastUsedAt: account.lastUsedAt,
  }))
}

/**
 * The decrypted logins, in the order lookups should try them.
 *
 * Server-side only — never returned to a page or an action. Inactive accounts
 * are skipped rather than deleted so a merchant can park a locked account and
 * bring it back without retyping the password.
 */
export async function fraudCredentialsFor(
  organizationId: string
): Promise<SteadfastFraudCredentials[]> {
  const accounts = await prisma.fraudAccount.findMany({
    where: { organizationId, isActive: true },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { email: true, password: true },
  })

  const credentials: SteadfastFraudCredentials[] = []
  for (const account of accounts) {
    try {
      credentials.push({
        email: account.email,
        password: decryptSecret(account.password),
      })
    } catch {
      // One unreadable password must not take the whole chain down — the other
      // accounts still work, and the test button will name the broken one.
      continue
    }
  }

  return credentials
}

export async function addFraudAccount(
  organizationId: string,
  input: { email: string; password: string; label?: string | null }
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const email = input.email.trim().toLowerCase()
  if (!email.includes('@')) {
    throw new Error('Enter the email address you sign in to Steadfast with')
  }
  if (!input.password.trim()) {
    throw new Error('Enter the password for that account')
  }

  const count = await prisma.fraudAccount.count({ where: { organizationId } })

  const account = await prisma.fraudAccount.upsert({
    where: { organizationId_email: { organizationId, email } },
    create: {
      organizationId,
      email,
      password: encryptSecret(input.password.trim()),
      label: input.label?.trim() || null,
      position: count,
    },
    update: {
      password: encryptSecret(input.password.trim()),
      label: input.label?.trim() || null,
      isActive: true,
      // The stored password just changed, so what we knew about this account is
      // no longer about the credentials it now holds.
      lastTestedAt: null,
      lastTestOk: null,
      lastTestMessage: null,
    },
    select: { id: true, email: true },
  })

  // A cached session belongs to the old password. Left in place, a corrected
  // account would keep failing until the session aged out.
  forgetFraudSessions()

  return account
}

export async function removeFraudAccount(
  organizationId: string,
  accountId: string
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const deleted = await prisma.fraudAccount.deleteMany({
    where: { id: accountId, organizationId },
  })
  if (deleted.count === 0) throw new Error('That account no longer exists')

  forgetFraudSessions()
}

export async function setFraudAccountActive(
  organizationId: string,
  accountId: string,
  isActive: boolean
) {
  await requireOrgAccess(organizationId, 'ADMIN')

  const updated = await prisma.fraudAccount.updateMany({
    where: { id: accountId, organizationId },
    data: { isActive },
  })
  if (updated.count === 0) throw new Error('That account no longer exists')

  forgetFraudSessions()
}

export interface FraudAccountTestResult {
  email: string
  ok: boolean
  message: string
}

/**
 * Signs in to every configured account, one at a time.
 *
 * Deliberately not "run a lookup and see if it works": the lookup path stops at
 * the first account that answers, so it can only ever tell you that at least
 * one is alive. A merchant with four accounts wants to know which of the four
 * is broken *before* the working one locks too.
 */
export async function testFraudAccounts(organizationId: string): Promise<{
  results: FraudAccountTestResult[]
  working: number
  total: number
}> {
  await requireOrgAccess(organizationId, 'ADMIN')

  const accounts = await prisma.fraudAccount.findMany({
    where: { organizationId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, email: true, password: true },
  })

  const results: FraudAccountTestResult[] = []

  for (const account of accounts) {
    let result: { ok: boolean; message: string }

    try {
      result = await testAccountLogin({
        email: account.email,
        password: decryptSecret(account.password),
      })
    } catch {
      result = {
        ok: false,
        message: 'Stored password could not be decrypted — re-add this account',
      }
    }

    await prisma.fraudAccount.update({
      where: { id: account.id },
      data: {
        lastTestedAt: new Date(),
        lastTestOk: result.ok,
        lastTestMessage: result.message.slice(0, 500),
      },
    })

    results.push({ email: account.email, ...result })
  }

  return {
    results,
    working: results.filter((result) => result.ok).length,
    total: results.length,
  }
}

/** Notes which account answered, for spotting one that tests fine but never runs. */
export async function markFraudAccountUsed(
  organizationId: string,
  email: string
): Promise<void> {
  await prisma.fraudAccount
    .updateMany({
      where: { organizationId, email },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {
      // Bookkeeping. Never worth failing a screen over.
    })
}

/** Whether screening can run at all for this organisation. */
export async function hasFraudAccounts(
  organizationId: string
): Promise<boolean> {
  const count = await prisma.fraudAccount.count({
    where: { organizationId, isActive: true },
  })
  return count > 0
}
