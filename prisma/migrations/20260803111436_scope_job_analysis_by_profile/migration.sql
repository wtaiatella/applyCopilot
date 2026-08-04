-- JobAnalysis Cross-Tenant Data Leak Fix (008) — Foundational schema migration
--
-- Ordered per spectech.md § Migration & Rollback (delete-before-constrain), mirroring
-- 20260730120000_cv_composer's discipline. Pre-flight row-count check (T002) confirmed a
-- pre-production-scale row count (2 rows) on the local dev DB — Decision 2's drop-legacy-rows
-- strategy applies unchanged.

-- Step 1: Remove pre-fix rows — no reliable owner attribution exists (Decision 2, FR-6, AC.5).
-- They regenerate transparently on next request under the new composite key.
DELETE FROM "JobAnalysis";

-- Step 2: Drop the old single-column unique index (materialized as a plain index, not a
-- pg_constraint row — confirmed against this project's actual DB, same as 007's own verified
-- note for the analogous "Skill_profileId_name_key" index).
DROP INDEX "JobAnalysis_jobId_key";

-- Step 3: Add the new profileId column (safe now that the table is empty from Step 1).
ALTER TABLE "JobAnalysis" ADD COLUMN "profileId" TEXT NOT NULL;

-- Step 4: Add the FK to UserProfile, cascading on delete like the existing job FK.
ALTER TABLE "JobAnalysis" ADD CONSTRAINT "JobAnalysis_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 5: Composite unique index — one analysis per (profile, job) (AC.4).
CREATE UNIQUE INDEX "JobAnalysis_profileId_jobId_key" ON "JobAnalysis"("profileId", "jobId");
