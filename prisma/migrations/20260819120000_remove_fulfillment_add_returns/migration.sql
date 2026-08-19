-- Retires fulfilment as a concept, and gives returns a home of their own.
--
-- Fulfilment was a merchant pressing a button to say goods had left. In a
-- cash-on-delivery market they have not left until a courier physically takes
-- them, and that moment already arrives as a courier event — so the button was
-- asking someone to re-assert something the system already knew, and the two
-- could disagree. Stock movement now hangs off the courier lifecycle and the
-- order's own workflow state answers "where is this".
--
-- Returns move the other way. They were being recorded as refunds, which in
-- this market is usually a lie: a parcel refused at the door involves no money
-- at all. They get their own tables so the ledger stops reporting refunds that
-- never happened.

-- ── Store: the one stock pool it sells from ────────────────────────────────
ALTER TABLE "Store" ADD COLUMN "inventoryLocationId" TEXT;

ALTER TABLE "Store"
  ADD CONSTRAINT "Store_inventoryLocationId_fkey"
  FOREIGN KEY ("inventoryLocationId") REFERENCES "Location"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Order: stock timestamps and return totals ──────────────────────────────
ALTER TABLE "Order" ADD COLUMN "stockConsumedAt"      TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "stockRestoredAt"      TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "returnedAmountCents"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "deliveryChargeWaived" BOOLEAN NOT NULL DEFAULT false;

-- Backfill before the old columns go. An order that already shipped must not
-- look un-shipped afterwards, or the next courier event would decrement its
-- stock a second time and a return would restock goods that were never taken.
UPDATE "Order" o
SET "stockConsumedAt" = COALESCE(f."shippedAt", f."createdAt")
FROM "Fulfillment" f
WHERE f."orderId" = o.id
  AND o."stockConsumedAt" IS NULL;

-- Orders whose stock was already put back keep that fact, for the same reason.
UPDATE "Order"
SET "stockRestoredAt" = COALESCE("cancelledAt", "updatedAt")
WHERE "fulfillmentStatus" = 'RESTOCKED'
  AND "stockRestoredAt" IS NULL;

-- ── OrderLine: returned units replace fulfilled ones ───────────────────────
ALTER TABLE "OrderLine" ADD COLUMN "returnedQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderLine" DROP COLUMN "fulfilledQuantity";

-- ── Drop fulfilment ────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "Order_organizationId_fulfillmentStatus_idx";
ALTER TABLE "Order" DROP COLUMN "fulfillmentStatus";

DROP TABLE IF EXISTS "FulfillmentLine";
DROP TABLE IF EXISTS "Fulfillment";

DROP TYPE IF EXISTS "FulfillmentState";
DROP TYPE IF EXISTS "FulfillmentStatus";

-- ── Returns ────────────────────────────────────────────────────────────────
CREATE TABLE "OrderReturn" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "refundAmountCents" INTEGER NOT NULL DEFAULT 0,
    "deliveryChargeWaived" BOOLEAN NOT NULL DEFAULT false,
    "restocked" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderReturnLine" (
    "id" TEXT NOT NULL,
    "orderReturnId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "OrderReturnLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderReturn_orderId_idx" ON "OrderReturn"("orderId");
CREATE INDEX "OrderReturnLine_orderReturnId_idx" ON "OrderReturnLine"("orderReturnId");

ALTER TABLE "OrderReturn"
  ADD CONSTRAINT "OrderReturn_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderReturnLine"
  ADD CONSTRAINT "OrderReturnLine_orderReturnId_fkey"
  FOREIGN KEY ("orderReturnId") REFERENCES "OrderReturn"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderReturnLine"
  ADD CONSTRAINT "OrderReturnLine_orderLineId_fkey"
  FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
