-- Offers stop being a property of one landing page.
--
-- An offer is now owned by the workspace and scoped to a page, a store, or the
-- whole workspace. Existing rows are all page offers, so they are backfilled as
-- PAGE with the organisation and store read back through the page they hang off.

CREATE TYPE "OfferScope" AS ENUM ('PAGE', 'STORE', 'ORGANIZATION');
CREATE TYPE "OfferTierMode" AS ENUM ('EXACT', 'THRESHOLD');
CREATE TYPE "OfferTierReward" AS ENUM ('PRICE', 'PERCENT');

ALTER TYPE "DiscountScope" ADD VALUE IF NOT EXISTS 'VARIANTS';

-- ── Offer ────────────────────────────────────────────────────────────────

ALTER TABLE "Offer" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Offer" ADD COLUMN "storeId" TEXT;
ALTER TABLE "Offer" ADD COLUMN "scope" "OfferScope" NOT NULL DEFAULT 'PAGE';
ALTER TABLE "Offer" ADD COLUMN "tierMode" "OfferTierMode" NOT NULL DEFAULT 'EXACT';
ALTER TABLE "Offer" ADD COLUMN "startsAt" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN "endsAt" TIMESTAMP(3);
ALTER TABLE "Offer" ADD COLUMN "giftVariantId" TEXT;
ALTER TABLE "Offer" ADD COLUMN "giftQuantity" INTEGER NOT NULL DEFAULT 1;

UPDATE "Offer" o
SET "organizationId" = s."organizationId",
    "storeId"        = s."id"
FROM "Page" p
JOIN "Store" s ON s."id" = p."storeId"
WHERE p."id" = o."pageId";

-- An offer whose page vanished mid-migration has nothing to belong to and
-- nothing to sell; there is no organisation to file it under.
DELETE FROM "Offer" WHERE "organizationId" IS NULL;

ALTER TABLE "Offer" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Offer" ALTER COLUMN "pageId" DROP NOT NULL;

-- The key was unique per page and is now unique per workspace, so two pages
-- that both used "buy-1" have to be told apart. Suffix the later ones rather
-- than dropping either: the key is what an order records, and the older row is
-- the one more likely to be named in a live ad.
WITH ranked AS (
  SELECT "id",
         "key",
         ROW_NUMBER() OVER (
           PARTITION BY "organizationId", "key" ORDER BY "createdAt", "id"
         ) AS position
  FROM "Offer"
)
UPDATE "Offer" o
SET "key" = ranked."key" || '-' || ranked.position
FROM ranked
WHERE ranked."id" = o."id" AND ranked.position > 1;

DROP INDEX IF EXISTS "Offer_pageId_key_key";
CREATE UNIQUE INDEX "Offer_organizationId_key_key" ON "Offer"("organizationId", "key");
CREATE INDEX "Offer_organizationId_scope_idx" ON "Offer"("organizationId", "scope");
CREATE INDEX "Offer_storeId_position_idx" ON "Offer"("storeId", "position");

ALTER TABLE "Offer"
  ADD CONSTRAINT "Offer_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Offer"
  ADD CONSTRAINT "Offer_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Offer"
  ADD CONSTRAINT "Offer_giftVariantId_fkey"
  FOREIGN KEY ("giftVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Per-size rules ───────────────────────────────────────────────────────

ALTER TABLE "OfferItem" ADD COLUMN "variantIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "OfferVariantRule" (
  "id"          TEXT NOT NULL,
  "offerId"     TEXT NOT NULL,
  "variantId"   TEXT NOT NULL,
  "excluded"    BOOLEAN NOT NULL DEFAULT false,
  "pricingMode" "OfferPricingMode",
  "priceCents"  INTEGER NOT NULL DEFAULT 0,
  "discountBps" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "OfferVariantRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfferVariantRule_offerId_variantId_key" ON "OfferVariantRule"("offerId", "variantId");
CREATE INDEX "OfferVariantRule_offerId_idx" ON "OfferVariantRule"("offerId");
CREATE INDEX "OfferVariantRule_variantId_idx" ON "OfferVariantRule"("variantId");

ALTER TABLE "OfferVariantRule"
  ADD CONSTRAINT "OfferVariantRule_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfferVariantRule"
  ADD CONSTRAINT "OfferVariantRule_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Ladders can now be percentages ───────────────────────────────────────

ALTER TABLE "OfferTier" ADD COLUMN "reward" "OfferTierReward" NOT NULL DEFAULT 'PRICE';
ALTER TABLE "OfferTier" ADD COLUMN "discountBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OfferTier" ALTER COLUMN "priceCents" SET DEFAULT 0;

-- ── Discounts ────────────────────────────────────────────────────────────

ALTER TABLE "Discount" ADD COLUMN "maxDiscountCents" INTEGER;
ALTER TABLE "Discount" ADD COLUMN "storeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Discount" ADD COLUMN "targetVariantIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Discount" ADD COLUMN "excludedProductIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Discount" ADD COLUMN "excludedVariantIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ── Orders ───────────────────────────────────────────────────────────────

ALTER TABLE "OrderLine" ADD COLUMN "isGift" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "manualDiscountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "manualDiscountReason" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingWaived" BOOLEAN NOT NULL DEFAULT false;
