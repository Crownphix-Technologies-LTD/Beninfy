-- Production trip lifecycle foundation.
-- Additive operational timestamps/metadata for BookingLeg.

ALTER TABLE "BookingLeg" ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3);
ALTER TABLE "BookingLeg" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);
ALTER TABLE "BookingLeg" ADD COLUMN IF NOT EXISTS "declinedAt" TIMESTAMP(3);
ALTER TABLE "BookingLeg" ADD COLUMN IF NOT EXISTS "enRouteAt" TIMESTAMP(3);
ALTER TABLE "BookingLeg" ADD COLUMN IF NOT EXISTS "arrivedAt" TIMESTAMP(3);
ALTER TABLE "BookingLeg" ADD COLUMN IF NOT EXISTS "passengerOnboardAt" TIMESTAMP(3);
ALTER TABLE "BookingLeg" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);
ALTER TABLE "BookingLeg" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "BookingLeg" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "BookingLeg" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;
ALTER TABLE "BookingLeg" ADD COLUMN IF NOT EXISTS "cancellationReasonCode" TEXT;
ALTER TABLE "BookingLeg" ADD COLUMN IF NOT EXISTS "declineReasonCode" TEXT;

-- Backfill evidence timestamps where an existing terminal/assigned state exists.
UPDATE "BookingLeg"
SET "assignedAt" = COALESCE("assignedAt", "updatedAt")
WHERE "status" IN ('assigned', 'dispatched')
  AND "assignedAt" IS NULL;

UPDATE "BookingLeg"
SET "enRouteAt" = COALESCE("enRouteAt", "updatedAt")
WHERE "status" = 'dispatched'
  AND "enRouteAt" IS NULL;

UPDATE "BookingLeg"
SET "completedAt" = COALESCE("completedAt", "updatedAt")
WHERE "status" = 'completed'
  AND "completedAt" IS NULL;

UPDATE "BookingLeg"
SET "cancelledAt" = COALESCE("cancelledAt", "updatedAt"),
    "cancelledBy" = COALESCE("cancelledBy", 'system')
WHERE "status" = 'cancelled'
  AND "cancelledAt" IS NULL;

DROP INDEX IF EXISTS "BookingLeg_active_fleet_vehicle_day_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "BookingLeg_active_fleet_vehicle_day_unique"
  ON "BookingLeg"("fleetVehicleId", (date_trunc('day', "departureDate")))
  WHERE "fleetVehicleId" IS NOT NULL
    AND "status" IN (
      'reserved',
      'unassigned',
      'assigned',
      'dispatched',
      'driver_en_route',
      'driver_arrived',
      'passenger_onboard',
      'in_progress'
    );
