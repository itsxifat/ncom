-- Bring the two cancellation signals into agreement.
--
-- An order carries both `workflowState` (where the parcel is) and `cancelledAt`
-- (when it was stopped). Cancelling only ever wrote the second, so the order
-- list — which reads the first — went on showing "Pending" or "Processing" for
-- orders the detail page called cancelled. The writers keep both in step now;
-- these two statements fix the rows written before they did.

-- Cancelled, but the pipeline never heard about it. Guarded on the clock rather
-- than applied blindly: an order whose parcel kept moving *after* the
-- cancellation is left where the courier put it, which is what the screens now
-- show for it too.
UPDATE "Order"
SET "workflowState"     = 'CANCELLED',
    "workflowUpdatedAt" = "cancelledAt"
WHERE "cancelledAt" IS NOT NULL
  AND "workflowState" <> 'CANCELLED'
  AND "cancelledAt" >= "workflowUpdatedAt";

-- The same drift the other way: a courier cancelled the consignment and the
-- order state followed it, but nothing recorded *when* — so analytics counted
-- the order as live and the edit and refund panels went on offering
-- themselves. No reason is invented for these; nobody recorded one.
UPDATE "Order"
SET "cancelledAt" = "workflowUpdatedAt"
WHERE "workflowState" = 'CANCELLED'
  AND "cancelledAt" IS NULL;
