-- Sales analytics becomes part of every paid tier.
--
-- The seed in prisma/plan-catalog.ts creates missing plans and deliberately
-- leaves existing rows alone (an admin editing a price in /admin/plans must not
-- be overwritten by the next deploy). So changing the catalog does nothing to a
-- database that already has these plans in it, and STARTER/BUSINESS would keep
-- selling analytics as a paid add-on that nobody bought — leaving the page
-- locked for merchants who are paying for the product.
--
-- Scoped to `isDefault = false`, which is the free tier and only the free tier.
-- Analytics stays unavailable there on purpose: it is the one thing that makes
-- the first paid step worth taking.
UPDATE "Plan"
SET "advancedAnalytics" = 'INCLUDED'
WHERE "isDefault" = false
  AND "advancedAnalytics" <> 'INCLUDED';
