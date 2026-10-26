-- Additive private outbox; no existing Customer/business rows are rewritten.
CREATE TABLE "AccountDeletionCleanup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAttemptAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountDeletionCleanup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccountDeletionCleanup_status_check" CHECK ("status" IN ('pending', 'succeeded', 'blocked')),
  CONSTRAINT "AccountDeletionCleanup_attempts_check" CHECK ("attempts" BETWEEN 0 AND 8),
  CONSTRAINT "AccountDeletionCleanup_target_check" CHECK (
    ("status" = 'succeeded' AND "avatarUrl" IS NULL AND "completedAt" IS NOT NULL)
    OR ("status" IN ('pending', 'blocked') AND "avatarUrl" IS NOT NULL AND "completedAt" IS NULL)
  )
);
CREATE UNIQUE INDEX "AccountDeletionCleanup_userId_key" ON "AccountDeletionCleanup"("userId");
CREATE INDEX "AccountDeletionCleanup_status_nextAttemptAt_idx" ON "AccountDeletionCleanup"("status", "nextAttemptAt");
ALTER TABLE "AccountDeletionCleanup" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AccountDeletionCleanup" FROM PUBLIC;
-- These Supabase roles do not exist in ordinary disposable PostgreSQL.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "AccountDeletionCleanup" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "AccountDeletionCleanup" FROM authenticated;
  END IF;
END $$;
