-- Short-lived, server-authoritative Customer identity-linking challenges.
-- Additive only: no existing identity, session, booking or financial data is rewritten.
CREATE TABLE "CustomerIdentityLinkChallenge" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "installationId" TEXT,
  "platform" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerIdentityLinkChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerIdentityLinkChallenge_attempts_check"
    CHECK ("failedAttempts" >= 0 AND "maxAttempts" > 0 AND "failedAttempts" <= "maxAttempts")
);

CREATE UNIQUE INDEX "CustomerIdentityLinkChallenge_tokenHash_key"
  ON "CustomerIdentityLinkChallenge"("tokenHash");
CREATE INDEX "CustomerIdentityLinkChallenge_userId_provider_consumedAt_expiresAt_idx"
  ON "CustomerIdentityLinkChallenge"("userId", "provider", "consumedAt", "expiresAt");
CREATE INDEX "CustomerIdentityLinkChallenge_provider_providerAccountId_consumedAt_expiresAt_idx"
  ON "CustomerIdentityLinkChallenge"("provider", "providerAccountId", "consumedAt", "expiresAt");
CREATE INDEX "CustomerIdentityLinkChallenge_expiresAt_idx"
  ON "CustomerIdentityLinkChallenge"("expiresAt");

ALTER TABLE "CustomerIdentityLinkChallenge"
  ADD CONSTRAINT "CustomerIdentityLinkChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
