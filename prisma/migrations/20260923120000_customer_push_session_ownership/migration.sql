ALTER TABLE "PushDevice" ADD COLUMN "sessionId" TEXT;
-- Quarantine ambiguous active registrations before enforcing ownership invariants.
WITH ranked AS (
 SELECT id, row_number() OVER (PARTITION BY "tokenHash" ORDER BY "lastSeenAt" DESC, id) AS rank
 FROM "PushDevice" WHERE "revokedAt" IS NULL AND "invalidatedAt" IS NULL
) UPDATE "PushDevice" SET "revokedAt" = CURRENT_TIMESTAMP WHERE id IN (SELECT id FROM ranked WHERE rank > 1);
WITH ranked AS (
 SELECT id, row_number() OVER (PARTITION BY "appType", "deviceId" ORDER BY "lastSeenAt" DESC, id) AS rank
 FROM "PushDevice" WHERE "deviceId" IS NOT NULL AND "revokedAt" IS NULL AND "invalidatedAt" IS NULL
) UPDATE "PushDevice" SET "revokedAt" = CURRENT_TIMESTAMP WHERE id IN (SELECT id FROM ranked WHERE rank > 1);
CREATE UNIQUE INDEX "PushDevice_active_token_key" ON "PushDevice" ("tokenHash") WHERE "revokedAt" IS NULL AND "invalidatedAt" IS NULL;
CREATE UNIQUE INDEX "PushDevice_active_installation_key" ON "PushDevice" ("appType", "deviceId") WHERE "deviceId" IS NOT NULL AND "revokedAt" IS NULL AND "invalidatedAt" IS NULL;
CREATE INDEX "PushDevice_sessionId_idx" ON "PushDevice" ("sessionId");
