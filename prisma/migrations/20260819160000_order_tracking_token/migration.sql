-- The customer's public tracking link.
--
-- A cash-on-delivery buyer has no account, so there is nothing to authenticate
-- them against and the URL itself has to be the credential. Unique and indexed
-- because it is the sole lookup key for the page.
ALTER TABLE "Order" ADD COLUMN "trackingToken" TEXT;

CREATE UNIQUE INDEX "Order_trackingToken_key" ON "Order"("trackingToken");
