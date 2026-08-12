import { z } from 'zod'

/**
 * Admin-side validation for the commercial model.
 *
 * The recurring problem these schemas solve is that HTML forms only send
 * strings, and this model distinguishes three states an empty-looking field can
 * be in: unlimited (null), none allowed (0), and unchanged. `optionalQuota`
 * makes that explicit — blank means unlimited, because that is what an admin
 * leaving a limit box empty means, and typing 0 is how you forbid something.
 */

/**
 * Blank -> null (unlimited). A number -> that limit, where 0 means none.
 *
 * Absent counts as blank. A form only renders the fields that apply to the
 * current selection — a percentage box on a fixed-amount coupon would be
 * meaningless — and a field that was never rendered is missing from FormData
 * rather than empty in it. Without the `undefined` branch those two identical
 * intentions parse differently, and the form rejects itself over a box the
 * operator was never shown.
 */
export const optionalQuota = z
  .union([z.literal(''), z.coerce.number().int().min(0).max(2_000_000_000)])
  .optional()
  .transform((value) => (value === '' || value === undefined ? null : value))

/** Blank or absent -> null. Used for prices that may not be offered at all. */
export const optionalMoney = z
  .union([z.literal(''), z.coerce.number().min(0).max(100_000_000)])
  .optional()
  .transform((value) => (value === '' || value === undefined ? null : value))

export const requiredMoney = z.coerce.number().min(0).max(100_000_000)

/** An HTML checkbox sends "on" when ticked and nothing at all when not. */
export const checkbox = z
  .union([
    z.literal('on'),
    z.literal('true'),
    z.literal('false'),
    z.literal(''),
  ])
  .optional()
  .transform((value) => value === 'on' || value === 'true')

const featureAvailability = z.enum([
  'UNAVAILABLE',
  'ADDON',
  'LIMITED',
  'INCLUDED',
])

export const planFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(
      /^[A-Z0-9_]+$/,
      'Use upper-case letters, numbers and underscores (e.g. STARTER)'
    ),
  name: z.string().trim().min(2).max(60),
  tagline: z.string().trim().max(200).optional(),
  position: z.coerce.number().int().min(0).max(999).default(0),

  isActive: checkbox,
  isPublic: checkbox,
  isDefault: checkbox,
  isContactSalesOnly: checkbox,

  currencyCode: z.string().trim().length(3).toUpperCase().default('BDT'),
  monthlyPrice: requiredMoney,
  annualPrice: optionalMoney,
  trialDays: z.coerce.number().int().min(0).max(365).default(0),

  maxPages: optionalQuota,
  maxStores: optionalQuota,
  maxCustomDomains: optionalQuota,
  maxTeamMembers: optionalQuota,
  storageMb: optionalQuota,
  monthlyTrafficMb: optionalQuota,
  monthlyVisitors: optionalQuota,

  premiumTemplates: featureAvailability,
  advancedSeo: featureAvailability,
  googleAnalytics: featureAvailability,
  metaPixel: featureAvailability,
  googleTagManager: featureAvailability,
  aiContentAssistant: featureAvailability,
  advancedAnalytics: featureAvailability,
  whiteLabel: featureAvailability,
  dedicatedAccountManager: featureAvailability,
  dedicatedTechnicalSupport: featureAvailability,

  ncomSubdomain: checkbox,
  dragDropBuilder: checkbox,
  responsiveEditor: checkbox,
  basicTemplates: checkbox,
  basicSeo: checkbox,
  sslCertificate: checkbox,

  supportTier: z.enum(['COMMUNITY', 'STANDARD', 'PRIORITY', 'DEDICATED']),
  fairUseNote: z.string().trim().max(400).optional(),
  enforceTrafficCap: checkbox,
  enforceVisitorCap: checkbox,
})

export const addonFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, 'Use upper-case letters, numbers and underscores'),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),
  position: z.coerce.number().int().min(0).max(999).default(0),
  isActive: checkbox,

  currencyCode: z.string().trim().length(3).toUpperCase().default('BDT'),
  monthlyPrice: requiredMoney,
  annualPrice: optionalMoney,

  grantsCustomDomains: z.coerce.number().int().min(0).max(1000).default(0),
  grantsStorageMb: z.coerce.number().int().min(0).max(10_000_000).default(0),
  grantsTrafficMb: z.coerce.number().int().min(0).max(10_000_000).default(0),
  grantsTeamMembers: z.coerce.number().int().min(0).max(1000).default(0),
  grantsFeature: z
    .union([
      z.literal(''),
      z.enum([
        'AI_CONTENT_ASSISTANT',
        'ADVANCED_ANALYTICS',
        'PREMIUM_TEMPLATES',
        'WHITE_LABEL',
      ]),
    ])
    .transform((value) => (value === '' ? null : value)),
  maxQuantity: optionalQuota,
  availableOnAllPlans: checkbox,
  planIds: z.array(z.string()).default([]),
})

/**
 * Coupon rules.
 *
 * Cross-field checks live in `superRefine` rather than in the service, so the
 * admin form can report "a percentage coupon needs a percentage" against the
 * right field instead of failing at the database with a null constraint.
 */
