-- Online stores, alongside landing pages.
--
-- Every existing site becomes a LANDING site, which is what they all are: one
-- or more order-form pages under one address. Every existing page becomes a
-- STANDARD page, which is the only kind there was. Nothing renders differently
-- until a merchant creates a STORE.
--
-- `liveTheme` starts null, and the public renderer reads the theme columns when
-- it is — so existing sites keep showing exactly the theme they show today
-- until the next publish freezes a copy.
CREATE TYPE "SiteKind" AS ENUM ('LANDING', 'STORE');

CREATE TYPE "PageRole" AS ENUM ('STANDARD', 'LAYOUT', 'PRODUCT', 'CATALOG');

ALTER TABLE "Store"
  ADD COLUMN "kind" "SiteKind" NOT NULL DEFAULT 'LANDING',
  ADD COLUMN "templateKey" TEXT;

ALTER TABLE "Page"
  ADD COLUMN "role" "PageRole" NOT NULL DEFAULT 'STANDARD';

CREATE INDEX "Page_storeId_role_idx" ON "Page"("storeId", "role");

ALTER TABLE "ThemeSettings"
  ADD COLUMN "liveTheme" JSONB;
