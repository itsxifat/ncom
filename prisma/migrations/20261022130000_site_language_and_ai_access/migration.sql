-- The language a site speaks to shoppers, and how it writes its numbers.
ALTER TABLE "ThemeSettings" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "ThemeSettings" ADD COLUMN "numerals" TEXT NOT NULL DEFAULT 'latin';

-- API keys that let an AI code editor read and build websites over MCP.
ALTER TYPE "ApiScope" ADD VALUE 'SITES_READ';
ALTER TYPE "ApiScope" ADD VALUE 'SITES_WRITE';