export const couponFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(
        /^[A-Za-z0-9_-]+$/,
        'Letters, numbers, dashes and underscores only'
      )
      .transform((value) => value.toUpperCase()),
    name: z.string().trim().max(80).optional(),
    description: z.string().trim().max(300).optional(),
    isActive: checkbox,

    discountType: z.enum([
      'PERCENTAGE',
      'FIXED_AMOUNT',
      'FREE',
      'OVERRIDE_PRICE',
      'FREE_TRIAL_DAYS',
    ]),
    // Absent -> null, like optionalMoney: the box is only rendered for a
    // percentage coupon. superRefine below is what insists on a value when the
    // chosen type actually needs one.
    percentage: z
      .union([z.literal(''), z.coerce.number().min(0).max(100)])
      .optional()
      .transform((value) =>
        value === '' || value === undefined ? null : value
      ),
    amount: optionalMoney,
    freeTrialDays: optionalQuota,
    currencyCode: z.string().trim().length(3).toUpperCase().default('BDT'),

    duration: z.enum(['ONCE', 'REPEATING', 'FOREVER']),
    durationMonths: optionalQuota,

    appliesToAllPlans: checkbox,
    planIds: z.array(z.string()).default([]),
    appliesToAddons: checkbox,
    allowedIntervals: z.array(z.enum(['MONTHLY', 'ANNUAL'])).default([]),
    newOrganizationsOnly: checkbox,
    firstPurchaseOnly: checkbox,
    existingCustomersOnly: checkbox,
    existingBeforeAt: z.string().trim().optional(),
    minSubtotal: optionalMoney,
    minTermMonths: optionalQuota,
    requiresVerifiedEmail: checkbox,

    restrictedToOrganizationIds: z.string().trim().optional(),
    restrictedToEmails: z.string().trim().optional(),
    restrictedToEmailDomain: z.string().trim().max(120).optional(),

    maxRedemptions: optionalQuota,
    maxRedemptionsPerOrg: optionalQuota,

    startsAt: z.string().trim().optional(),
    endsAt: z.string().trim().optional(),
    isStackable: checkbox,
  })
  .superRefine((value, ctx) => {
    if (value.discountType === 'PERCENTAGE' && value.percentage === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['percentage'],
        message: 'Enter the percentage to take off',
      })
    }
    if (
      (value.discountType === 'FIXED_AMOUNT' ||
        value.discountType === 'OVERRIDE_PRICE') &&
      value.amount === null
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message: 'Enter an amount',
      })
    }
    if (value.discountType === 'FREE_TRIAL_DAYS' && !value.freeTrialDays) {
      ctx.addIssue({
        code: 'custom',
        path: ['freeTrialDays'],
        message: 'Enter the number of trial days',
      })
    }
    if (value.duration === 'REPEATING' && !value.durationMonths) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationMonths'],
        message: 'Enter how many billing periods the discount lasts',
      })
    }
    if (!value.appliesToAllPlans && value.planIds.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['planIds'],
        message: 'Pick at least one plan, or apply it to all plans',
      })
    }
    if (
      value.startsAt &&
      value.endsAt &&
      new Date(value.startsAt) > new Date(value.endsAt)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'The end date is before the start date',
      })
    }
  })

/** Per-organisation overrides an admin can set on one subscription. */
export const subscriptionAdminSchema = z.object({
  organizationId: z.string().min(1),
  planId: z.string().min(1),
  interval: z.enum(['MONTHLY', 'ANNUAL']),
  status: z.enum([
    'TRIALING',
    'ACTIVE',
    'PENDING',
    'PAST_DUE',
    'CANCELED',
    'EXPIRED',
  ]),
  currentPeriodEnd: z.string().trim().optional(),
  trialEndsAt: z.string().trim().optional(),
  overrideMaxPages: optionalQuota,
  overrideMaxStores: optionalQuota,
  overrideMaxCustomDomains: optionalQuota,
  overrideMaxTeamMembers: optionalQuota,
  overrideStorageMb: optionalQuota,
  overrideMonthlyTrafficMb: optionalQuota,
  quotaEnforcementDisabled: checkbox,
  adminNote: z.string().trim().max(1000).optional(),
})

export const smtpFormSchema = z.object({
  purpose: z.enum([
    'DEFAULT',
    'EMAIL_VERIFICATION',
    'PASSWORD_RESET',
    'TEAM_INVITATION',
    'BILLING',
    'DOMAIN_ALERT',
    'USAGE_ALERT',
    'ORDER_RECEIPT',
    'MARKETING',
    'SYSTEM_ALERT',
  ]),
  label: z.string().trim().max(80).optional(),
  isEnabled: checkbox,
  host: z.string().trim().min(3).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  encryption: z.enum(['NONE', 'STARTTLS', 'SSL_TLS']),
  username: z.string().trim().max(255),
  // Blank means "keep the stored password" — see emailService.upsertSmtpConfig.
  password: z.string().max(500).optional(),
  fromName: z.string().trim().min(1).max(80),
  fromEmail: z.email(),
  replyToEmail: z.union([z.literal(''), z.email()]).optional(),
})

export type PlanFormInput = z.infer<typeof planFormSchema>
export type AddonFormInput = z.infer<typeof addonFormSchema>
export type CouponFormInput = z.infer<typeof couponFormSchema>
export type SubscriptionAdminInput = z.infer<typeof subscriptionAdminSchema>
export type SmtpFormInput = z.infer<typeof smtpFormSchema>
