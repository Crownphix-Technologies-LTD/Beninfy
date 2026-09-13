ALTER TABLE "User"
ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN "scheduledDeletionAt" TIMESTAMP(3),
ADD COLUMN "deletionCancelledAt" TIMESTAMP(3),
ADD COLUMN "anonymizedAt" TIMESTAMP(3);

CREATE INDEX "User_scheduledDeletionAt_anonymizedAt_idx"
ON "User"("scheduledDeletionAt", "anonymizedAt");

CREATE INDEX "User_deletionRequestedAt_idx"
ON "User"("deletionRequestedAt");
