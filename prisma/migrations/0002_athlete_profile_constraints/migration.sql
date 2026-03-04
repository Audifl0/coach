CREATE TABLE "AthleteProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "weeklySessionTarget" INTEGER NOT NULL,
  "sessionDuration" TEXT NOT NULL,
  "equipmentCategories" JSONB NOT NULL,
  "limitationsDeclared" BOOLEAN NOT NULL DEFAULT false,
  "limitations" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AthleteProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AthleteProfile_userId_key" ON "AthleteProfile"("userId");

ALTER TABLE "AthleteProfile"
  ADD CONSTRAINT "AthleteProfile_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
