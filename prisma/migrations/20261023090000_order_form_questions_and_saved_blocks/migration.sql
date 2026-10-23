-- The answers to a merchant's own order-form questions ("Size", "Preferred
-- delivery time"), copied onto the order as they were asked.
ALTER TABLE "Order" ADD COLUMN "formAnswers" JSONB;

-- Blocks a merchant saved to reuse on other pages and sites.
CREATE TABLE "SavedBlock" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "config" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedBlock_organizationId_createdAt_idx" ON "SavedBlock"("organizationId", "createdAt");

ALTER TABLE "SavedBlock" ADD CONSTRAINT "SavedBlock_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedBlock" ADD CONSTRAINT "SavedBlock_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
