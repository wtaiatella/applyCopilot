-- CV Composer (007) — Foundational schema migration
--
-- Ordered per spectech.md § Migration & Rollback / Technical Decisions. Step numbers below match
-- tasks.md T006's sub-step list; step 7 (pre-existing CV rows without jobListingId) is executed
-- first in this file — before the NOT NULL jobListingId/snapshotData columns are added to "CV" —
-- because a NOT NULL column add would otherwise fail against any surviving row. This is the
-- "preferred" path documented in spectech.md's Migration & Rollback note: CV/CVBullet were
-- anticipated-but-never-used tables before this spec, so any surviving row is deleted rather than
-- backfilled with a placeholder JobListing link.

-- (Step 7) Pre-migration: delete any pre-existing "CV" rows (they predate jobListingId and have no
-- real usage yet — CVBullet rows cascade-delete with them via the existing FK).
DELETE FROM "CV";

-- CreateEnum
CREATE TYPE "CVStatus" AS ENUM ('DRAFT', 'APPLIED');

-- AlterTable: CV gains jobListingId/status/snapshotData/appliedAt/updatedAt (T004)
ALTER TABLE "CV"
  ADD COLUMN "jobListingId" TEXT NOT NULL,
  ADD COLUMN "status" "CVStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "snapshotData" JSONB NOT NULL,
  ADD COLUMN "appliedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex: one CV per (profile, job) — enforced DB invariant for FR-1 concurrency safety
CREATE UNIQUE INDEX "CV_profileId_jobListingId_key" ON "CV"("profileId", "jobListingId");

-- AddForeignKey
ALTER TABLE "CV" ADD CONSTRAINT "CV_jobListingId_fkey"
  FOREIGN KEY ("jobListingId") REFERENCES "JobListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- (Step 1) AlterTable: Skill gains isActive/isArchived (T005)
ALTER TABLE "Skill" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- (Step 2)
ALTER TABLE "Skill" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- (Step 3) Data-check: fail loudly if duplicate-active (profileId, name) rows already exist —
-- the partial unique index created in step 5 would otherwise silently coexist with corrupt data.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT "profileId", name FROM "Skill" GROUP BY 1, 2 HAVING count(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'CV Composer migration aborted: % duplicate (profileId, name) Skill row group(s) found. Fix duplicates before re-running this migration.', dup_count;
  END IF;
END $$;

-- (Step 4) DropIndex: plain unique constraint replaced by a partial unique index (T005)
-- Note: Prisma's `@@unique` is materialized as a plain UNIQUE INDEX (not a pg_constraint row),
-- as verified against this project's actual init migration/DB — DROP INDEX is used here instead
-- of DROP CONSTRAINT (spectech.md's Migration & Rollback section names it a "CONSTRAINT", but
-- DROP CONSTRAINT fails against the real schema; this is the corrected, verified equivalent).
DROP INDEX "Skill_profileId_name_key";

-- (Step 5) CreateIndex: partial unique index — active skills stay unique per (profileId, name),
-- while an archived historical row may coexist alongside its replacement (Technical Decisions).
CREATE UNIQUE INDEX "Skill_profileId_name_active_key" ON "Skill"("profileId", "name") WHERE "isArchived" = false;

-- AlterTable: CVBullet gains summaryId/skillId nullable FKs (T005)
ALTER TABLE "CVBullet"
  ADD COLUMN "summaryId" TEXT,
  ADD COLUMN "skillId" TEXT;

-- AddForeignKey
ALTER TABLE "CVBullet" ADD CONSTRAINT "CVBullet_summaryId_fkey"
  FOREIGN KEY ("summaryId") REFERENCES "ProfileSummary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CVBullet" ADD CONSTRAINT "CVBullet_skillId_fkey"
  FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- (Step 6) AddConstraint: "exactly one of five FKs is set" invariant — defense-in-depth backstop
-- for the application-level rule enforced in cvReconciliationService.ts. Requires PostgreSQL 14+
-- for num_nonnulls() (verified: this project's dev DB runs PostgreSQL 18).
ALTER TABLE "CVBullet" ADD CONSTRAINT "cvbullet_one_fk_check"
  CHECK (num_nonnulls("experienceBulletId", "projectBulletId", "educationBulletId", "summaryId", "skillId") = 1);
