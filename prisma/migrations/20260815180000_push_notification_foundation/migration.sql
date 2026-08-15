-- Push notification foundation for Beninfy mobile apps.
-- Additive only; do not run against production until prior mobile/realtime migrations are applied.

CREATE TABLE "PushDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "appType" TEXT NOT NULL,
  "principalType" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "deviceId" TEXT,
  "deviceName" TEXT,
  "appVersion" TEXT,
  "language" TEXT NOT NULL DEFAULT 'en',
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "invalidatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "appType" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'en',
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "deliveryState" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "pushDeviceId" TEXT,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushDevice_appType_tokenHash_key" ON "PushDevice"("appType", "tokenHash");
CREATE UNIQUE INDEX "PushDevice_userId_appType_deviceId_key" ON "PushDevice"("userId", "appType", "deviceId");
CREATE INDEX "PushDevice_userId_appType_revokedAt_invalidatedAt_idx" ON "PushDevice"("userId", "appType", "revokedAt", "invalidatedAt");
CREATE INDEX "PushDevice_appType_principalType_platform_idx" ON "PushDevice"("appType", "principalType", "platform");
CREATE INDEX "PushDevice_lastSeenAt_idx" ON "PushDevice"("lastSeenAt");

CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_userId_appType_createdAt_idx" ON "Notification"("userId", "appType", "createdAt");
CREATE INDEX "Notification_userId_appType_readAt_createdAt_idx" ON "Notification"("userId", "appType", "readAt", "createdAt");
CREATE INDEX "Notification_deliveryState_createdAt_idx" ON "Notification"("deliveryState", "createdAt");
CREATE INDEX "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");

CREATE UNIQUE INDEX "NotificationDelivery_notificationId_pushDeviceId_key" ON "NotificationDelivery"("notificationId", "pushDeviceId");
CREATE INDEX "NotificationDelivery_notificationId_idx" ON "NotificationDelivery"("notificationId");
CREATE INDEX "NotificationDelivery_pushDeviceId_idx" ON "NotificationDelivery"("pushDeviceId");
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_idx" ON "NotificationDelivery"("status", "nextAttemptAt");

ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_pushDeviceId_fkey" FOREIGN KEY ("pushDeviceId") REFERENCES "PushDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
