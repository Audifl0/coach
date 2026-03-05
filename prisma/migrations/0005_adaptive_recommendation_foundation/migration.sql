CREATE TYPE "AdaptiveRecommendationActionType" AS ENUM ('progress', 'hold', 'deload', 'substitution');

CREATE TYPE "AdaptiveRecommendationStatus" AS ENUM (
  'proposed',
  'validated',
  'pending_confirmation',
  'applied',
  'rejected',
  'fallback_applied'
);

CREATE TYPE "AdaptiveRecommendationDecisionType" AS ENUM ('policy', 'user', 'execution', 'fallback');

CREATE TABLE "AdaptiveRecommendation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "plannedSessionId" TEXT NOT NULL,
  "actionType" "AdaptiveRecommendationActionType" NOT NULL,
  "status" "AdaptiveRecommendationStatus" NOT NULL DEFAULT 'proposed',
  "confidence" DECIMAL(4,3) NOT NULL,
  "confidenceLabel" TEXT NOT NULL,
  "confidenceReason" TEXT NOT NULL,
  "warningFlag" BOOLEAN NOT NULL DEFAULT false,
  "warningText" TEXT,
  "fallbackApplied" BOOLEAN NOT NULL DEFAULT false,
  "fallbackReason" TEXT,
  "progressionDeltaLoadPct" DECIMAL(5,2),
  "progressionDeltaReps" INTEGER,
  "progressionDeltaSets" INTEGER,
  "substitutionExerciseKey" TEXT,
  "substitutionDisplayName" TEXT,
  "substitutionReason" TEXT,
  "reasons" JSONB NOT NULL,
  "evidenceTags" JSONB NOT NULL,
  "forecastPayload" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdaptiveRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdaptiveRecommendationDecision" (
  "id" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "decisionType" "AdaptiveRecommendationDecisionType" NOT NULL,
  "previousStatus" "AdaptiveRecommendationStatus",
  "nextStatus" "AdaptiveRecommendationStatus" NOT NULL,
  "decisionReason" TEXT NOT NULL,
  "evidenceTags" JSONB NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdaptiveRecommendationDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdaptiveRecommendation_userId_createdAt_idx"
ON "AdaptiveRecommendation"("userId", "createdAt" DESC);

CREATE INDEX "AdaptiveRecommendation_plannedSessionId_status_idx"
ON "AdaptiveRecommendation"("plannedSessionId", "status");

CREATE INDEX "AdaptiveRecommendation_userId_status_createdAt_idx"
ON "AdaptiveRecommendation"("userId", "status", "createdAt" DESC);

CREATE INDEX "AdaptiveRecommendationDecision_recommendationId_createdAt_idx"
ON "AdaptiveRecommendationDecision"("recommendationId", "createdAt" DESC);

CREATE INDEX "AdaptiveRecommendationDecision_userId_createdAt_idx"
ON "AdaptiveRecommendationDecision"("userId", "createdAt" DESC);

ALTER TABLE "AdaptiveRecommendation"
  ADD CONSTRAINT "AdaptiveRecommendation_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "AdaptiveRecommendation"
  ADD CONSTRAINT "AdaptiveRecommendation_plannedSessionId_fkey"
  FOREIGN KEY ("plannedSessionId")
  REFERENCES "PlannedSession"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "AdaptiveRecommendationDecision"
  ADD CONSTRAINT "AdaptiveRecommendationDecision_recommendationId_fkey"
  FOREIGN KEY ("recommendationId")
  REFERENCES "AdaptiveRecommendation"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "AdaptiveRecommendationDecision"
  ADD CONSTRAINT "AdaptiveRecommendationDecision_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
