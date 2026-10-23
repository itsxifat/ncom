-- Freezes the theme every live site shows today, so draft edits stay drafts.
--
-- `liveTheme` arrived empty, and an empty one makes the public renderer read the
-- working columns — the same columns the builder's Design panel and the AI
-- editor's update_site_theme now write as drafts. On a site published before
-- then, trying Bangla or a new palette in the builder, without publishing,
-- reached shoppers as soon as the store cache expired.
--
-- Each live site gets a copy of its columns as they stand: exactly the look it
-- shows today, now held still until the merchant next publishes. The keys are
-- the Prisma field names (the columns are not renamed with @map), and the
-- bookkeeping columns are left out as `freezeTheme` leaves them out. A site
-- with no published page has nothing live to keep and stays null; its first
-- publish freezes it.
UPDATE "ThemeSettings" AS t
SET "liveTheme" = to_jsonb(t) - 'id' - 'storeId' - 'updatedAt' - 'liveTheme'
WHERE t."liveTheme" IS NULL
  AND EXISTS (
    SELECT 1 FROM "Page" AS p
    WHERE p."storeId" = t."storeId" AND p."status" = 'PUBLISHED'
  );

-- A copy frozen before `language` and `numerals` existed was an English site
-- with Latin digits, which is what every site was then. Without the two keys
-- the renderer would fill them from the working columns, and a draft switch to
-- Bangla would go live through the gap.
UPDATE "ThemeSettings"
SET "liveTheme" = '{"language": "en", "numerals": "latin"}'::jsonb || "liveTheme"
WHERE "liveTheme" IS NOT NULL
  AND jsonb_typeof("liveTheme") = 'object'
  AND NOT ("liveTheme" ? 'language' AND "liveTheme" ? 'numerals');
