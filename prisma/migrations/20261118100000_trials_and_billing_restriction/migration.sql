-- CreateEnum
CREATE TYPE "PlanOrderKind" AS ENUM ('PURCHASE', 'TRIAL', 'RENEWAL');

-- AlterTable
ALTER TABLE "PlanOrder" ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "kind" "PlanOrderKind" NOT NULL DEFAULT 'PURCHASE',
ADD COLUMN     "overdueNoticeSentAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ADD COLUMN     "restrictedNoticeSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "restrictedAt" TIMESTAMP(3),
ADD COLUMN     "trialUsedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PlanOrder_subscriptionId_kind_status_idx" ON "PlanOrder"("subscriptionId", "kind", "status");
