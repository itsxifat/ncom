-- The idempotency key of the last change accepted from the merchant's website.
--
-- Revisions are per-side counters, so "their revision is lower than mine" does
-- not mean "old news" once the two have each applied something the other has
-- not seen. Without the key, a genuinely divergent change is indistinguishable
-- from a retry and is silently swallowed.
ALTER TABLE "OrderForward" ADD COLUMN "lastInboundKey" TEXT;
