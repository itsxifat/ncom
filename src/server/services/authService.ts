import 'server-only'
import bcrypt from 'bcryptjs'
import { prisma } from '@/server/db/client'
import type { Prisma } from '@/generated/prisma/client'
import { slugify, withRandomSuffix } from '@/lib/slug'
import { BCRYPT_COST } from '@/lib/security'
import type { RegisterInput } from '@/lib/validation/auth'

export class EmailAlreadyInUseError extends Error {
  constructor() {
    super('An account with this email already exists')
    this.name = 'EmailAlreadyInUseError'
  }
}

/**
 * The row that records the administrator seat having been claimed.
 *
 * Its existence — not the presence of an admin *user* — is what closes the
 * bootstrap permanently. See `claimFirstAdmin`.
 */
export const ADMIN_BOOTSTRAP_KEY = 'platform.adminBootstrapClaimed'

/**
 * Grants the first account to register the SUPER_ADMIN role.
 *
 * There is no seeded administrator, so a fresh install has to be able to produce
 * one. That is a genuinely dangerous thing to build — it is a code path whose
 * whole job is to hand out total control of the platform — so it is guarded three
 * ways and every guard exists for a specific attack:
 *
 *  1. **No admin may already exist.** Counted across all users including
 *     suspended ones, so suspending or demoting the administrator does not turn
 *     the bootstrap back on.
 *
 *  2. **A one-shot latch, claimed atomically.** `INSERT ... ON CONFLICT DO
 *     NOTHING` against a primary key is decided by Postgres, not by this code:
 *     two registrations arriving in the same millisecond both see zero admins in
 *     step 1, both attempt the insert, the second blocks until the first commits
 *     and then affects zero rows. Exactly one can win, always.
 *
 *     This latch is also why step 1 is not sufficient on its own. Without it the
 *     rule "first user becomes admin" silently re-arms whenever the admin count
 *     returns to zero — so anyone who could get the administrator deleted, or who
 *     reached a restored-but-unclaimed database first, could register and own the
 *     platform. The latch row is never deleted by application code, and
 *     `adminService` refuses to let the raw settings editor remove it.
 *
 *  3. **An optional expected email.** With `ADMIN_BOOTSTRAP_EMAIL` set, only
 *     that address can claim the seat. This closes the one window the design
 *     cannot avoid otherwise: between deploying a fresh instance and the owner
 *     registering, whoever signs up first would otherwise become administrator.
 *     Set it on any deployment reachable from the internet.
 *
 * Runs inside the caller's transaction, so a registration that rolls back does
 * not burn the latch.
 *
 * Returns whether the role was granted; callers treat `false` as "normal user",
 * never as an error, because on any established platform false is the expected
 * answer for every signup.
 */
export async function claimFirstAdmin(
  tx: Prisma.TransactionClient,
  input: { userId: string; email: string }
): Promise<boolean> {
  const expectedEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase()
  if (expectedEmail && expectedEmail !== input.email.trim().toLowerCase()) {
    return false
  }

  const existingAdmins = await tx.user.count({
    where: { platformRole: 'SUPER_ADMIN' },
  })
  if (existingAdmins > 0) return false

  // Raw SQL because Prisma has no way to express "insert only if absent, and
  // tell me whether you did" — `upsert` would succeed for both racers, and
  // `create` inside a try/catch depends on catching a specific error code to
  // stay correct under concurrency.
  const claimedRows = await tx.$executeRaw`
    INSERT INTO "PlatformSetting" ("key", "value", "updatedAt")
    VALUES (
      ${ADMIN_BOOTSTRAP_KEY},
      ${JSON.stringify({ claimedAt: new Date().toISOString(), userId: input.userId })}::jsonb,
      NOW()
    )
    ON CONFLICT ("key") DO NOTHING
  `
  if (claimedRows === 0) return false

  await tx.user.update({
    where: { id: input.userId },
    data: { platformRole: 'SUPER_ADMIN' },
  })

  // Recorded as its own audit entry: the platform gaining an administrator is the
  // single most security-relevant event in its history, and it happens exactly
  // once.
  await tx.auditLog.create({
    data: {
      actorUserId: input.userId,
      action: 'platform.admin.bootstrapped',
      entityType: 'User',
      entityId: input.userId,
      metadata: { email: input.email, restrictedByEnv: Boolean(expectedEmail) },
    },
  })

  return true
}

