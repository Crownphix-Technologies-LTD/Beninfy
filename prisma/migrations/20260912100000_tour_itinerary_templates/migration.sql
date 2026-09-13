CREATE TABLE "TourItineraryDay" (
  "id" TEXT NOT NULL,
  "tourId" TEXT NOT NULL,
  "dayNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "titleFr" TEXT,
  "description" TEXT,
  "descriptionFr" TEXT,
  "defaultStartLabel" TEXT,
  "defaultStartAddress" TEXT,
  "defaultStartLatitude" DOUBLE PRECISION,
  "defaultStartLongitude" DOUBLE PRECISION,
  "defaultEndLabel" TEXT,
  "defaultEndAddress" TEXT,
  "defaultEndLatitude" DOUBLE PRECISION,
  "defaultEndLongitude" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TourItineraryDay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TourItineraryStop" (
  "id" TEXT NOT NULL,
  "itineraryDayId" TEXT NOT NULL,
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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TourItineraryStop_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TourItineraryDay_tourId_dayNumber_key"
ON "TourItineraryDay"("tourId", "dayNumber");

CREATE INDEX "TourItineraryDay_tourId_dayNumber_idx"
ON "TourItineraryDay"("tourId", "dayNumber");

CREATE UNIQUE INDEX "TourItineraryStop_itineraryDayId_sortOrder_key"
ON "TourItineraryStop"("itineraryDayId", "sortOrder");

CREATE INDEX "TourItineraryStop_itineraryDayId_sortOrder_idx"
ON "TourItineraryStop"("itineraryDayId", "sortOrder");

ALTER TABLE "TourItineraryDay"
ADD CONSTRAINT "TourItineraryDay_tourId_fkey"
FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TourItineraryStop"
ADD CONSTRAINT "TourItineraryStop_itineraryDayId_fkey"
FOREIGN KEY ("itineraryDayId") REFERENCES "TourItineraryDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
