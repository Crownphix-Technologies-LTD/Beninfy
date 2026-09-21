CREATE TABLE "TourFeedback" (
  "id" TEXT NOT NULL,
  "tourBookingId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "overallRating" INTEGER NOT NULL,
  "comment" TEXT,
  "riskFlags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TourFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tour_feedback_rating" CHECK ("overallRating" BETWEEN 1 AND 5),
  CONSTRAINT "tour_feedback_comment" CHECK ("comment" IS NULL OR length("comment") <= 2000),
  CONSTRAINT "TourFeedback_tourBookingId_fkey" FOREIGN KEY ("tourBookingId") REFERENCES "TourBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TourFeedback_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TourFeedback_tourBookingId_key" ON "TourFeedback"("tourBookingId");
CREATE INDEX "TourFeedback_submittedAt_id_idx" ON "TourFeedback"("submittedAt", "id");
CREATE INDEX "TourFeedback_riskFlags_idx" ON "TourFeedback" USING GIN ("riskFlags");

CREATE TABLE "TourDriverFeedback" (
  "id" TEXT NOT NULL,
  "tourFeedbackId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "driverName" TEXT NOT NULL,
  "professionalRespectful" BOOLEAN NOT NULL,
  "feltSafe" BOOLEAN NOT NULL,
  "followedAgreedService" TEXT NOT NULL,
  "uncomfortablePersonalQuestions" BOOLEAN NOT NULL,
  "offPlatformSolicitation" BOOLEAN NOT NULL,
  "unauthorizedPaymentRequest" BOOLEAN NOT NULL,
  "comment" TEXT,
  "riskFlags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "TourDriverFeedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tour_driver_service_answer" CHECK ("followedAgreedService" IN ('yes', 'no', 'not_applicable')),
  CONSTRAINT "tour_driver_feedback_comment" CHECK ("comment" IS NULL OR length("comment") <= 1000),
  CONSTRAINT "TourDriverFeedback_tourFeedbackId_fkey" FOREIGN KEY ("tourFeedbackId") REFERENCES "TourFeedback"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TourDriverFeedback_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TourDriverFeedback_tourFeedbackId_driverId_key" ON "TourDriverFeedback"("tourFeedbackId", "driverId");
CREATE INDEX "TourDriverFeedback_driverId_idx" ON "TourDriverFeedback"("driverId");

CREATE TABLE "TourFeedbackDay" (
  "id" TEXT NOT NULL,
  "tourDriverFeedbackId" TEXT NOT NULL,
  "tourBookingDayId" TEXT NOT NULL,
  "sourceTourId" TEXT,
  "tourTitle" TEXT NOT NULL,
  "dayNumber" INTEGER NOT NULL,
  "scheduledDate" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TourFeedbackDay_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TourFeedbackDay_tourDriverFeedbackId_fkey" FOREIGN KEY ("tourDriverFeedbackId") REFERENCES "TourDriverFeedback"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TourFeedbackDay_tourBookingDayId_fkey" FOREIGN KEY ("tourBookingDayId") REFERENCES "TourBookingDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TourFeedbackDay_tourDriverFeedbackId_tourBookingDayId_key" ON "TourFeedbackDay"("tourDriverFeedbackId", "tourBookingDayId");
CREATE INDEX "TourFeedbackDay_tourBookingDayId_idx" ON "TourFeedbackDay"("tourBookingDayId");
