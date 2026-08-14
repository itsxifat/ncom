-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "sourceUrl" TEXT;

-- AlterTable
ALTER TABLE "OrganizationSettings" ADD COLUMN     "currencyConfiguredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "MediaAsset_organizationId_sourceUrl_idx" ON "MediaAsset"("organizationId", "sourceUrl");

