CREATE TABLE "AdminNotificationCampaign" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "actorId" TEXT NOT NULL,
 "requestKey" TEXT NOT NULL,
 "audience" TEXT NOT NULL,
 "recipientId" TEXT,
 "content" JSONB NOT NULL,
 "recipientCount" INTEGER NOT NULL,
 "deviceCount" INTEGER NOT NULL,
 "audienceHash" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'preview',
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "queuedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "AdminNotificationCampaign_requestKey_key" ON "AdminNotificationCampaign"("requestKey");
CREATE INDEX "AdminNotificationCampaign_createdAt_id_idx" ON "AdminNotificationCampaign"("createdAt", "id");
ALTER TABLE "Notification" ADD COLUMN "campaignId" TEXT;
CREATE INDEX "Notification_campaignId_idx" ON "Notification"("campaignId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdminNotificationCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
