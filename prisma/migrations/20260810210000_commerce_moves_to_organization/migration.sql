-- Commerce moves from Store to Organization.
--
-- Hand-written because Prisma's generated migration for a column rename is a
-- DROP followed by an ADD, which would delete every product, order and
-- customer on the platform. This renames in place and backfills the new
-- organisation reference from each row's existing store, so no data moves and
-- nothing is lost.
--
-- Safe to run on populated data: every organisation currently owns exactly one
-- store, so store -> organisation is unambiguous and no unique constraint
-- (handle, email, order number) can collide when it is re-scoped.

-- 1. Rename the owning table.
ALTER TABLE "StoreSettings" RENAME TO "OrganizationSettings";

-- 2. Add the organisation column, backfill it from the store, then make it
--    required. Adding-then-backfilling rather than renaming, because the value
--    has to be looked up through Store.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'OrganizationSettings','Product','Collection','Location','Customer','Cart',
    'Order','PaymentProviderConfig','Discount','ShippingZone','TaxRate'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN "organizationId" TEXT', t);
    EXECUTE format(
      'UPDATE %I AS x SET "organizationId" = s."organizationId" FROM "Store" s WHERE s.id = x."storeId"', t);
    -- Any row whose store vanished has nothing to belong to; there are none in
    -- practice because storeId was NOT NULL with a cascading delete.
    EXECUTE format('DELETE FROM %I WHERE "organizationId" IS NULL', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "organizationId" SET NOT NULL', t);
  END LOOP;
END $$;

-- 3. Drop the old store-scoped constraints and indexes.
ALTER TABLE "OrganizationSettings" DROP CONSTRAINT IF EXISTS "StoreSettings_storeId_fkey";
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_storeId_fkey";
ALTER TABLE "Collection" DROP CONSTRAINT IF EXISTS "Collection_storeId_fkey";
ALTER TABLE "Location" DROP CONSTRAINT IF EXISTS "Location_storeId_fkey";
ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_storeId_fkey";
ALTER TABLE "Cart" DROP CONSTRAINT IF EXISTS "Cart_storeId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_storeId_fkey";
ALTER TABLE "PaymentProviderConfig" DROP CONSTRAINT IF EXISTS "PaymentProviderConfig_storeId_fkey";
ALTER TABLE "Discount" DROP CONSTRAINT IF EXISTS "Discount_storeId_fkey";
ALTER TABLE "ShippingZone" DROP CONSTRAINT IF EXISTS "ShippingZone_storeId_fkey";
ALTER TABLE "TaxRate" DROP CONSTRAINT IF EXISTS "TaxRate_storeId_fkey";

DROP INDEX IF EXISTS "StoreSettings_storeId_key";
DROP INDEX IF EXISTS "Product_storeId_handle_key";
DROP INDEX IF EXISTS "Product_storeId_status_idx";
DROP INDEX IF EXISTS "Product_storeId_createdAt_idx";
DROP INDEX IF EXISTS "Collection_storeId_handle_key";
DROP INDEX IF EXISTS "Collection_storeId_idx";
DROP INDEX IF EXISTS "Location_storeId_idx";
DROP INDEX IF EXISTS "Customer_storeId_email_key";
DROP INDEX IF EXISTS "Customer_storeId_phone_idx";
DROP INDEX IF EXISTS "Customer_storeId_createdAt_idx";
DROP INDEX IF EXISTS "Cart_storeId_updatedAt_idx";
DROP INDEX IF EXISTS "Order_storeId_orderNumber_key";
DROP INDEX IF EXISTS "Order_storeId_createdAt_idx";
DROP INDEX IF EXISTS "Order_storeId_financialStatus_idx";
DROP INDEX IF EXISTS "Order_storeId_fulfillmentStatus_idx";
DROP INDEX IF EXISTS "PaymentProviderConfig_storeId_provider_key";
DROP INDEX IF EXISTS "Discount_storeId_isActive_idx";
DROP INDEX IF EXISTS "ShippingZone_storeId_idx";
DROP INDEX IF EXISTS "TaxRate_storeId_countryCode_provinceCode_taxCode_key";
DROP INDEX IF EXISTS "TaxRate_storeId_idx";

-- 4. Drop storeId everywhere it is no longer meaningful. Cart and Order keep
--    theirs as nullable attribution: which storefront the sale came through.
ALTER TABLE "OrganizationSettings" DROP COLUMN "storeId";
ALTER TABLE "Product" DROP COLUMN "storeId";
ALTER TABLE "Collection" DROP COLUMN "storeId";
ALTER TABLE "Location" DROP COLUMN "storeId";
ALTER TABLE "Customer" DROP COLUMN "storeId";
ALTER TABLE "PaymentProviderConfig" DROP COLUMN "storeId";
ALTER TABLE "Discount" DROP COLUMN "storeId";
ALTER TABLE "ShippingZone" DROP COLUMN "storeId";
ALTER TABLE "TaxRate" DROP COLUMN "storeId";
ALTER TABLE "Cart" ALTER COLUMN "storeId" DROP NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "storeId" DROP NOT NULL;

-- 5. Recreate everything scoped to the organisation.
ALTER TABLE "OrganizationSettings" RENAME CONSTRAINT "StoreSettings_pkey" TO "OrganizationSettings_pkey";
CREATE UNIQUE INDEX "OrganizationSettings_organizationId_key" ON "OrganizationSettings"("organizationId");
CREATE UNIQUE INDEX "Product_organizationId_handle_key" ON "Product"("organizationId", "handle");
CREATE INDEX "Product_organizationId_status_idx" ON "Product"("organizationId", "status");
CREATE INDEX "Product_organizationId_createdAt_idx" ON "Product"("organizationId", "createdAt");
CREATE UNIQUE INDEX "Collection_organizationId_handle_key" ON "Collection"("organizationId", "handle");
CREATE INDEX "Collection_organizationId_idx" ON "Collection"("organizationId");
CREATE INDEX "Location_organizationId_idx" ON "Location"("organizationId");
CREATE UNIQUE INDEX "Customer_organizationId_email_key" ON "Customer"("organizationId", "email");
CREATE INDEX "Customer_organizationId_phone_idx" ON "Customer"("organizationId", "phone");
CREATE INDEX "Customer_organizationId_createdAt_idx" ON "Customer"("organizationId", "createdAt");
CREATE INDEX "Cart_organizationId_updatedAt_idx" ON "Cart"("organizationId", "updatedAt");
CREATE UNIQUE INDEX "Order_organizationId_orderNumber_key" ON "Order"("organizationId", "orderNumber");
CREATE INDEX "Order_organizationId_createdAt_idx" ON "Order"("organizationId", "createdAt");
CREATE INDEX "Order_organizationId_financialStatus_idx" ON "Order"("organizationId", "financialStatus");
CREATE INDEX "Order_organizationId_fulfillmentStatus_idx" ON "Order"("organizationId", "fulfillmentStatus");
CREATE UNIQUE INDEX "PaymentProviderConfig_organizationId_provider_key" ON "PaymentProviderConfig"("organizationId", "provider");
CREATE INDEX "Discount_organizationId_isActive_idx" ON "Discount"("organizationId", "isActive");
CREATE INDEX "ShippingZone_organizationId_idx" ON "ShippingZone"("organizationId");
CREATE UNIQUE INDEX "TaxRate_organizationId_countryCode_provinceCode_taxCode_key" ON "TaxRate"("organizationId", "countryCode", "provinceCode", "taxCode");
CREATE INDEX "TaxRate_organizationId_idx" ON "TaxRate"("organizationId");

ALTER TABLE "OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Location" ADD CONSTRAINT "Location_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentProviderConfig" ADD CONSTRAINT "PaymentProviderConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShippingZone" ADD CONSTRAINT "ShippingZone_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
