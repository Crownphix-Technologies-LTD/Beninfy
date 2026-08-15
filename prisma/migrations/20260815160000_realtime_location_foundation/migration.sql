-- Realtime location foundation.
-- Stores latest trip-scoped location and driver presence only.
-- Does not create unlimited GPS history.

CREATE TABLE "DriverPresence" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "lastHeartbeatAt" TIMESTAMP(3),
    "currentBookingLegId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverPresence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LatestTripLocation" (
    "id" TEXT NOT NULL,
    "bookingLegId" TEXT NOT NULL,
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

    CONSTRAINT "LatestTripLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DriverPresence_driverId_key" ON "DriverPresence"("driverId");
CREATE INDEX "DriverPresence_status_lastSeenAt_idx" ON "DriverPresence"("status", "lastSeenAt");
CREATE INDEX "DriverPresence_currentBookingLegId_idx" ON "DriverPresence"("currentBookingLegId");

CREATE UNIQUE INDEX "LatestTripLocation_bookingLegId_key" ON "LatestTripLocation"("bookingLegId");
CREATE INDEX "LatestTripLocation_driverId_receivedAt_idx" ON "LatestTripLocation"("driverId", "receivedAt");
CREATE INDEX "LatestTripLocation_expiresAt_idx" ON "LatestTripLocation"("expiresAt");
CREATE INDEX "LatestTripLocation_bookingLegId_capturedAt_idx" ON "LatestTripLocation"("bookingLegId", "capturedAt");

ALTER TABLE "DriverPresence"
  ADD CONSTRAINT "DriverPresence_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LatestTripLocation"
  ADD CONSTRAINT "LatestTripLocation_bookingLegId_fkey"
  FOREIGN KEY ("bookingLegId") REFERENCES "BookingLeg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LatestTripLocation"
  ADD CONSTRAINT "LatestTripLocation_driverId_fkey"
  FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
