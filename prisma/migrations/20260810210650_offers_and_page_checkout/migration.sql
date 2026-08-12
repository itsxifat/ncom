-- CreateEnum
CREATE TYPE "OfferKind" AS ENUM ('FIXED', 'COLLECTION', 'ALACARTE');

-- CreateEnum
CREATE TYPE "OfferPricingMode" AS ENUM ('AUTO', 'FIXED', 'PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "PageShippingMode" AS ENUM ('INHERIT', 'FREE', 'FLAT', 'ZONES');

-- CreateEnum
CREATE TYPE "PromotionBasis" AS ENUM ('SUBTOTAL', 'QUANTITY');

-- CreateEnum
CREATE TYPE "PromotionReward" AS ENUM ('AMOUNT', 'PERCENT');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "offerKey" TEXT,
ADD COLUMN     "offerLabel" TEXT,
ADD COLUMN     "offerPriceCents" INTEGER,
ADD COLUMN     "offerRegularCents" INTEGER,
ADD COLUMN     "pageId" TEXT;

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "badge" TEXT,
    "kind" "OfferKind" NOT NULL DEFAULT 'FIXED',
    "pricingMode" "OfferPricingMode" NOT NULL DEFAULT 'AUTO',
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "discountBps" INTEGER NOT NULL DEFAULT 0,
    "compareAtCents" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "maxQuantity" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "imageMediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferItem" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OfferItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferTier" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,

    CONSTRAINT "OfferTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageCheckout" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "shippingMode" "PageShippingMode" NOT NULL DEFAULT 'INHERIT',
    "flatRateCents" INTEGER NOT NULL DEFAULT 0,
    "askZone" BOOLEAN NOT NULL DEFAULT true,
    "freeShippingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "freeShippingMinSubtotalCents" INTEGER NOT NULL DEFAULT 0,
    "freeShippingMinQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageShippingRate" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PageShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageDiscountRule" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "basis" "PromotionBasis" NOT NULL DEFAULT 'SUBTOTAL',
    "thresholdCents" INTEGER NOT NULL DEFAULT 0,
    "thresholdQuantity" INTEGER NOT NULL DEFAULT 0,
    "reward" "PromotionReward" NOT NULL DEFAULT 'AMOUNT',
    "valueCents" INTEGER NOT NULL DEFAULT 0,
    "valueBps" INTEGER NOT NULL DEFAULT 0,
    "maxDiscountCents" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PageDiscountRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Offer_pageId_position_idx" ON "Offer"("pageId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_pageId_key_key" ON "Offer"("pageId", "key");

-- CreateIndex
CREATE INDEX "OfferItem_offerId_position_idx" ON "OfferItem"("offerId", "position");

-- CreateIndex
CREATE INDEX "OfferItem_productId_idx" ON "OfferItem"("productId");

-- CreateIndex
CREATE INDEX "OfferTier_offerId_quantity_idx" ON "OfferTier"("offerId", "quantity");

-- CreateIndex
CREATE UNIQUE INDEX "OfferTier_offerId_quantity_key" ON "OfferTier"("offerId", "quantity");

-- CreateIndex
CREATE UNIQUE INDEX "PageCheckout_pageId_key" ON "PageCheckout"("pageId");

-- CreateIndex
CREATE INDEX "PageShippingRate_checkoutId_position_idx" ON "PageShippingRate"("checkoutId", "position");

-- CreateIndex
CREATE INDEX "PageDiscountRule_checkoutId_position_idx" ON "PageDiscountRule"("checkoutId", "position");

-- CreateIndex
CREATE INDEX "Order_pageId_idx" ON "Order"("pageId");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_imageMediaId_fkey" FOREIGN KEY ("imageMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferItem" ADD CONSTRAINT "OfferItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferItem" ADD CONSTRAINT "OfferItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferItem" ADD CONSTRAINT "OfferItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferTier" ADD CONSTRAINT "OfferTier_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageCheckout" ADD CONSTRAINT "PageCheckout_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageShippingRate" ADD CONSTRAINT "PageShippingRate_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "PageCheckout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageDiscountRule" ADD CONSTRAINT "PageDiscountRule_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "PageCheckout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;
