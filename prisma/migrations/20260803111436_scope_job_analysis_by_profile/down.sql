-- Down-migration (rollback) for JobAnalysis Cross-Tenant Data Leak Fix (008) Foundational
-- schema migration. Reverses migration.sql: drops the composite unique index, the profileId
-- FK + column, and restores the original single-column unique index on jobId.
--
-- Safe to run at any point after the forward migration: Step 1 of the forward migration already
-- emptied the table, so there is no legitimate pre-deploy data to lose. Any rows created under
-- the new (profileId, jobId) scheme after deploy are lost when the profileId column is dropped
-- (acceptable — rollback is only exercised as an emergency deploy-abort, not a routine operation,
-- per spectech.md's Migration & Rollback section).

-- Reverse: composite unique index (AC.4)
DROP INDEX "JobAnalysis_profileId_jobId_key";

-- Reverse: profileId FK + column
ALTER TABLE "JobAnalysis" DROP CONSTRAINT "JobAnalysis_profileId_fkey";
ALTER TABLE "JobAnalysis" DROP COLUMN "profileId";

-- Reverse: restore the original single-column unique index on jobId
CREATE UNIQUE INDEX "JobAnalysis_jobId_key" ON "JobAnalysis"("jobId");
