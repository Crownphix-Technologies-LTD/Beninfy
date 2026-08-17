-- Customer mobile product completion primitives.
-- Additive only: no existing production data is modified.

CREATE TABLE "SavedPlace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "country" TEXT,
    "city" TEXT,
    "providerPlaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPlace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerTravelPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredVehicleId" TEXT,
    "defaultPassengers" INTEGER,
    "defaultPickupInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerTravelPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TripReview" (
    "id" TEXT NOT NULL,
    "bookingLegId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentResolution" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'review_required',
    "reason" TEXT NOT NULL,
    "amountNGN" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'NGN',
    "provider" TEXT NOT NULL,
    "providerReference" TEXT,
    "customerMessageCode" TEXT,
    "requestedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "processingAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentResolution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedPlace_userId_type_idx" ON "SavedPlace"("userId", "type");
CREATE INDEX "SavedPlace_userId_updatedAt_idx" ON "SavedPlace"("userId", "updatedAt");

CREATE UNIQUE INDEX "CustomerTravelPreference_userId_key" ON "CustomerTravelPreference"("userId");
CREATE INDEX "CustomerTravelPreference_preferredVehicleId_idx" ON "CustomerTravelPreference"("preferredVehicleId");

CREATE UNIQUE INDEX "TripReview_bookingLegId_key" ON "TripReview"("bookingLegId");
CREATE INDEX "TripReview_customerId_createdAt_idx" ON "TripReview"("customerId", "createdAt");
CREATE INDEX "TripReview_driverId_createdAt_idx" ON "TripReview"("driverId", "createdAt");

CREATE UNIQUE INDEX "PaymentResolution_paymentId_key" ON "PaymentResolution"("paymentId");
CREATE INDEX "PaymentResolution_customerId_status_createdAt_idx" ON "PaymentResolution"("customerId", "status", "createdAt");
CREATE INDEX "PaymentResolution_bookingId_idx" ON "PaymentResolution"("bookingId");
CREATE INDEX "PaymentResolution_status_createdAt_idx" ON "PaymentResolution"("status", "createdAt");

ALTER TABLE "SavedPlace" ADD CONSTRAINT "SavedPlace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerTravelPreference" ADD CONSTRAINT "CustomerTravelPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripReview" ADD CONSTRAINT "TripReview_bookingLegId_fkey" FOREIGN KEY ("bookingLegId") REFERENCES "BookingLeg"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripReview" ADD CONSTRAINT "TripReview_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripReview" ADD CONSTRAINT "TripReview_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentResolution" ADD CONSTRAINT "PaymentResolution_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentResolution" ADD CONSTRAINT "PaymentResolution_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentResolution" ADD CONSTRAINT "PaymentResolution_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
