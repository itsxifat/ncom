-- Where a placed order is processed, and the log of every handoff made under
-- that decision.
--
-- Additive only. Every existing workspace has no OrderDestination row, which
-- reads as the NCOM default, so nothing about an existing order changes.

CREATE TYPE "OrderRouting" AS ENUM ('NCOM', 'OWN_WEBSITE');

CREATE TYPE "OrderForwardStatus" AS ENUM ('PENDING', 'DELIVERED', 'REFUSED', 'FAILED');

CREATE TABLE "OrderDestination" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mode" "OrderRouting" NOT NULL DEFAULT 'NCOM',
    "endpointUrl" TEXT,
    "keyId" TEXT,
    "secret" TEXT,
    "timeoutMs" INTEGER NOT NULL DEFAULT 15000,
    "handoffInline" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "lastOkAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderDestination_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderDestination_organizationId_key" ON "OrderDestination"("organizationId");

ALTER TABLE "OrderDestination" ADD CONSTRAINT "OrderDestination_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OrderForward" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderForwardStatus" NOT NULL DEFAULT 'PENDING',
    "endpointUrl" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "remoteOrderId" TEXT,
    "remoteOrderNumber" TEXT,
    "statusCode" INTEGER,
    "error" TEXT,
    "responseBody" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderForward_pkey" PRIMARY KEY ("id")
);

-- One handoff per order. This unique index is the guarantee that a retried
-- checkout, a replayed cart or two servers racing cannot queue the same order
-- twice — it is enforced here rather than by a check-then-insert in the service.
CREATE UNIQUE INDEX "OrderForward_orderId_key" ON "OrderForward"("orderId");

CREATE INDEX "OrderForward_status_nextAttemptAt_idx" ON "OrderForward"("status", "nextAttemptAt");

CREATE INDEX "OrderForward_organizationId_status_idx" ON "OrderForward"("organizationId", "status");

ALTER TABLE "OrderForward" ADD CONSTRAINT "OrderForward_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderForward" ADD CONSTRAINT "OrderForward_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
