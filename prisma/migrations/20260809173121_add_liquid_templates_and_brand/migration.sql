-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "liquidSource" TEXT;

-- AlterTable
ALTER TABLE "ThemeSettings" ADD COLUMN     "bodyScale" TEXT NOT NULL DEFAULT '1',
ADD COLUMN     "faviconMediaId" TEXT,
ADD COLUMN     "headingWeight" TEXT NOT NULL DEFAULT '600',
ADD COLUMN     "logoMediaId" TEXT,
ADD COLUMN     "logoWidth" INTEGER DEFAULT 140,
ADD COLUMN     "sectionSpacing" TEXT NOT NULL DEFAULT 'comfortable',
ADD COLUMN     "showStickyHeader" BOOLEAN NOT NULL DEFAULT true;
