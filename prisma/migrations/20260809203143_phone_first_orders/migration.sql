-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Customer_storeId_phone_idx" ON "Customer"("storeId", "phone");
