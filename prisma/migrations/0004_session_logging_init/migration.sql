ALTER TABLE "PlannedSession"
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "effectiveDurationSec" INTEGER,
  ADD COLUMN "durationCorrectedAt" TIMESTAMP(3),
  ADD COLUMN "note" TEXT,
  ADD COLUMN "postSessionFatigue" INTEGER,
  ADD COLUMN "postSessionReadiness" INTEGER,
  ADD COLUMN "postSessionComment" TEXT;

ALTER TABLE "PlannedExercise"
  ADD COLUMN "isSkipped" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "skipReasonCode" TEXT,
  ADD COLUMN "skipReasonText" TEXT,
  ADD COLUMN "skippedAt" TIMESTAMP(3);

CREATE TABLE "LoggedSet" (
  "id" TEXT NOT NULL,
  "plannedSessionId" TEXT NOT NULL,
  "plannedExerciseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "setIndex" INTEGER NOT NULL,
  "weight" DECIMAL(65,30) NOT NULL,
  "reps" INTEGER NOT NULL,
  "rpe" DECIMAL(65,30),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LoggedSet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoggedSet_plannedExerciseId_setIndex_key" ON "LoggedSet"("plannedExerciseId", "setIndex");
CREATE INDEX "LoggedSet_userId_plannedSessionId_idx" ON "LoggedSet"("userId", "plannedSessionId");

ALTER TABLE "LoggedSet"
  ADD CONSTRAINT "LoggedSet_plannedSessionId_fkey"
  FOREIGN KEY ("plannedSessionId")
  REFERENCES "PlannedSession"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "LoggedSet"
  ADD CONSTRAINT "LoggedSet_plannedExerciseId_fkey"
  FOREIGN KEY ("plannedExerciseId")
  REFERENCES "PlannedExercise"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "LoggedSet"
  ADD CONSTRAINT "LoggedSet_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
