-- Historical bookings retain their existing day snapshots; no pickup is fabricated.
ALTER TABLE "TourBooking"
  ADD COLUMN "pickupLabel" TEXT,
  ADD COLUMN "pickupAddress" TEXT,
  ADD COLUMN "pickupLatitude" DOUBLE PRECISION,
  ADD COLUMN "pickupLongitude" DOUBLE PRECISION;
