-- Two-way order sync for orders processed on a merchant's own website.
--
-- Additive. `syncRevision` starts at 0 on every existing order, which is what
-- both sides will agree on the first time they talk about one.

CREATE TYPE "OrderSyncKind" AS ENUM ('ORDER_UPDATED', 'ORDER_CANCELLED');

ALTER TABLE "Order" ADD COLUMN "syncRevision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "OrderForward" ADD COLUMN "syncedRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderForward" ADD COLUMN "conflictAt" TIMESTAMP(3);
ALTER TABLE "OrderForward" ADD COLUMN "conflictReason" TEXT;

CREATE TABLE "OrderSyncMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "OrderSyncKind" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "baseRevision" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OrderForwardStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "statusCode" INTEGER,
    "error" TEXT,
    "responseBody" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSyncMessage_pkey" PRIMARY KEY ("id")
);

-- The dedupe guarantee, enforced by the database rather than by a
-- check-then-insert: two servers racing on the same edit cannot both queue it.
CREATE UNIQUE INDEX "OrderSyncMessage_idempotencyKey_key" ON "OrderSyncMessage"("idempotencyKey");

CREATE INDEX "OrderSyncMessage_status_nextAttemptAt_idx" ON "OrderSyncMessage"("status", "nextAttemptAt");

CREATE INDEX "OrderSyncMessage_orderId_createdAt_idx" ON "OrderSyncMessage"("orderId", "createdAt");

CREATE INDEX "OrderSyncMessage_organizationId_status_idx" ON "OrderSyncMessage"("organizationId", "status");

ALTER TABLE "OrderSyncMessage" ADD CONSTRAINT "OrderSyncMessage_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderSyncMessage" ADD CONSTRAINT "OrderSyncMessage_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
