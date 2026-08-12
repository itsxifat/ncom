/*
  Warnings:

  - You are about to drop the column `faviconMediaId` on the `ThemeSettings` table. All the data in the column will be lost.
  - You are about to drop the column `logoMediaId` on the `ThemeSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ThemeSettings" DROP COLUMN "faviconMediaId",
DROP COLUMN "logoMediaId",
ADD COLUMN     "faviconUrl" TEXT,
ADD COLUMN     "logoUrl" TEXT;
