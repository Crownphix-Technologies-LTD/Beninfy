CREATE TYPE "DriverSearchStatus" AS ENUM ('idle', 'searching');

-- Existing reservations and unassigned legs are NOT an active search.
ALTER TABLE "BookingLeg"
ADD COLUMN "driverSearchStatus" "DriverSearchStatus" NOT NULL DEFAULT 'idle';

ALTER TABLE "BookingLeg"
ADD CONSTRAINT "BookingLeg_driver_search_eligible_check" CHECK (
  "driverSearchStatus" = 'idle'
  OR ("driverId" IS NULL AND "status" IN ('reserved', 'unassigned', 'assigned'))
);
