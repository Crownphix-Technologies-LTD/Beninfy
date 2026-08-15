-- Trip-scoped customer-driver chat foundation.
-- Additive only. Apply after 20260815180000_push_notification_foundation.

CREATE TABLE "TripConversation" (
  "id" TEXT NOT NULL,
  "bookingLegId" TEXT NOT NULL,
  "customerUserId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "closedAt" TIMESTAMP(3),
  "closedReason" TEXT,
  "customerLastReadAt" TIMESTAMP(3),
  "driverLastReadAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TripConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "bookingLegId" TEXT NOT NULL,
  "senderType" TEXT NOT NULL,
  "senderUserId" TEXT,
  "senderDriverId" TEXT,
  "messageType" TEXT NOT NULL DEFAULT 'text',
  "text" TEXT,
  "systemCode" TEXT,
  "clientMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TripConversation_bookingLegId_driverId_key" ON "TripConversation"("bookingLegId", "driverId");
CREATE INDEX "TripConversation_bookingLegId_status_idx" ON "TripConversation"("bookingLegId", "status");
CREATE INDEX "TripConversation_customerUserId_updatedAt_idx" ON "TripConversation"("customerUserId", "updatedAt");
CREATE INDEX "TripConversation_driverId_updatedAt_idx" ON "TripConversation"("driverId", "updatedAt");

CREATE UNIQUE INDEX "ChatMessage_conversationId_senderType_clientMessageId_key" ON "ChatMessage"("conversationId", "senderType", "clientMessageId");
CREATE INDEX "ChatMessage_conversationId_createdAt_id_idx" ON "ChatMessage"("conversationId", "createdAt", "id");
CREATE INDEX "ChatMessage_bookingLegId_createdAt_idx" ON "ChatMessage"("bookingLegId", "createdAt");
CREATE INDEX "ChatMessage_senderUserId_createdAt_idx" ON "ChatMessage"("senderUserId", "createdAt");
CREATE INDEX "ChatMessage_senderDriverId_createdAt_idx" ON "ChatMessage"("senderDriverId", "createdAt");

ALTER TABLE "TripConversation" ADD CONSTRAINT "TripConversation_bookingLegId_fkey" FOREIGN KEY ("bookingLegId") REFERENCES "BookingLeg"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "TripConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
