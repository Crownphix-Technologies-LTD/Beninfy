ALTER TABLE "Coupon"
  ADD COLUMN "applicability" TEXT NOT NULL DEFAULT 'ride',
  ADD COLUMN "maxDiscountNGN" INTEGER,
  ADD COLUMN "maxPerCustomer" INTEGER,
  ADD CONSTRAINT "coupon_applicability" CHECK ("applicability" IN ('ride', 'tour', 'both')),
  ADD CONSTRAINT "coupon_max_discount" CHECK ("maxDiscountNGN" IS NULL OR "maxDiscountNGN" > 0),
  ADD CONSTRAINT "coupon_customer_limit" CHECK ("maxPerCustomer" IS NULL OR "maxPerCustomer" > 0);

ALTER TABLE "TourBooking"
  ADD COLUMN "subtotalNGN" INTEGER,
  ADD COLUMN "discountNGN" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "couponSnapshot" JSONB;
UPDATE "TourBooking" SET "subtotalNGN" = "priceNGN";
ALTER TABLE "Payment" ADD COLUMN "tourPricingSnapshot" JSONB;

CREATE TABLE "TourCouponUse" (
  "id" TEXT NOT NULL,
  "couponId" TEXT NOT NULL,
  "tourBookingId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'reserved',
  "expiresAt" TIMESTAMP(3),
  "redeemedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TourCouponUse_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tour_coupon_use_status" CHECK ("status" IN ('reserved', 'redeemed', 'released')),
  CONSTRAINT "TourCouponUse_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TourCouponUse_tourBookingId_fkey" FOREIGN KEY ("tourBookingId") REFERENCES "TourBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TourCouponUse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TourCouponUse_tourBookingId_key" ON "TourCouponUse"("tourBookingId");
CREATE INDEX "TourCouponUse_couponId_status_expiresAt_idx" ON "TourCouponUse"("couponId", "status", "expiresAt");
CREATE INDEX "TourCouponUse_userId_couponId_status_idx" ON "TourCouponUse"("userId", "couponId", "status");
