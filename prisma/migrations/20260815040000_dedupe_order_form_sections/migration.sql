-- Enforces the order form's singleton rule on existing pages.
--
-- The previous migration renamed `order-form` rows to `orderform` without
-- deduplicating, so a page that already had both shapes came out with two order
-- forms. Two order forms on one funnel is two carts: the buyer can fill one and
-- submit the other, and the totals they read need not be the ones they are
-- charged.
--
-- Keeps the earliest by position on each page and drops the rest. Content is
-- wording only — what a page sells lives on Offer rows, not here — so nothing
-- a merchant configured is lost with the duplicate.

DELETE FROM "PageSection" ps
WHERE ps."type" = 'orderform'
  AND ps.id <> (
    SELECT keep.id
    FROM "PageSection" keep
    WHERE keep."pageId" = ps."pageId"
      AND keep."type" = 'orderform'
    ORDER BY keep."order", keep."createdAt", keep.id
    LIMIT 1
  );