/**
 * Takes the transaction client so the uniqueness check reads the same snapshot
 * as the insert that follows it. Checking on `prisma` while inserting on `tx`
 * would miss a slug created earlier in the same transaction.
 */
async function uniqueOrgSlug(
  base: string,
  tx: Prisma.TransactionClient = prisma
): Promise<string> {
  const baseSlug = slugify(base) || 'workspace'

  const existing = await tx.organization.findUnique({
    where: { slug: baseSlug },
    select: { id: true },
  })
  if (!existing) return baseSlug

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = withRandomSuffix(baseSlug)
    const collision = await tx.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!collision) return candidate
  }

  throw new Error('Could not generate a unique organization slug')
}

/**
 * Gives a user their own workspace: an Organization, an OWNER Membership, and a
 * Subscription on the default plan.
 *
 * Shared by both signup paths. Credentials signups come through `registerUser`
 * below; Google signups are created by the Auth.js Prisma adapter, which knows
 * nothing about organisations — without this running from the `createUser`
 * event, an OAuth user would land on a dashboard with no workspace and
 * `getActiveOrganization` would bounce them straight back to /login.
 *
 * The subscription is created here rather than left to `ensureSubscription` so a
 * new tenant is visible in /admin/subscriptions immediately, instead of only
 * after someone loads their dashboard.
 */
export async function provisionPersonalWorkspace(
  tx: Prisma.TransactionClient,
  input: { userId: string; displayName: string }
): Promise<{ organizationId: string }> {
  const organization = await tx.organization.create({
    data: {
      name: `${input.displayName}'s Workspace`,
      slug: await uniqueOrgSlug(input.displayName, tx),
    },
  })

  await tx.membership.create({
    data: {
      userId: input.userId,
      organizationId: organization.id,
      role: 'OWNER',
    },
  })

  const defaultPlan = await tx.plan.findFirst({
    where: { isDefault: true, isActive: true },
    orderBy: { position: 'asc' },
  })

  // No plans seeded yet is a valid state for a fresh install: entitlements fall
  // back to locked-down until an admin creates one, rather than signup failing.
  if (defaultPlan) {
    await tx.subscription.create({
      data: {
        organizationId: organization.id,
        planId: defaultPlan.id,
        status: defaultPlan.trialDays > 0 ? 'TRIALING' : 'ACTIVE',
        interval: 'MONTHLY',
        currencyCode: defaultPlan.currencyCode,
        unitPriceCents: defaultPlan.monthlyPriceCents,
        trialEndsAt:
          defaultPlan.trialDays > 0
            ? new Date(Date.now() + defaultPlan.trialDays * 24 * 60 * 60 * 1000)
            : null,
      },
    })
  }

  return { organizationId: organization.id }
}

/**
 * Creates a User and their workspace in one transaction. Does not sign the user
 * in and does not mark the address verified — callers do both separately, and
 * the OTP flow depends on `emailVerified` still being null here.
 */
export async function registerUser({
  name,
  email,
  password,
  purpose,
}: RegisterInput) {
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  })
  if (existingUser) {
    throw new EmailAlreadyInUseError()
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST)

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email, passwordHash, signupPurpose: purpose ?? null },
    })

    await provisionPersonalWorkspace(tx, { userId: user.id, displayName: name })

    // Inside the same transaction as the account: the latch must not be spent by
    // a registration that then fails to commit.
    const isFirstAdmin = await claimFirstAdmin(tx, { userId: user.id, email })

    return { ...user, isFirstAdmin }
  })
}
