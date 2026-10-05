-- Unified Customer email/SMS OTP authentication. Additive only.
ALTER TABLE "User" ADD COLUMN "phoneVerified" TIMESTAMP(3);

CREATE TABLE "CustomerAuthOtpChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "purpose" TEXT NOT NULL DEFAULT 'customer_auth',
  "channel" TEXT NOT NULL,
  "identityEmail" TEXT NOT NULL,
  "targetNormalized" TEXT NOT NULL,
  "targetMasked" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'en',
  "eligible" BOOLEAN NOT NULL DEFAULT true,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "resendAvailableAt" TIMESTAMP(3) NOT NULL,
  "deliveredAt" TIMESTAMP(3),
  "deliveryFailedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "invalidatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerAuthOtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerAuthOtpChallenge_identityEmail_purpose_createdAt_idx"
  ON "CustomerAuthOtpChallenge"("identityEmail", "purpose", "createdAt");
CREATE INDEX "CustomerAuthOtpChallenge_targetNormalized_channel_purpose_createdAt_idx"
  ON "CustomerAuthOtpChallenge"("targetNormalized", "channel", "purpose", "createdAt");
CREATE INDEX "CustomerAuthOtpChallenge_userId_purpose_consumedAt_invalidatedAt_expiresAt_idx"
  ON "CustomerAuthOtpChallenge"("userId", "purpose", "consumedAt", "invalidatedAt", "expiresAt");
CREATE INDEX "CustomerAuthOtpChallenge_expiresAt_idx"
  ON "CustomerAuthOtpChallenge"("expiresAt");

ALTER TABLE "CustomerAuthOtpChallenge"
  ADD CONSTRAINT "CustomerAuthOtpChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
