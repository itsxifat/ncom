-- Rename Project to Store.
--
-- Written by hand as RENAMEs rather than generated: Prisma's differ sees a
-- renamed table/column as a drop plus an add, which would delete every store,
-- page and order in the database. RENAME preserves the rows and the data in
-- them. Constraint and index names are renamed alongside so that Prisma's
-- next diff sees no drift.

-- 1. The table itself.
ALTER TABLE "Project" RENAME TO "Store";
ALTER TABLE "ProjectIntegrationConfig" RENAME TO "StoreIntegrationConfig";

-- 2. Foreign key columns on every table that pointed at it.
ALTER TABLE "Cart" RENAME COLUMN "projectId" TO "storeId";
ALTER TABLE "Collection" RENAME COLUMN "projectId" TO "storeId";
ALTER TABLE "Customer" RENAME COLUMN "projectId" TO "storeId";
ALTER TABLE "Discount" RENAME COLUMN "projectId" TO "storeId";
ALTER TABLE "LiquidSnippet" RENAME COLUMN "projectId" TO "storeId";
ALTER TABLE "Location" RENAME COLUMN "projectId" TO "storeId";
ALTER TABLE "MediaAsset" RENAME COLUMN "projectId" TO "storeId";
ALTER TABLE "Order" RENAME COLUMN "projectId" TO "storeId";
ALTER TABLE "Page" RENAME COLUMN "projectId" TO "storeId";
ALTER TABLE "PageView" RENAME COLUMN "projectId" TO "storeId";
ALTER TABLE "PaymentProviderConfig" RENAME COLUMN "projectId" TO "storeId";
ALTER TABLE "Product" RENAME COLUMN "projectId" TO "storeId";
ALTER TABLE "StoreIntegrationConfig" RENAME COLUMN "projectId" TO "storeId";
ALTER TABLE "ShippingZone" RENAME COLUMN "projectId" TO "storeId";
ALTER TABLE "StoreSettings" RENAME COLUMN "projectId" TO "storeId";
ALTER TABLE "StorefrontTemplate" RENAME COLUMN "projectId" TO "storeId";
ALTER TABLE "TaxRate" RENAME COLUMN "projectId" TO "storeId";
ALTER TABLE "ThemeSettings" RENAME COLUMN "projectId" TO "storeId";

-- 3. Constraints and indexes, so their names match what Prisma expects.
ALTER INDEX IF EXISTS "Project_pkey" RENAME TO "Store_pkey";
ALTER INDEX IF EXISTS "Project_subdomain_key" RENAME TO "Store_subdomain_key";
ALTER INDEX IF EXISTS "Project_customDomain_key" RENAME TO "Store_customDomain_key";
ALTER INDEX IF EXISTS "Project_organizationId_fkey" RENAME TO "Store_organizationId_fkey";
ALTER INDEX IF EXISTS "ProjectIntegrationConfig_pkey" RENAME TO "StoreIntegrationConfig_pkey";
ALTER INDEX IF EXISTS "ProjectIntegrationConfig_projectId_key" RENAME TO "StoreIntegrationConfig_storeId_key";
ALTER INDEX IF EXISTS "ProjectIntegrationConfig_projectId_fkey" RENAME TO "StoreIntegrationConfig_storeId_fkey";

-- Foreign key constraints are renamed separately from indexes.
ALTER TABLE "Cart" RENAME CONSTRAINT "Cart_projectId_fkey" TO "Cart_storeId_fkey";
ALTER TABLE "Collection" RENAME CONSTRAINT "Collection_projectId_fkey" TO "Collection_storeId_fkey";
ALTER TABLE "Customer" RENAME CONSTRAINT "Customer_projectId_fkey" TO "Customer_storeId_fkey";
ALTER TABLE "Discount" RENAME CONSTRAINT "Discount_projectId_fkey" TO "Discount_storeId_fkey";
ALTER TABLE "LiquidSnippet" RENAME CONSTRAINT "LiquidSnippet_projectId_fkey" TO "LiquidSnippet_storeId_fkey";
ALTER TABLE "Location" RENAME CONSTRAINT "Location_projectId_fkey" TO "Location_storeId_fkey";
ALTER TABLE "MediaAsset" RENAME CONSTRAINT "MediaAsset_projectId_fkey" TO "MediaAsset_storeId_fkey";
ALTER TABLE "Order" RENAME CONSTRAINT "Order_projectId_fkey" TO "Order_storeId_fkey";
ALTER TABLE "Page" RENAME CONSTRAINT "Page_projectId_fkey" TO "Page_storeId_fkey";
ALTER TABLE "PageView" RENAME CONSTRAINT "PageView_projectId_fkey" TO "PageView_storeId_fkey";
ALTER TABLE "PaymentProviderConfig" RENAME CONSTRAINT "PaymentProviderConfig_projectId_fkey" TO "PaymentProviderConfig_storeId_fkey";
ALTER TABLE "Product" RENAME CONSTRAINT "Product_projectId_fkey" TO "Product_storeId_fkey";
ALTER TABLE "StoreIntegrationConfig" RENAME CONSTRAINT "ProjectIntegrationConfig_projectId_fkey" TO "StoreIntegrationConfig_storeId_fkey";
ALTER TABLE "ShippingZone" RENAME CONSTRAINT "ShippingZone_projectId_fkey" TO "ShippingZone_storeId_fkey";
ALTER TABLE "StoreSettings" RENAME CONSTRAINT "StoreSettings_projectId_fkey" TO "StoreSettings_storeId_fkey";
ALTER TABLE "StorefrontTemplate" RENAME CONSTRAINT "StorefrontTemplate_projectId_fkey" TO "StorefrontTemplate_storeId_fkey";
ALTER TABLE "TaxRate" RENAME CONSTRAINT "TaxRate_projectId_fkey" TO "TaxRate_storeId_fkey";
ALTER TABLE "ThemeSettings" RENAME CONSTRAINT "ThemeSettings_projectId_fkey" TO "ThemeSettings_storeId_fkey";

