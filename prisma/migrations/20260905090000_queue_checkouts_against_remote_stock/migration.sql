-- Serialising checkouts that compete for stock on a merchant's own website.
--
-- NCOM's own products need none of this: `commitInventoryForOrder` takes units
-- with a conditional UPDATE inside the checkout transaction, and Postgres
-- decides who gets the last one. Stock that lives on someone else's server
-- cannot be taken that way — it is read over HTTP, decided on, and recorded,
-- and two checkouts interleaving across those three steps is how one shirt is
-- sold to two people.
--
-- Two tables. `StockLock` is a lease that makes those steps run one at a time
-- per variant. `RemoteStockHold` remembers what NCOM took, so the next read of
-- the merchant's (still unchanged) number knows to subtract it.
--
-- Both are empty for any workspace with no connected website.

CREATE TYPE "RemoteHoldState" AS ENUM ('PENDING', 'CONFIRMED');

-- A lease rather than a held transaction: holding one across a merchant's HTTP
-- call would pin a pooled connection for the length of their slowest response.
CREATE TABLE "StockLock" (
    "key" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLock_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "StockLock_expiresAt_idx" ON "StockLock"("expiresAt");

ALTER TABLE "StockLock" ADD CONSTRAINT "StockLock_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- No foreign key on variantId, and that is the point: these ids belong to the
-- merchant's catalogue, which is not in this database.
CREATE TABLE "RemoteStockHold" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productId" TEXT,
    "quantity" INTEGER NOT NULL,
    "orderRef" TEXT NOT NULL,
    "state" "RemoteHoldState" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemoteStockHold_pkey" PRIMARY KEY ("id")
);

-- One row per variant per order, so a retried checkout updates its own hold
-- rather than stacking a second one on top of it.
CREATE UNIQUE INDEX "RemoteStockHold_organizationId_orderRef_variantId_key"
    ON "RemoteStockHold"("organizationId", "orderRef", "variantId");

CREATE INDEX "RemoteStockHold_organizationId_variantId_state_idx"
    ON "RemoteStockHold"("organizationId", "variantId", "state");

ALTER TABLE "RemoteStockHold" ADD CONSTRAINT "RemoteStockHold_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
