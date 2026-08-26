-- What the discount code was worth, apart from every other discount on the
-- order. Needed so an edit can re-judge the code without also re-judging the
-- bundle saving and the gift that share `discountTotalCents` with it.
ALTER TABLE "Order" ADD COLUMN "couponDiscountCents" INTEGER NOT NULL DEFAULT 0;
