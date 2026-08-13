-- AlterTable
ALTER TABLE "CourierSettings" ADD COLUMN     "minTotalParcels" INTEGER NOT NULL DEFAULT 10,
ALTER COLUMN "minDeliveryRateBps" SET DEFAULT 0,
ALTER COLUMN "minDeliveredOrders" SET DEFAULT 10;

-- CreateTable
CREATE TABLE "FraudAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestMessage" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FraudAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FraudAccount_organizationId_position_idx" ON "FraudAccount"("organizationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "FraudAccount_organizationId_email_key" ON "FraudAccount"("organizationId", "email");

-- AddForeignKey
ALTER TABLE "FraudAccount" ADD CONSTRAINT "FraudAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fraud screening credentials move out of CourierConfig and into FraudAccount,
-- where a merchant can hold several and each is health-checked on its own.
--
-- The old values cannot be carried across here: they are AES-GCM ciphertext
-- that only the application can open, and SQL has no key. They are dropped
-- rather than left behind, because an encrypted secret nothing reads any more
-- is a secret still sitting in every backup for no benefit. Anyone who had
-- configured screening re-adds the login under Courier & fraud → Fraud
-- accounts, which now takes several.
UPDATE "CourierConfig"
SET "credentials" = "credentials" - 'fraudEmail' - 'fraudPassword'
WHERE "provider" = 'STEADFAST' AND "credentials" IS NOT NULL;
