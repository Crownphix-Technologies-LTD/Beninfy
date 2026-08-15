-- Additive indexes for high-frequency mobile/admin operations.
CREATE INDEX IF NOT EXISTS "MobileSession_userId_revokedAt_expiresAt_idx"
  ON "MobileSession"("userId", "revokedAt", "expiresAt");

CREATE INDEX IF NOT EXISTS "Booking_userId_createdAt_idx"
  ON "Booking"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "Booking_status_createdAt_idx"
  ON "Booking"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "Booking_vehicleId_date_idx"
  ON "Booking"("vehicleId", "date");

CREATE INDEX IF NOT EXISTS "Booking_passengerEmail_idx"
  ON "Booking"("passengerEmail");

CREATE INDEX IF NOT EXISTS "Booking_createdAt_idx"
  ON "Booking"("createdAt");

CREATE INDEX IF NOT EXISTS "FleetVehicle_vehicleId_status_label_idx"
  ON "FleetVehicle"("vehicleId", "status", "label");

CREATE INDEX IF NOT EXISTS "Driver_status_name_idx"
  ON "Driver"("status", "name");

CREATE INDEX IF NOT EXISTS "VehicleBlock_fleetVehicleId_startsAt_endsAt_idx"
  ON "VehicleBlock"("fleetVehicleId", "startsAt", "endsAt");

CREATE INDEX IF NOT EXISTS "BookingLeg_fleetVehicleId_status_departureDate_idx"
  ON "BookingLeg"("fleetVehicleId", "status", "departureDate");

CREATE INDEX IF NOT EXISTS "BookingLeg_driverId_status_departureDate_idx"
  ON "BookingLeg"("driverId", "status", "departureDate");

CREATE INDEX IF NOT EXISTS "BookingLeg_status_departureDate_idx"
  ON "BookingLeg"("status", "departureDate");

CREATE INDEX IF NOT EXISTS "Payment_bookingId_createdAt_idx"
  ON "Payment"("bookingId", "createdAt");

CREATE INDEX IF NOT EXISTS "Payment_status_createdAt_idx"
  ON "Payment"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "Payment_provider_status_createdAt_idx"
  ON "Payment"("provider", "status", "createdAt");

-- Authoritative reservation guard. Multiple unpaid payment_pending legs can
-- exist, but only one active reserved/assigned/dispatched leg may hold a
-- physical fleet unit for the same service day.
CREATE UNIQUE INDEX IF NOT EXISTS "BookingLeg_active_fleet_vehicle_day_unique"
  ON "BookingLeg"("fleetVehicleId", (date_trunc('day', "departureDate")))
  WHERE "fleetVehicleId" IS NOT NULL
    AND "status" IN ('reserved', 'unassigned', 'assigned', 'dispatched');
