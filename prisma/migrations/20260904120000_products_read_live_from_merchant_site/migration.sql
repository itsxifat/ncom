-- Products and stock are read from the merchant's own website, live, on every
-- request that needs them. Nothing about a catalogue is stored here any more.
--
-- Three things this migration does:
--
--   1. adds the connection — where to call, which key, which secret;
--   2. drops the foreign keys that bound carts, orders and offers to a local
--      catalogue, so those columns can hold the merchant's own ids;
--   3. gives CartLine its own copy of the descriptive fields it used to read
--      through that foreign key.
--
-- The Product/ProductVariant/InventoryLevel tables are deliberately left in
-- place. Nothing reads them after this release, but a workspace mid-migration
-- still has its rows to look at, and dropping data is not something to do in
-- the same deploy that changes how it is read. A follow-up migration removes
-- them once every organisation has a connection.

CREATE TABLE "CatalogConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "timeoutMs" INTEGER NOT NULL DEFAULT 4000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "capabilities" JSONB,
    "contractVersion" TEXT,
    "platform" TEXT,
    "currencyCode" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastOkAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogConnection_organizationId_key" ON "CatalogConnection"("organizationId");

ALTER TABLE "CatalogConnection" ADD CONSTRAINT "CatalogConnection_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The ids stay; what they point at moves off this database. IF EXISTS because
-- a constraint named by an older Prisma version may already be gone.
ALTER TABLE "CartLine" DROP CONSTRAINT IF EXISTS "CartLine_variantId_fkey";
ALTER TABLE "OrderLine" DROP CONSTRAINT IF EXISTS "OrderLine_productId_fkey";
ALTER TABLE "OrderLine" DROP CONSTRAINT IF EXISTS "OrderLine_variantId_fkey";
ALTER TABLE "OfferItem" DROP CONSTRAINT IF EXISTS "OfferItem_productId_fkey";
ALTER TABLE "OfferItem" DROP CONSTRAINT IF EXISTS "OfferItem_variantId_fkey";
ALTER TABLE "OfferVariantRule" DROP CONSTRAINT IF EXISTS "OfferVariantRule_variantId_fkey";
ALTER TABLE "Offer" DROP CONSTRAINT IF EXISTS "Offer_giftVariantId_fkey";

-- What the cart used to reach through the foreign key. Display only: prices and
-- stock are re-read live, and these columns are never used to charge anyone.
ALTER TABLE "CartLine" ADD COLUMN "productId" TEXT;
ALTER TABLE "CartLine" ADD COLUMN "title" TEXT;
ALTER TABLE "CartLine" ADD COLUMN "variantTitle" TEXT;
ALTER TABLE "CartLine" ADD COLUMN "handle" TEXT;
ALTER TABLE "CartLine" ADD COLUMN "sku" TEXT;
ALTER TABLE "CartLine" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "CartLine" ADD COLUMN "requiresShipping" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CartLine" ADD COLUMN "weightGrams" INTEGER NOT NULL DEFAULT 0;

-- Backfill the snapshot for carts that are open right now, so a shopper who
-- left a tab open across the deploy still sees their own items.
UPDATE "CartLine" AS cl
SET "productId" = p."id",
    "title" = p."title",
    "variantTitle" = v."title",
    "handle" = p."handle",
    "sku" = v."sku",
    "requiresShipping" = v."requiresShipping",
    "weightGrams" = v."weightGrams"
FROM "ProductVariant" AS v
JOIN "Product" AS p ON p."id" = v."productId"
WHERE cl."variantId" = v."id";

-- Order lines keep the photo they were sold with. Reading the current one now
-- means a call to the merchant's website per line, on screens that render
-- hundreds — see the note on the column in schema.prisma.
ALTER TABLE "OrderLine" ADD COLUMN "imageUrl" TEXT;

UPDATE "OrderLine" AS ol
SET "imageUrl" = COALESCE(
  (SELECT m."url" FROM "ProductImage" pi
     JOIN "MediaAsset" m ON m."id" = pi."mediaId"
     JOIN "ProductVariant" v ON v."imageId" = pi."id"
    WHERE v."id" = ol."variantId"
    LIMIT 1),
  (SELECT m."url" FROM "ProductImage" pi
     JOIN "MediaAsset" m ON m."id" = pi."mediaId"
    WHERE pi."productId" = ol."productId"
    ORDER BY pi."position" ASC
    LIMIT 1)
)
WHERE ol."imageUrl" IS NULL;
