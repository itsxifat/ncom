-- NCOM in the Enfinito CRM (src/server/billing/crmSync.ts): every sale with something to pay has an
-- invoice priced under the VAT the CRM decides, and every change to an invoice or its payments is
-- queued for the CRM by the triggers at the end, so no code path can forget to send it.


-- CreateEnum
CREATE TYPE "BillingInvoiceStatus" AS ENUM ('UNPAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "CrmSyncState" AS ENUM ('PENDING', 'SYNCED', 'REVIEW', 'REJECTED', 'MISMATCH', 'SKIPPED');

-- CreateEnum
CREATE TYPE "BillingPaymentMethod" AS ENUM ('ENFINITO_PAY', 'MANUAL');

-- CreateEnum
CREATE TYPE "BillingPaymentStatus" AS ENUM ('SUCCEEDED', 'REFUNDED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "billingNumber" SERIAL NOT NULL;

-- CreateTable
CREATE TABLE "BillingInvoice" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "organizationId" TEXT,
    "customerNumber" INTEGER NOT NULL,
    "planOrderId" TEXT,
    "creditOrderId" TEXT,
    "description" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'BDT',
    "subtotalCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "sdCents" INTEGER NOT NULL DEFAULT 0,
    "vatCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "vatTreatment" TEXT NOT NULL DEFAULT 'NONE',
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sdRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "serviceCode" TEXT,
    "taxPolicyVersion" TEXT,
    "pricesIncludeVat" BOOLEAN NOT NULL DEFAULT true,
    "status" "BillingInvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "buyer" JSONB NOT NULL,
    "seller" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "crmVersion" INTEGER NOT NULL DEFAULT 1,
    "crmSyncedVersion" INTEGER NOT NULL DEFAULT 0,
    "crmState" "CrmSyncState" NOT NULL DEFAULT 'PENDING',
    "crmCode" TEXT,
    "crmError" TEXT,
    "crmAttempts" INTEGER NOT NULL DEFAULT 0,
    "crmNextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "crmSyncedAt" TIMESTAMP(3),
    "crmInvoiceId" TEXT,
    "crmSnapshot" JSONB,

    CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "method" "BillingPaymentMethod" NOT NULL,
    "status" "BillingPaymentStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "amountCents" INTEGER NOT NULL,
    "livemode" BOOLEAN,
    "channel" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "checkoutId" TEXT,
    "transactionId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "refundedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_number_key" ON "BillingInvoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_planOrderId_key" ON "BillingInvoice"("planOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_creditOrderId_key" ON "BillingInvoice"("creditOrderId");

-- CreateIndex
CREATE INDEX "BillingInvoice_organizationId_createdAt_idx" ON "BillingInvoice"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingInvoice_crmNextAttemptAt_idx" ON "BillingInvoice"("crmNextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_dedupeKey_key" ON "BillingPayment"("dedupeKey");

-- CreateIndex
CREATE INDEX "BillingPayment_invoiceId_idx" ON "BillingPayment"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_billingNumber_key" ON "Organization"("billingNumber");

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_planOrderId_fkey" FOREIGN KEY ("planOrderId") REFERENCES "PlanOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_creditOrderId_fkey" FOREIGN KEY ("creditOrderId") REFERENCES "AiCreditOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The invoice adds up, in the shape of the CRM's invoices.
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_adds_up"
  CHECK ("subtotalCents" - "discountCents" + "sdCents" + "vatCents" = "totalCents" AND "discountCents" >= 0 AND "totalCents" >= 0);
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_amount_positive" CHECK ("amountCents" > 0);

-- Anything the CRM is told about changed: it goes again (whole state, so a repeat is harmless).
CREATE FUNCTION billing_invoice_crm_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."number", NEW."customerNumber", NEW."description", NEW."totalCents", NEW."status", NEW."dueAt", NEW."paidAt")
     IS DISTINCT FROM (OLD."number", OLD."customerNumber", OLD."description", OLD."totalCents", OLD."status", OLD."dueAt", OLD."paidAt") THEN
    NEW."crmVersion" := OLD."crmVersion" + 1;
    NEW."crmState" := 'PENDING';
    NEW."crmAttempts" := 0;
    NEW."crmNextAttemptAt" := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER billing_invoice_crm_changed BEFORE UPDATE ON "BillingInvoice" FOR EACH ROW EXECUTE FUNCTION billing_invoice_crm_changed();

-- A payment that succeeds, or stops counting (a refund), changes what the CRM has to book.
CREATE FUNCTION billing_payment_crm_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'SUCCEEDED' OR (TG_OP = 'UPDATE' AND OLD."status" = 'SUCCEEDED') THEN
    IF TG_OP = 'INSERT' OR (NEW."status", NEW."amountCents", NEW."invoiceId") IS DISTINCT FROM (OLD."status", OLD."amountCents", OLD."invoiceId") THEN
      UPDATE "BillingInvoice" SET "crmVersion" = "crmVersion" + 1, "crmState" = 'PENDING', "crmAttempts" = 0, "crmNextAttemptAt" = now()
       WHERE "id" = NEW."invoiceId";
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER billing_payment_crm_changed AFTER INSERT OR UPDATE ON "BillingPayment" FOR EACH ROW EXECUTE FUNCTION billing_payment_crm_changed();
