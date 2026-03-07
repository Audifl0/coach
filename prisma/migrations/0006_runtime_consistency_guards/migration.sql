CREATE UNIQUE INDEX IF NOT EXISTS "ProgramPlan_one_active_per_user_idx"
ON "ProgramPlan"("userId")
WHERE "status" = 'active';
