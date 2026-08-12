-- CreateEnum
CREATE TYPE "SignupPurpose" AS ENUM ('START_SELLING', 'MOVE_EXISTING_STORE', 'BUILD_FOR_CLIENT', 'JUST_EXPLORING');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardedAt" TIMESTAMP(3),
ADD COLUMN     "signupPurpose" "SignupPurpose";

-- CreateTable
CREATE TABLE "OrgInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'VIEWER',
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgInvitation_tokenHash_key" ON "OrgInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "OrgInvitation_email_idx" ON "OrgInvitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OrgInvitation_organizationId_email_key" ON "OrgInvitation"("organizationId", "email");

-- RenameForeignKey
ALTER TABLE "Store" RENAME CONSTRAINT "Project_organizationId_fkey" TO "Store_organizationId_fkey";

-- AddForeignKey
ALTER TABLE "OrgInvitation" ADD CONSTRAINT "OrgInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
