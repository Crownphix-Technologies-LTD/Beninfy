-- Existing Ride coupon rows were counted at booking creation. Mark them as
-- already accounted for so provider retries cannot increment them again.
ALTER TABLE "Booking" ADD COLUMN "couponRedeemedAt" TIMESTAMP(3);

UPDATE "Booking"
SET "couponRedeemedAt" = "createdAt"
WHERE "couponId" IS NOT NULL;
