-- Add explicit Tour payment ownership and Tour live tracking models.

ALTER TABLE "Payment" ADD COLUMN "tourBookingId" TEXT;
ALTER TABLE "Payment" ALTER COLUMN "bookingId" DROP NOT NULL;

CREATE TABLE "LatestTourLocation" (
    "id" TEXT NOT NULL,
    "tourBookingDayId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracyMeters" DOUBLE PRECISION,
    "headingDegrees" DOUBLE PRECISION,
    "speedMetersPerSecond" DOUBLE PRECISION,
    "sequence" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sourceSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LatestTourLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TourJourneySnapshot" (
    "id" TEXT NOT NULL,
    "tourBookingDayId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "targetStopId" TEXT,
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

    CONSTRAINT "TourJourneySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LatestTourLocation_tourBookingDayId_key" ON "LatestTourLocation"("tourBookingDayId");
CREATE INDEX "LatestTourLocation_driverId_receivedAt_idx" ON "LatestTourLocation"("driverId", "receivedAt");
CREATE INDEX "LatestTourLocation_expiresAt_idx" ON "LatestTourLocation"("expiresAt");
CREATE INDEX "LatestTourLocation_tourBookingDayId_capturedAt_idx" ON "LatestTourLocation"("tourBookingDayId", "capturedAt");

CREATE UNIQUE INDEX "TourJourneySnapshot_tourBookingDayId_key" ON "TourJourneySnapshot"("tourBookingDayId");
CREATE INDEX "TourJourneySnapshot_expiresAt_idx" ON "TourJourneySnapshot"("expiresAt");
CREATE INDEX "TourJourneySnapshot_calculatedAt_idx" ON "TourJourneySnapshot"("calculatedAt");
CREATE INDEX "TourJourneySnapshot_target_targetStopId_calculatedAt_idx" ON "TourJourneySnapshot"("target", "targetStopId", "calculatedAt");

CREATE INDEX "Payment_tourBookingId_createdAt_idx" ON "Payment"("tourBookingId", "createdAt");
CREATE INDEX "Payment_tourBookingId_status_createdAt_idx" ON "Payment"("tourBookingId", "status", "createdAt");

ALTER TABLE "LatestTourLocation" ADD CONSTRAINT "LatestTourLocation_tourBookingDayId_fkey" FOREIGN KEY ("tourBookingDayId") REFERENCES "TourBookingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LatestTourLocation" ADD CONSTRAINT "LatestTourLocation_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TourJourneySnapshot" ADD CONSTRAINT "TourJourneySnapshot_tourBookingDayId_fkey" FOREIGN KEY ("tourBookingDayId") REFERENCES "TourBookingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tourBookingId_fkey" FOREIGN KEY ("tourBookingId") REFERENCES "TourBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_exactly_one_owner_check" CHECK (
    ("bookingId" IS NOT NULL AND "tourBookingId" IS NULL)
    OR
    ("bookingId" IS NULL AND "tourBookingId" IS NOT NULL)
);
