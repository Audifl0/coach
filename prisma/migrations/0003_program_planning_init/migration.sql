CREATE TABLE "ProgramPlan" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProgramPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlannedSession" (
  "id" TEXT NOT NULL,
  "programPlanId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scheduledDate" TIMESTAMP(3) NOT NULL,
  "dayIndex" INTEGER NOT NULL,
  "focusLabel" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlannedSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlannedExercise" (
  "id" TEXT NOT NULL,
  "plannedSessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "exerciseKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "movementPattern" TEXT NOT NULL,
  "sets" INTEGER NOT NULL,
  "targetReps" INTEGER NOT NULL,
  "targetLoad" TEXT NOT NULL,
  "restMinSec" INTEGER NOT NULL,
  "restMaxSec" INTEGER NOT NULL,
  "isSubstituted" BOOLEAN NOT NULL DEFAULT false,
  "originalExerciseKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlannedExercise_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProgramPlan_userId_status_idx" ON "ProgramPlan"("userId", "status");
CREATE INDEX "PlannedSession_userId_scheduledDate_idx" ON "PlannedSession"("userId", "scheduledDate");
CREATE INDEX "PlannedSession_programPlanId_dayIndex_idx" ON "PlannedSession"("programPlanId", "dayIndex");
CREATE UNIQUE INDEX "PlannedExercise_plannedSessionId_orderIndex_key" ON "PlannedExercise"("plannedSessionId", "orderIndex");
CREATE INDEX "PlannedExercise_userId_plannedSessionId_idx" ON "PlannedExercise"("userId", "plannedSessionId");

ALTER TABLE "ProgramPlan"
  ADD CONSTRAINT "ProgramPlan_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "PlannedSession"
  ADD CONSTRAINT "PlannedSession_programPlanId_fkey"
  FOREIGN KEY ("programPlanId")
  REFERENCES "ProgramPlan"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "PlannedSession"
  ADD CONSTRAINT "PlannedSession_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "PlannedExercise"
  ADD CONSTRAINT "PlannedExercise_plannedSessionId_fkey"
  FOREIGN KEY ("plannedSessionId")
  REFERENCES "PlannedSession"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "PlannedExercise"
  ADD CONSTRAINT "PlannedExercise_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