-- 4. Unique constraints that included the renamed column.
ALTER INDEX IF EXISTS "Page_projectId_slug_key" RENAME TO "Page_storeId_slug_key";
ALTER INDEX IF EXISTS "Product_projectId_handle_key" RENAME TO "Product_storeId_handle_key";
ALTER INDEX IF EXISTS "Collection_projectId_handle_key" RENAME TO "Collection_storeId_handle_key";
ALTER INDEX IF EXISTS "Customer_projectId_email_key" RENAME TO "Customer_storeId_email_key";
ALTER INDEX IF EXISTS "Order_projectId_orderNumber_key" RENAME TO "Order_storeId_orderNumber_key";
ALTER INDEX IF EXISTS "StoreSettings_projectId_key" RENAME TO "StoreSettings_storeId_key";
ALTER INDEX IF EXISTS "ThemeSettings_projectId_key" RENAME TO "ThemeSettings_storeId_key";
ALTER INDEX IF EXISTS "StorefrontTemplate_projectId_type_key" RENAME TO "StorefrontTemplate_storeId_type_key";
ALTER INDEX IF EXISTS "LiquidSnippet_projectId_name_key" RENAME TO "LiquidSnippet_storeId_name_key";
ALTER INDEX IF EXISTS "PaymentProviderConfig_projectId_provider_key" RENAME TO "PaymentProviderConfig_storeId_provider_key";
ALTER INDEX IF EXISTS "TaxRate_projectId_countryCode_provinceCode_taxCode_key" RENAME TO "TaxRate_storeId_countryCode_provinceCode_taxCode_key";

-- 5. Plain indexes.
ALTER INDEX IF EXISTS "Product_projectId_status_idx" RENAME TO "Product_storeId_status_idx";
ALTER INDEX IF EXISTS "Product_projectId_createdAt_idx" RENAME TO "Product_storeId_createdAt_idx";
ALTER INDEX IF EXISTS "Collection_projectId_idx" RENAME TO "Collection_storeId_idx";
ALTER INDEX IF EXISTS "Customer_projectId_createdAt_idx" RENAME TO "Customer_storeId_createdAt_idx";
ALTER INDEX IF EXISTS "Cart_projectId_updatedAt_idx" RENAME TO "Cart_storeId_updatedAt_idx";
ALTER INDEX IF EXISTS "Order_projectId_createdAt_idx" RENAME TO "Order_storeId_createdAt_idx";
ALTER INDEX IF EXISTS "Order_projectId_financialStatus_idx" RENAME TO "Order_storeId_financialStatus_idx";
ALTER INDEX IF EXISTS "Order_projectId_fulfillmentStatus_idx" RENAME TO "Order_storeId_fulfillmentStatus_idx";
ALTER INDEX IF EXISTS "Discount_projectId_isActive_idx" RENAME TO "Discount_storeId_isActive_idx";
ALTER INDEX IF EXISTS "Location_projectId_idx" RENAME TO "Location_storeId_idx";
ALTER INDEX IF EXISTS "ShippingZone_projectId_idx" RENAME TO "ShippingZone_storeId_idx";
ALTER INDEX IF EXISTS "TaxRate_projectId_idx" RENAME TO "TaxRate_storeId_idx";
ALTER INDEX IF EXISTS "PageView_projectId_createdAt_idx" RENAME TO "PageView_storeId_createdAt_idx";

-- 6. Every store is now an ecommerce store — the LANDING/STORE split is gone.
ALTER TABLE "Store" DROP COLUMN IF EXISTS "type";
DROP TYPE IF EXISTS "ProjectType";
