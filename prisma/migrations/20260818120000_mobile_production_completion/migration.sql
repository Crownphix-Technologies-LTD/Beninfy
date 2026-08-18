ALTER TABLE "RoutePrice"
ADD COLUMN "managedByCategory" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Booking"
ADD COLUMN "pickupLatitude" DOUBLE PRECISION,
ADD COLUMN "pickupLongitude" DOUBLE PRECISION,
ADD COLUMN "dropoffLatitude" DOUBLE PRECISION,
ADD COLUMN "dropoffLongitude" DOUBLE PRECISION;

CREATE TABLE "TripJourneySnapshot" (
  "id" TEXT NOT NULL,
  "bookingLegId" TEXT NOT NULL,
  "originLatitude" DOUBLE PRECISION NOT NULL,
  "originLongitude" DOUBLE PRECISION NOT NULL,
  "destinationLatitude" DOUBLE PRECISION NOT NULL,
  "destinationLongitude" DOUBLE PRECISION NOT NULL,
  "encodedPolyline" TEXT,
  "distanceMeters" INTEGER,
  "durationSeconds" INTEGER,
  "trafficDurationSeconds" INTEGER,
  "distanceRemainingMeters" INTEGER,
  "estimatedDurationSeconds" INTEGER,
  "estimatedArrivalAt" TIMESTAMP(3),
  "provider" TEXT NOT NULL,
  "providerStatus" TEXT NOT NULL DEFAULT 'ok',
  "calculatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TripJourneySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TripJourneySnapshot_bookingLegId_key" ON "TripJourneySnapshot"("bookingLegId");
CREATE INDEX "TripJourneySnapshot_expiresAt_idx" ON "TripJourneySnapshot"("expiresAt");
CREATE INDEX "TripJourneySnapshot_calculatedAt_idx" ON "TripJourneySnapshot"("calculatedAt");

ALTER TABLE "TripJourneySnapshot"
ADD CONSTRAINT "TripJourneySnapshot_bookingLegId_fkey"
FOREIGN KEY ("bookingLegId") REFERENCES "BookingLeg"("id") ON DELETE CASCADE ON UPDATE CASCADE;
