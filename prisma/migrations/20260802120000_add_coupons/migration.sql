CREATE TABLE "Coupon" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "discountType" TEXT NOT NULL,
  "amountNGN" INTEGER,
  "percent" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "minSpendNGN" INTEGER,
  "maxRedemptions" INTEGER,
  "redeemedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

ALTER TABLE "Booking"
ADD COLUMN "discountNGN" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "couponId" TEXT,
ADD COLUMN "couponCode" TEXT;

CREATE INDEX "Booking_couponId_idx" ON "Booking"("couponId");

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_couponId_fkey"
FOREIGN KEY ("couponId") REFERENCES "Coupon"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
