-- CreateEnum
CREATE TYPE "OrderWorkflowState" AS ENUM ('PENDING', 'FRAUD_REVIEW', 'PROCESSING', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "FraudVerdict" AS ENUM ('PASS', 'REVIEW', 'FAIL', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "CourierProvider" AS ENUM ('STEADFAST', 'PATHAO');

-- CreateEnum
CREATE TYPE "CourierShipmentStatus" AS ENUM ('PENDING', 'SUBMITTED', 'PICKUP_PENDING', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PARTIALLY_DELIVERED', 'ON_HOLD', 'RETURN_IN_TRANSIT', 'RETURNED', 'CANCELLED', 'DELIVERY_FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CourierEventSource" AS ENUM ('WEBHOOK', 'POLL', 'SYSTEM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WebhookTopic" ADD VALUE 'ORDER_HELD_FOR_REVIEW';
ALTER TYPE "WebhookTopic" ADD VALUE 'SHIPMENT_CREATED';
ALTER TYPE "WebhookTopic" ADD VALUE 'SHIPMENT_UPDATED';
ALTER TYPE "WebhookTopic" ADD VALUE 'SHIPMENT_DELIVERED';
ALTER TYPE "WebhookTopic" ADD VALUE 'SHIPMENT_RETURNED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "fraudCancelled" INTEGER,
ADD COLUMN     "fraudCheckedAt" TIMESTAMP(3),
ADD COLUMN     "fraudDelivered" INTEGER,
ADD COLUMN     "fraudReason" TEXT,
ADD COLUMN     "fraudReports" INTEGER,
ADD COLUMN     "fraudSuccessRateBps" INTEGER,
ADD COLUMN     "fraudVerdict" "FraudVerdict",
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUserId" TEXT,
ADD COLUMN     "workflowState" "OrderWorkflowState" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "workflowUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "CourierConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "CourierProvider" NOT NULL,
    "displayName" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "credentials" JSONB,
    "settings" JSONB,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "webhookToken" TEXT NOT NULL,
    "webhookSecret" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "autoDispatchEnabled" BOOLEAN NOT NULL DEFAULT false,
    "fraudCheckEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minDeliveryRateBps" INTEGER NOT NULL DEFAULT 7000,
    "minDeliveredOrders" INTEGER NOT NULL DEFAULT 3,
    "maxFraudReports" INTEGER NOT NULL DEFAULT 0,
    "maxCancelledOrders" INTEGER,
    "allowUnknownCustomers" BOOLEAN NOT NULL DEFAULT true,
    "manualReviewAboveCents" INTEGER,
    "dispatchDelayMinutes" INTEGER NOT NULL DEFAULT 0,
    "requirePaidOrders" BOOLEAN NOT NULL DEFAULT false,
    "fraudCacheHours" INTEGER NOT NULL DEFAULT 24,
    "autoCancelOnFail" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourierSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierShipment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "courierConfigId" TEXT,
    "provider" "CourierProvider" NOT NULL,
    "consignmentId" TEXT,
    "trackingCode" TEXT,
    "merchantOrderId" TEXT NOT NULL,
    "status" "CourierShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "rawStatus" TEXT,
    "statusMessage" TEXT,
    "codAmountCents" INTEGER NOT NULL,
    "collectedAmountCents" INTEGER,
    "deliveryFeeCents" INTEGER,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "lastPolledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierShipmentEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "CourierShipmentStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "source" "CourierEventSource" NOT NULL DEFAULT 'WEBHOOK',
    "rawEvent" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourierShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierFraudCheck" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "provider" "CourierProvider" NOT NULL DEFAULT 'STEADFAST',
    "totalOrders" INTEGER NOT NULL,
    "delivered" INTEGER NOT NULL,
    "cancelled" INTEGER NOT NULL,
    "frauds" INTEGER NOT NULL,
    "successRateBps" INTEGER NOT NULL,
    "raw" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourierFraudCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourierConfig_webhookToken_key" ON "CourierConfig"("webhookToken");

-- CreateIndex
CREATE INDEX "CourierConfig_organizationId_idx" ON "CourierConfig"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CourierConfig_organizationId_provider_key" ON "CourierConfig"("organizationId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "CourierSettings_organizationId_key" ON "CourierSettings"("organizationId");

-- CreateIndex
CREATE INDEX "CourierShipment_organizationId_status_idx" ON "CourierShipment"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CourierShipment_orderId_idx" ON "CourierShipment"("orderId");

-- CreateIndex
CREATE INDEX "CourierShipment_trackingCode_idx" ON "CourierShipment"("trackingCode");

-- CreateIndex
CREATE INDEX "CourierShipment_status_nextAttemptAt_idx" ON "CourierShipment"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "CourierShipment_status_lastPolledAt_idx" ON "CourierShipment"("status", "lastPolledAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourierShipment_provider_consignmentId_key" ON "CourierShipment"("provider", "consignmentId");

-- CreateIndex
CREATE INDEX "CourierShipmentEvent_shipmentId_occurredAt_idx" ON "CourierShipmentEvent"("shipmentId", "occurredAt");

-- CreateIndex
CREATE INDEX "CourierFraudCheck_organizationId_checkedAt_idx" ON "CourierFraudCheck"("organizationId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourierFraudCheck_organizationId_phone_key" ON "CourierFraudCheck"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "Order_organizationId_workflowState_createdAt_idx" ON "Order"("organizationId", "workflowState", "createdAt");

-- AddForeignKey
ALTER TABLE "CourierConfig" ADD CONSTRAINT "CourierConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettings" ADD CONSTRAINT "CourierSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierShipment" ADD CONSTRAINT "CourierShipment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierShipment" ADD CONSTRAINT "CourierShipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierShipment" ADD CONSTRAINT "CourierShipment_courierConfigId_fkey" FOREIGN KEY ("courierConfigId") REFERENCES "CourierConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierShipmentEvent" ADD CONSTRAINT "CourierShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "CourierShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierFraudCheck" ADD CONSTRAINT "CourierFraudCheck_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: orders placed before courier automation existed have a real
-- outcome already, and leaving every one of them at the PENDING default would
-- fill the review queue with history the merchant settled months ago. The
-- courier pipeline is reconstructed from what is known: cancellations are
-- cancellations, fully fulfilled is as delivered as this system can say, and a
-- part-shipped order is in flight. Everything else stays PENDING, which is
-- inert — nothing auto-dispatches out of PENDING, only out of PROCESSING,
-- which is reached solely by screening or an explicit human approval.
UPDATE "Order"
SET "workflowState" = CASE
  WHEN "cancelledAt" IS NOT NULL THEN 'CANCELLED'::"OrderWorkflowState"
  WHEN "fulfillmentStatus" = 'FULFILLED' THEN 'DELIVERED'::"OrderWorkflowState"
  WHEN "fulfillmentStatus" = 'PARTIALLY_FULFILLED' THEN 'DISPATCHED'::"OrderWorkflowState"
  ELSE 'PENDING'::"OrderWorkflowState"
END,
"workflowUpdatedAt" = "updatedAt";
