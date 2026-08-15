-- Server-side conversion tracking: Meta Conversions API and GA4 Measurement
-- Protocol.
--
-- The credentials hang off the existing StoreIntegrationConfig row rather than
-- a table of their own, because they belong to the same setup step as the pixel
-- id already there and having both in one row is what makes "server-side" one
-- extra paste instead of a second screen. Both secrets are stored encrypted by
-- the application (lib/crypto), so these columns hold ciphertext, never a
-- usable token.
--
-- TrackingDelivery is the queue and the audit trail for conversions, with the
-- unique (destination, dedupeKey) index doing the real work: it is what makes a
-- retried order submission report one purchase rather than two.

-- CreateEnum
CREATE TYPE "TrackingDestination" AS ENUM ('META_CAPI', 'GA4_MP');

-- CreateEnum
CREATE TYPE "TrackingEventName" AS ENUM ('PAGE_VIEW', 'VIEW_CONTENT', 'PURCHASE');

-- CreateEnum
CREATE TYPE "TrackingDeliveryStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "StoreIntegrationConfig" ADD COLUMN     "ga4ApiSecret" TEXT,
ADD COLUMN     "metaAccessToken" TEXT,
ADD COLUMN     "metaTestEventCode" TEXT;

-- CreateTable
CREATE TABLE "TrackingDelivery" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "destination" "TrackingDestination" NOT NULL,
    "eventName" "TrackingEventName" NOT NULL,
    "eventId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "TrackingDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "statusCode" INTEGER,
    "error" TEXT,
    "responseBody" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackingDelivery_storeId_createdAt_idx" ON "TrackingDelivery"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "TrackingDelivery_status_nextAttemptAt_idx" ON "TrackingDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingDelivery_destination_dedupeKey_key" ON "TrackingDelivery"("destination", "dedupeKey");

-- AddForeignKey
ALTER TABLE "TrackingDelivery" ADD CONSTRAINT "TrackingDelivery_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

