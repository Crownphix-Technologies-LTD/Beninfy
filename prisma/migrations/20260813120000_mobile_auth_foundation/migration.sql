-- Additive mobile authentication foundation.
-- Safe to apply after reviewing staging data; do not run automatically against production.

ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);

CREATE TABLE "MobileSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "deviceId" TEXT,
    "platform" TEXT,
    "deviceName" TEXT,
    "appVersion" TEXT,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileSession_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Driver" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "MobileSession_refreshTokenHash_key" ON "MobileSession"("refreshTokenHash");
CREATE INDEX "MobileSession_userId_idx" ON "MobileSession"("userId");
CREATE INDEX "MobileSession_expiresAt_idx" ON "MobileSession"("expiresAt");
CREATE INDEX "MobileSession_revokedAt_idx" ON "MobileSession"("revokedAt");
CREATE UNIQUE INDEX "Driver_userId_key" ON "Driver"("userId");

ALTER TABLE "MobileSession" ADD CONSTRAINT "MobileSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
