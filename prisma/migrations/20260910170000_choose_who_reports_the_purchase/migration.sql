-- Naming one side as the reporter of a handed-over sale.
--
-- Merchants run the same Meta pixel on their NCOM landing pages and on the
-- website their orders are handed to, so both sides were reporting the same
-- purchase under different event ids and Meta was counting each sale twice.
--
-- The default is OWN_WEBSITE, which changes behaviour for workspaces already
-- handing orders over — deliberately, because that is the broken case. It is
-- inert for everyone else: an order NCOM processes itself is always reported
-- by NCOM, whatever this column holds.
CREATE TYPE "PurchaseReporting" AS ENUM ('NCOM', 'OWN_WEBSITE');

ALTER TABLE "OrderDestination"
  ADD COLUMN "purchaseReporting" "PurchaseReporting" NOT NULL DEFAULT 'OWN_WEBSITE';
