-- Drops the Liquid layer and the component/template tables.
--
-- The block catalogue now lives in code (modules/sections/registry.ts), so a
-- PageSection names its block with a `type` string instead of pointing at a
-- ComponentDefinition row. This backfills `type` from the definition each
-- section already referenced *before* dropping the table, so existing pages
-- keep their blocks.
--
-- Sections whose block no longer exists are deleted rather than left dangling:
-- the Liquid-rendered commerce blocks and the pre-pivot brochure sections have
-- no React equivalent to fall back to. Content shape drift is safe — the
-- renderer validates each block's JSON and falls back to that block's defaults.

-- ── PageSection.componentDefinitionId → PageSection.type ────────────────────

ALTER TABLE "PageSection" ADD COLUMN "type" TEXT;

UPDATE "PageSection" AS ps
SET "type" = cd."key"
FROM "ComponentDefinition" AS cd
WHERE cd."id" = ps."componentDefinitionId";

-- Keys that were renamed when the catalogue moved into code.
UPDATE "PageSection" SET "type" = 'orderform' WHERE "type" = 'order-form';
UPDATE "PageSection" SET "type" = 'richtext'  WHERE "type" = 'text';

-- Anything with no block in the registry goes. Listed explicitly rather than
-- inferred so this migration states exactly what it removes.
DELETE FROM "PageSection"
WHERE "type" IS NULL
   OR "type" NOT IN (
        'hero', 'richtext', 'image', 'cta', 'gallery', 'features', 'video',
        'countdown', 'testimonials', 'trust', 'faq', 'orderform', 'divider'
      );

ALTER TABLE "PageSection" ALTER COLUMN "type" SET NOT NULL;

ALTER TABLE "PageSection" DROP CONSTRAINT IF EXISTS "PageSection_componentDefinitionId_fkey";
ALTER TABLE "PageSection" DROP COLUMN "componentDefinitionId";

-- ── Drop the template and Liquid tables ─────────────────────────────────────

DROP TABLE IF EXISTS "TemplateSection";
DROP TABLE IF EXISTS "Template";
DROP TABLE IF EXISTS "TemplateCategory";
DROP TABLE IF EXISTS "ComponentDefinition";
DROP TABLE IF EXISTS "StorefrontTemplate";
DROP TABLE IF EXISTS "LiquidSnippet";

DROP TYPE IF EXISTS "TemplateStatus";
DROP TYPE IF EXISTS "SectionRenderMode";
DROP TYPE IF EXISTS "StorefrontTemplateType";
