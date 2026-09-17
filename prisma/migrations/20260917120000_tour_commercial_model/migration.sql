ALTER TABLE "Vehicle" ADD COLUMN "tourPricingCategory" TEXT;
ALTER TABLE "Tour" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "transportationOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TourItineraryStop" ADD COLUMN "addonCode" TEXT;
ALTER TABLE "TourBooking" ADD COLUMN "selectedTourIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "vehicleCategoryId" TEXT, ADD COLUMN "vehicleCategoryName" TEXT,
  ADD COLUMN "vehicleCapacity" INTEGER,
  ADD COLUMN "itineraryMode" TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN "customItinerary" TEXT,
  ADD COLUMN "quoteStatus" TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN "quotedAt" TIMESTAMP(3), ADD COLUMN "commercialSnapshot" JSONB;
ALTER TABLE "TourBookingDay" ADD COLUMN "sourceTourId" TEXT, ADD COLUMN "sourceTourTitle" TEXT,
  ADD COLUMN "transportationOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "componentPriceMinor" INTEGER, ADD COLUMN "gogotinkpo" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "TourCommercialRate" (
  "id" TEXT PRIMARY KEY, "priceMinor" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tour_rate_whole_naira" CHECK ("priceMinor" > 0 AND "priceMinor" % 500 = 0)
);
INSERT INTO "TourCommercialRate" ("id", "priceMinor") VALUES
  ('sedan',10000000),('sienna',15000000),('suv',17500000),('odyssey',20000000),('gx460',20000000);
UPDATE "Vehicle" SET "tourPricingCategory" = CASE "id"
  WHEN 'saloon' THEN 'sedan' WHEN 'sienna' THEN 'sienna' WHEN 'suv' THEN 'suv' END
WHERE "id" IN ('saloon','sienna','suv');
-- Preserve every historical Tour and its execution templates. Legacy products are archived.
INSERT INTO "Tour" ("id","title","titleFr","destination","country","durationDays","startingFromNGN","description","descriptionFr","active","transportationOnly","updatedAt") VALUES
 ('cotonou-city-tour','Cotonou City Tour','Visite de Cotonou','Cotonou','Benin Republic',1,100000,'Private Cotonou City Tour. Gogotinkpo is an optional add-on.','Visite privee de Cotonou. Gogotinkpo est une option.',true,false,CURRENT_TIMESTAMP),
 ('ouidah-tour','Ouidah Tour','Visite de Ouidah','Ouidah','Benin Republic',1,100000,'Private Ouidah Tour with pickup in Cotonou.','Visite privee de Ouidah au depart de Cotonou.',true,false,CURRENT_TIMESTAMP),
 ('ganvie-tour','Ganvie Tour','Visite de Ganvie','Ganvie','Benin Republic',1,100000,'Transportation only. Boat trips, guides and admission are not included.','Transport uniquement. Bateau, guides et entrees non inclus.',true,true,CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
UPDATE "Tour" SET "transportationOnly" = true WHERE id = 'ganvie-tour';
UPDATE "Tour" canonical SET image = legacy.image
FROM "Tour" legacy WHERE legacy.id = 'benin-history-lake'
  AND canonical.id IN ('cotonou-city-tour','ouidah-tour','ganvie-tour') AND canonical.image IS NULL;
UPDATE "TourBooking" SET "selectedTourIds" = ARRAY["tourId"];
UPDATE "TourBookingDay" d SET "sourceTourId" = b."tourId", "sourceTourTitle" = b."tourTitle"
FROM "TourBooking" b WHERE b.id = d."tourBookingId";

-- Reuse an unambiguous, configured legacy day by its exact approved product name.
-- Missing/ambiguous templates remain unready until Operations configures them.
WITH source AS (
  SELECT d.*, CASE
    WHEN d.title = 'Cotonou City Tour' THEN 'cotonou-city-tour'
    WHEN d.title = 'Ouidah Tour' THEN 'ouidah-tour'
    WHEN d.title IN ('Ganvié','Ganvie','Ganvié Tour','Ganvie Tour') THEN 'ganvie-tour'
  END AS canonical_id
  FROM "TourItineraryDay" d WHERE d."tourId" = 'benin-history-lake'
), unambiguous AS (
  SELECT canonical_id FROM source WHERE canonical_id IS NOT NULL GROUP BY canonical_id HAVING count(*) = 1
)
INSERT INTO "TourItineraryDay" (
  id,"tourId","dayNumber",title,"titleFr",description,"descriptionFr",
  "defaultStartLabel","defaultStartAddress","defaultStartLatitude","defaultStartLongitude",
  "defaultEndLabel","defaultEndAddress","defaultEndLatitude","defaultEndLongitude","updatedAt"
)
SELECT 'commercial-' || s.id,s.canonical_id,1,s.title,s."titleFr",s.description,s."descriptionFr",
  s."defaultStartLabel",s."defaultStartAddress",s."defaultStartLatitude",s."defaultStartLongitude",
  s."defaultEndLabel",s."defaultEndAddress",s."defaultEndLatitude",s."defaultEndLongitude",CURRENT_TIMESTAMP
FROM source s JOIN unambiguous u ON u.canonical_id = s.canonical_id
WHERE NOT EXISTS (SELECT 1 FROM "TourItineraryDay" existing WHERE existing."tourId" = s.canonical_id)
ON CONFLICT DO NOTHING;
INSERT INTO "TourItineraryStop" (
  id,"itineraryDayId","sortOrder",title,"titleFr",description,"descriptionFr",address,
  latitude,longitude,"estimatedDurationMinutes",required,"addonCode","updatedAt"
)
SELECT 'commercial-' || s.id,d.id,s."sortOrder",s.title,s."titleFr",s.description,s."descriptionFr",s.address,
  s.latitude,s.longitude,s."estimatedDurationMinutes",s.required,
  CASE WHEN d."tourId" = 'cotonou-city-tour' AND lower(trim(s.title)) = 'gogotinkpo' THEN 'gogotinkpo' ELSE s."addonCode" END,
  CURRENT_TIMESTAMP
FROM "TourItineraryStop" s JOIN "TourItineraryDay" d ON d.id = 'commercial-' || s."itineraryDayId"
ON CONFLICT DO NOTHING;
