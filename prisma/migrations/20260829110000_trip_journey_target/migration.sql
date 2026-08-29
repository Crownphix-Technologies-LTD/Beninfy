ALTER TABLE "TripJourneySnapshot"
ADD COLUMN "target" TEXT NOT NULL DEFAULT 'pickup';

CREATE INDEX "TripJourneySnapshot_target_calculatedAt_idx"
ON "TripJourneySnapshot"("target", "calculatedAt");
