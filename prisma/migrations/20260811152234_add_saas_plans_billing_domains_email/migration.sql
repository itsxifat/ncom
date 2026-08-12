/*
  Warnings:

  - You are about to drop the column `customDomain` on the `Store` table. All the data in the column will be lost.
  - You are about to drop the column `customDomainStatus` on the `Store` table. All the data in the column will be lost.
  - You are about to drop the column `customDomainVerifiedAt` on the `Store` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "FeatureAvailability" AS ENUM ('UNAVAILABLE', 'ADDON', 'LIMITED', 'INCLUDED');

-- CreateEnum
CREATE TYPE "SupportTier" AS ENUM ('COMMUNITY', 'STANDARD', 'PRIORITY', 'DEDICATED');

-- CreateEnum
CREATE TYPE "AddonFeature" AS ENUM ('AI_CONTENT_ASSISTANT', 'ADVANCED_ANALYTICS', 'PREMIUM_TEMPLATES', 'WHITE_LABEL');

-- CreateEnum
CREATE TYPE "SubscriptionInterval" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PENDING', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlanOrderStatus" AS ENUM ('AWAITING_PAYMENT', 'AUTO_ACTIVATED', 'PAID', 'ACTIVATED', 'CANCELED', 'FAILED');

-- CreateEnum
CREATE TYPE "PlanDiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE', 'OVERRIDE_PRICE', 'FREE_TRIAL_DAYS');

-- CreateEnum
CREATE TYPE "CouponDuration" AS ENUM ('ONCE', 'REPEATING', 'FOREVER');

-- CreateEnum
CREATE TYPE "UsageMetric" AS ENUM ('STORAGE_BYTES', 'TRAFFIC_BYTES', 'VISITORS', 'PAGE_VIEWS', 'AI_GENERATIONS');

-- CreateEnum
CREATE TYPE "DomainRecordType" AS ENUM ('CNAME', 'A');

-- CreateEnum
CREATE TYPE "EmailPurpose" AS ENUM ('DEFAULT', 'EMAIL_VERIFICATION', 'PASSWORD_RESET', 'TEAM_INVITATION', 'BILLING', 'DOMAIN_ALERT', 'USAGE_ALERT', 'ORDER_RECEIPT', 'MARKETING', 'SYSTEM_ALERT');

-- CreateEnum
CREATE TYPE "SmtpEncryption" AS ENUM ('NONE', 'STARTTLS', 'SSL_TLS');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'LOGIN_CHALLENGE');

-- DropIndex
DROP INDEX "Store_customDomain_key";

-- AlterTable
ALTER TABLE "Store" DROP COLUMN "customDomain",
DROP COLUMN "customDomainStatus",
DROP COLUMN "customDomainVerifiedAt";

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "isPremium" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isContactSalesOnly" BOOLEAN NOT NULL DEFAULT false,
    "currencyCode" TEXT NOT NULL DEFAULT 'BDT',
    "monthlyPriceCents" INTEGER NOT NULL DEFAULT 0,
    "annualPriceCents" INTEGER,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "maxPages" INTEGER,
    "maxStores" INTEGER,
    "maxCustomDomains" INTEGER DEFAULT 0,
    "maxTeamMembers" INTEGER DEFAULT 1,
    "storageMb" INTEGER,
    "monthlyTrafficMb" INTEGER,
    "monthlyVisitors" INTEGER,
    "premiumTemplates" "FeatureAvailability" NOT NULL DEFAULT 'UNAVAILABLE',
    "advancedSeo" "FeatureAvailability" NOT NULL DEFAULT 'UNAVAILABLE',
    "googleAnalytics" "FeatureAvailability" NOT NULL DEFAULT 'UNAVAILABLE',
    "metaPixel" "FeatureAvailability" NOT NULL DEFAULT 'UNAVAILABLE',
    "googleTagManager" "FeatureAvailability" NOT NULL DEFAULT 'UNAVAILABLE',
    "aiContentAssistant" "FeatureAvailability" NOT NULL DEFAULT 'UNAVAILABLE',
    "advancedAnalytics" "FeatureAvailability" NOT NULL DEFAULT 'UNAVAILABLE',
    "whiteLabel" "FeatureAvailability" NOT NULL DEFAULT 'UNAVAILABLE',
    "dedicatedAccountManager" "FeatureAvailability" NOT NULL DEFAULT 'UNAVAILABLE',
    "dedicatedTechnicalSupport" "FeatureAvailability" NOT NULL DEFAULT 'UNAVAILABLE',
    "ncomSubdomain" BOOLEAN NOT NULL DEFAULT true,
    "dragDropBuilder" BOOLEAN NOT NULL DEFAULT true,
    "responsiveEditor" BOOLEAN NOT NULL DEFAULT true,
    "basicTemplates" BOOLEAN NOT NULL DEFAULT true,
    "basicSeo" BOOLEAN NOT NULL DEFAULT true,
    "sslCertificate" BOOLEAN NOT NULL DEFAULT true,
    "supportTier" "SupportTier" NOT NULL DEFAULT 'COMMUNITY',
    "fairUseNote" TEXT,
    "enforceTrafficCap" BOOLEAN NOT NULL DEFAULT true,
    "enforceVisitorCap" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Addon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currencyCode" TEXT NOT NULL DEFAULT 'BDT',
    "monthlyPriceCents" INTEGER NOT NULL DEFAULT 0,
    "annualPriceCents" INTEGER,
    "grantsCustomDomains" INTEGER NOT NULL DEFAULT 0,
    "grantsStorageMb" INTEGER NOT NULL DEFAULT 0,
    "grantsTrafficMb" INTEGER NOT NULL DEFAULT 0,
    "grantsTeamMembers" INTEGER NOT NULL DEFAULT 0,
    "grantsFeature" "AddonFeature",
    "maxQuantity" INTEGER,
    "availableOnAllPlans" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Addon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddonPlan" (
    "addonId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,

    CONSTRAINT "AddonPlan_pkey" PRIMARY KEY ("addonId","planId")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "interval" "SubscriptionInterval" NOT NULL DEFAULT 'MONTHLY',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "currencyCode" TEXT NOT NULL DEFAULT 'BDT',
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "couponId" TEXT,
    "couponAppliedAt" TIMESTAMP(3),
    "couponPeriodsRemaining" INTEGER,
    "overrideMaxPages" INTEGER,
    "overrideMaxStores" INTEGER,
    "overrideMaxCustomDomains" INTEGER,
    "overrideMaxTeamMembers" INTEGER,
    "overrideStorageMb" INTEGER,
    "overrideMonthlyTrafficMb" INTEGER,
    "quotaEnforcementDisabled" BOOLEAN NOT NULL DEFAULT false,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionAddon" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "addonId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionAddon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "planId" TEXT NOT NULL,
    "interval" "SubscriptionInterval" NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'BDT',
    "subtotalCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "couponId" TEXT,
    "couponCode" TEXT,
    "status" "PlanOrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "lineItems" JSONB NOT NULL,
    "provider" TEXT,
    "providerReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanCoupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "discountType" "PlanDiscountType" NOT NULL,
    "percentageBps" INTEGER,
    "amountCents" INTEGER,
    "freeTrialDays" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT 'BDT',
    "duration" "CouponDuration" NOT NULL DEFAULT 'FOREVER',
    "durationMonths" INTEGER,
    "appliesToAllPlans" BOOLEAN NOT NULL DEFAULT true,
    "appliesToAddons" BOOLEAN NOT NULL DEFAULT false,
    "allowedIntervals" "SubscriptionInterval"[] DEFAULT ARRAY[]::"SubscriptionInterval"[],
    "newOrganizationsOnly" BOOLEAN NOT NULL DEFAULT false,
    "firstPurchaseOnly" BOOLEAN NOT NULL DEFAULT false,
    "existingCustomersOnly" BOOLEAN NOT NULL DEFAULT false,
    "existingBeforeAt" TIMESTAMP(3),
    "minSubtotalCents" INTEGER,
    "minTermMonths" INTEGER,
    "requiresVerifiedEmail" BOOLEAN NOT NULL DEFAULT false,
    "restrictedToOrganizationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "restrictedToEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "restrictedToEmailDomain" TEXT,
    "maxRedemptions" INTEGER,
    "maxRedemptionsPerOrg" INTEGER DEFAULT 1,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isStackable" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanCouponPlan" (
    "couponId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,

    CONSTRAINT "PlanCouponPlan_pkey" PRIMARY KEY ("couponId","planId")
);

-- CreateTable
CREATE TABLE "PlanCouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "planOrderId" TEXT,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanCouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageCounter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "metric" "UsageMetric" NOT NULL,
    "period" TEXT NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomDomain" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" "DomainStatus" NOT NULL DEFAULT 'PENDING',
    "recordType" "DomainRecordType" NOT NULL DEFAULT 'CNAME',
    "verificationToken" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSmtpConfig" (
    "id" TEXT NOT NULL,
    "purpose" "EmailPurpose" NOT NULL,
    "label" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 587,
    "encryption" "SmtpEncryption" NOT NULL DEFAULT 'STARTTLS',
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT,
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "replyToEmail" TEXT,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSmtpConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "purpose" "EmailPurpose" NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "error" TEXT,
    "smtpHost" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL DEFAULT 'EMAIL_VERIFICATION',
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE INDEX "Plan_isActive_position_idx" ON "Plan"("isActive", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Addon_code_key" ON "Addon"("code");

-- CreateIndex
CREATE INDEX "Addon_isActive_position_idx" ON "Addon"("isActive", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "Subscription"("organizationId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- CreateIndex
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionAddon_subscriptionId_addonId_key" ON "SubscriptionAddon"("subscriptionId", "addonId");

-- CreateIndex
CREATE INDEX "PlanOrder_organizationId_createdAt_idx" ON "PlanOrder"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PlanOrder_status_idx" ON "PlanOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PlanCoupon_code_key" ON "PlanCoupon"("code");

-- CreateIndex
CREATE INDEX "PlanCoupon_isActive_endsAt_idx" ON "PlanCoupon"("isActive", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlanCouponRedemption_planOrderId_key" ON "PlanCouponRedemption"("planOrderId");

-- CreateIndex
CREATE INDEX "PlanCouponRedemption_couponId_organizationId_idx" ON "PlanCouponRedemption"("couponId", "organizationId");

-- CreateIndex
CREATE INDEX "UsageCounter_metric_period_idx" ON "UsageCounter"("metric", "period");

-- CreateIndex
CREATE UNIQUE INDEX "UsageCounter_organizationId_metric_period_key" ON "UsageCounter"("organizationId", "metric", "period");

-- CreateIndex
CREATE UNIQUE INDEX "CustomDomain_hostname_key" ON "CustomDomain"("hostname");

-- CreateIndex
CREATE INDEX "CustomDomain_organizationId_idx" ON "CustomDomain"("organizationId");

-- CreateIndex
CREATE INDEX "CustomDomain_storeId_idx" ON "CustomDomain"("storeId");

-- CreateIndex
CREATE INDEX "CustomDomain_status_idx" ON "CustomDomain"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSmtpConfig_purpose_key" ON "EmailSmtpConfig"("purpose");

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_toEmail_idx" ON "EmailLog"("toEmail");

-- CreateIndex
CREATE INDEX "EmailLog_purpose_status_idx" ON "EmailLog"("purpose", "status");

-- CreateIndex
CREATE INDEX "EmailVerificationCode_email_purpose_idx" ON "EmailVerificationCode"("email", "purpose");

-- CreateIndex
CREATE INDEX "EmailVerificationCode_expiresAt_idx" ON "EmailVerificationCode"("expiresAt");

-- AddForeignKey
ALTER TABLE "AddonPlan" ADD CONSTRAINT "AddonPlan_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "Addon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddonPlan" ADD CONSTRAINT "AddonPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "PlanCoupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionAddon" ADD CONSTRAINT "SubscriptionAddon_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionAddon" ADD CONSTRAINT "SubscriptionAddon_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "Addon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOrder" ADD CONSTRAINT "PlanOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOrder" ADD CONSTRAINT "PlanOrder_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOrder" ADD CONSTRAINT "PlanOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOrder" ADD CONSTRAINT "PlanOrder_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "PlanCoupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanCoupon" ADD CONSTRAINT "PlanCoupon_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanCouponPlan" ADD CONSTRAINT "PlanCouponPlan_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "PlanCoupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanCouponPlan" ADD CONSTRAINT "PlanCouponPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanCouponRedemption" ADD CONSTRAINT "PlanCouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "PlanCoupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanCouponRedemption" ADD CONSTRAINT "PlanCouponRedemption_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanCouponRedemption" ADD CONSTRAINT "PlanCouponRedemption_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanCouponRedemption" ADD CONSTRAINT "PlanCouponRedemption_planOrderId_fkey" FOREIGN KEY ("planOrderId") REFERENCES "PlanOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageCounter" ADD CONSTRAINT "UsageCounter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomDomain" ADD CONSTRAINT "CustomDomain_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomDomain" ADD CONSTRAINT "CustomDomain_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationCode" ADD CONSTRAINT "EmailVerificationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
