ALTER TABLE "TourItineraryStop"
  ALTER COLUMN "address" DROP NOT NULL,
  ALTER COLUMN "latitude" DROP NOT NULL,
  ALTER COLUMN "longitude" DROP NOT NULL;

ALTER TABLE "TourItineraryStop" ADD CONSTRAINT "tour_template_stop_complete_location"
  CHECK (
    ("address" IS NULL AND "latitude" IS NULL AND "longitude" IS NULL)
    OR (
      "address" IS NOT NULL AND length(trim("address")) > 0
      AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL
      AND "latitude" BETWEEN -90 AND 90
      AND "longitude" BETWEEN -180 AND 180
    )
  );
