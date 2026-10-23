-- AI builder credits: what each plan includes, each workspace's balance and
-- its history, the packs the platform sells, and the orders for them.

-- Credits a plan includes every month, and once when a workspace starts it.
ALTER TABLE "Plan" ADD COLUMN "aiMonthlyCredits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Plan" ADD COLUMN "aiStartCredits" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "AiCreditEntryKind" AS ENUM ('USAGE', 'REFUND', 'PURCHASE', 'PLAN_START', 'ADMIN_GRANT', 'ADMIN_DEDUCT');
CREATE TYPE "AiCreditOrderStatus" AS ENUM ('AWAITING_PAYMENT', 'PAID', 'CANCELED');

CREATE TABLE "AiCreditAccount" (
    "organizationId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "monthlyPeriod" TEXT NOT NULL DEFAULT '',
    "monthlyUsed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCreditAccount_pkey" PRIMARY KEY ("organizationId")
);

CREATE TABLE "AiCreditEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "AiCreditEntryKind" NOT NULL,
    "monthlyDelta" INTEGER NOT NULL DEFAULT 0,
    "balanceDelta" INTEGER NOT NULL DEFAULT 0,
    "balanceAfter" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "orderId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCreditEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiCreditPack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'BDT',
    "priceCents" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCreditPack_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiCreditOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "packId" TEXT,
    "packName" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'BDT',
    "totalCents" INTEGER NOT NULL,
    "status" "AiCreditOrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "provider" TEXT,
    "providerReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCreditOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiCreditEntry_dedupeKey_key" ON "AiCreditEntry"("dedupeKey");
CREATE INDEX "AiCreditEntry_organizationId_createdAt_idx" ON "AiCreditEntry"("organizationId", "createdAt");
CREATE INDEX "AiCreditPack_isActive_position_idx" ON "AiCreditPack"("isActive", "position");
CREATE INDEX "AiCreditOrder_organizationId_createdAt_idx" ON "AiCreditOrder"("organizationId", "createdAt");
CREATE INDEX "AiCreditOrder_status_idx" ON "AiCreditOrder"("status");

ALTER TABLE "AiCreditAccount" ADD CONSTRAINT "AiCreditAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiCreditEntry" ADD CONSTRAINT "AiCreditEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiCreditOrder" ADD CONSTRAINT "AiCreditOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
