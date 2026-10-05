CREATE TABLE "SavedTraveller" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedTraveller_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedTraveller_userId_updatedAt_idx"
ON "SavedTraveller"("userId", "updatedAt");

ALTER TABLE "SavedTraveller"
ADD CONSTRAINT "SavedTraveller_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
