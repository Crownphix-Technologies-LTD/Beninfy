CREATE TABLE "TourBooking" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tourId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'payment_pending',
  "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
  "currencyCode" TEXT NOT NULL DEFAULT 'NGN',
  "priceNGN" INTEGER NOT NULL,
  "amountPaidNGN" INTEGER NOT NULL DEFAULT 0,
  "paymentProvider" TEXT,
  "paymentReference" TEXT,
  "idempotencyKey" TEXT,
  "tourTitle" TEXT NOT NULL,
  "tourTitleFr" TEXT,
  "tourDestination" TEXT,
  "tourDestinationFr" TEXT,
  "tourCountry" TEXT NOT NULL,
  "tourCountryFr" TEXT,
  "tourImage" TEXT,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "travellers" INTEGER NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TourBooking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TourBookingDay" (
  "id" TEXT NOT NULL,
  "tourBookingId" TEXT NOT NULL,
  "sourceItineraryDayId" TEXT,
  "dayNumber" INTEGER NOT NULL,
  "scheduledDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'upcoming',
  "title" TEXT NOT NULL,
  "titleFr" TEXT,
  "description" TEXT,
  "descriptionFr" TEXT,
  "pickupLabel" TEXT,
  "pickupAddress" TEXT,
  "pickupLatitude" DOUBLE PRECISION,
  "pickupLongitude" DOUBLE PRECISION,
  "endLabel" TEXT,
  "endAddress" TEXT,
  "endLatitude" DOUBLE PRECISION,
  "endLongitude" DOUBLE PRECISION,
  "assignedDriverId" TEXT,
  "assignedFleetVehicleId" TEXT,
  "assignedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "driverEnRouteAt" TIMESTAMP(3),
  "driverArrivedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TourBookingDay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TourStopExecution" (
  "id" TEXT NOT NULL,
  "tourBookingDayId" TEXT NOT NULL,
  "sourceItineraryStopId" TEXT,
  "sortOrder" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "titleFr" TEXT,
  "description" TEXT,
  "descriptionFr" TEXT,
  "address" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "estimatedDurationMinutes" INTEGER,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'upcoming',
  "enRouteAt" TIMESTAMP(3),
  "arrivedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "skippedAt" TIMESTAMP(3),
  "skipReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TourStopExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TourBooking_reference_key" ON "TourBooking"("reference");
CREATE UNIQUE INDEX "TourBooking_userId_idempotencyKey_key"
ON "TourBooking"("userId", "idempotencyKey");
CREATE INDEX "TourBooking_userId_createdAt_idx" ON "TourBooking"("userId", "createdAt");
CREATE INDEX "TourBooking_tourId_startDate_idx" ON "TourBooking"("tourId", "startDate");
CREATE INDEX "TourBooking_status_startDate_idx" ON "TourBooking"("status", "startDate");
CREATE INDEX "TourBooking_paymentStatus_createdAt_idx" ON "TourBooking"("paymentStatus", "createdAt");

CREATE UNIQUE INDEX "TourBookingDay_tourBookingId_dayNumber_key"
ON "TourBookingDay"("tourBookingId", "dayNumber");
CREATE INDEX "TourBookingDay_tourBookingId_scheduledDate_idx"
ON "TourBookingDay"("tourBookingId", "scheduledDate");
CREATE INDEX "TourBookingDay_assignedDriverId_scheduledDate_idx"
ON "TourBookingDay"("assignedDriverId", "scheduledDate");
CREATE INDEX "TourBookingDay_assignedFleetVehicleId_scheduledDate_idx"
ON "TourBookingDay"("assignedFleetVehicleId", "scheduledDate");
CREATE INDEX "TourBookingDay_status_scheduledDate_idx"
ON "TourBookingDay"("status", "scheduledDate");

CREATE UNIQUE INDEX "TourStopExecution_tourBookingDayId_sortOrder_key"
ON "TourStopExecution"("tourBookingDayId", "sortOrder");
CREATE INDEX "TourStopExecution_tourBookingDayId_sortOrder_idx"
ON "TourStopExecution"("tourBookingDayId", "sortOrder");
CREATE INDEX "TourStopExecution_status_idx" ON "TourStopExecution"("status");

ALTER TABLE "TourBooking"
ADD CONSTRAINT "TourBooking_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TourBooking"
ADD CONSTRAINT "TourBooking_tourId_fkey"
FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TourBookingDay"
ADD CONSTRAINT "TourBookingDay_tourBookingId_fkey"
FOREIGN KEY ("tourBookingId") REFERENCES "TourBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TourBookingDay"
ADD CONSTRAINT "TourBookingDay_assignedDriverId_fkey"
FOREIGN KEY ("assignedDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TourBookingDay"
ADD CONSTRAINT "TourBookingDay_assignedFleetVehicleId_fkey"
FOREIGN KEY ("assignedFleetVehicleId") REFERENCES "FleetVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TourStopExecution"
ADD CONSTRAINT "TourStopExecution_tourBookingDayId_fkey"
FOREIGN KEY ("tourBookingDayId") REFERENCES "TourBookingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
