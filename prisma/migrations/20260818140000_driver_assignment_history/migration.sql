CREATE TABLE "DriverTripAssignmentHistory" (
  "id" TEXT NOT NULL,
  "bookingLegId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "supersededAt" TIMESTAMP(3),
  "releaseReason" TEXT,
  "releaseSource" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DriverTripAssignmentHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DriverTripAssignmentHistory_bookingLegId_assignedAt_idx"
ON "DriverTripAssignmentHistory"("bookingLegId", "assignedAt");

CREATE INDEX "DriverTripAssignmentHistory_driverId_assignedAt_idx"
ON "DriverTripAssignmentHistory"("driverId", "assignedAt");

CREATE INDEX "DriverTripAssignmentHistory_driverId_completedAt_idx"
ON "DriverTripAssignmentHistory"("driverId", "completedAt");

CREATE INDEX "DriverTripAssignmentHistory_bookingLegId_driverId_assignedAt_idx"
ON "DriverTripAssignmentHistory"("bookingLegId", "driverId", "assignedAt");

ALTER TABLE "DriverTripAssignmentHistory"
ADD CONSTRAINT "DriverTripAssignmentHistory_bookingLegId_fkey"
FOREIGN KEY ("bookingLegId") REFERENCES "BookingLeg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DriverTripAssignmentHistory"
ADD CONSTRAINT "DriverTripAssignmentHistory_driverId_fkey"
FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "DriverTripAssignmentHistory" (
  "id",
  "bookingLegId",
  "driverId",
  "assignedAt",
  "acceptedAt",
  "declinedAt",
  "releasedAt",
  "completedAt",
  "releaseReason",
  "releaseSource",
  "createdAt",
  "updatedAt"
)
SELECT
  concat(
    'dah_',
    substr(md5("id" || ':' || "driverId" || ':' || coalesce("assignedAt"::text, "createdAt"::text)), 1, 24)
  ),
  "id",
  "driverId",
  coalesce("assignedAt", "createdAt"),
  "acceptedAt",
  NULL,
  CASE WHEN "status" = 'cancelled' THEN coalesce("cancelledAt", "updatedAt") ELSE NULL END,
  CASE WHEN "status" = 'completed' THEN coalesce("completedAt", "updatedAt") ELSE NULL END,
  CASE WHEN "status" = 'cancelled' THEN coalesce("cancellationReasonCode", 'booking_cancelled') ELSE NULL END,
  CASE WHEN "status" = 'cancelled' THEN coalesce("cancelledBy", 'system') ELSE NULL END,
  coalesce("assignedAt", "createdAt"),
  CURRENT_TIMESTAMP
FROM "BookingLeg"
WHERE "driverId" IS NOT NULL;
