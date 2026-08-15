-- Customer mobile payment flow metadata.
-- Additive only. Apply after 20260815200000_trip_chat_foundation.

ALTER TABLE "Payment"
  ADD COLUMN "providerCheckoutUrl" TEXT,
  ADD COLUMN "providerAccessCode" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "failureCode" TEXT;

CREATE INDEX "Payment_bookingId_status_createdAt_idx" ON "Payment"("bookingId", "status", "createdAt");
