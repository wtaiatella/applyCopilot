-- Down-migration (rollback) for CV Composer (007) Foundational schema migration.
-- Reverses migration.sql: drops new columns/constraints/indexes, restores the original
-- Skill unique constraint. No destructive transformation was performed forward (beyond
-- deleting pre-existing anticipatory CV rows, which is not reversible — see Migration &
-- Rollback / this file's note below), so this rollback loses no data written after this deploy.

-- Reverse: CVBullet "exactly one FK" CHECK constraint
ALTER TABLE "CVBullet" DROP CONSTRAINT "cvbullet_one_fk_check";

-- Reverse: CVBullet summaryId/skillId FKs + columns
ALTER TABLE "CVBullet" DROP CONSTRAINT "CVBullet_skillId_fkey";
ALTER TABLE "CVBullet" DROP CONSTRAINT "CVBullet_summaryId_fkey";
ALTER TABLE "CVBullet" DROP COLUMN "skillId";
ALTER TABLE "CVBullet" DROP COLUMN "summaryId";

-- Reverse: Skill partial unique index -> restore original plain unique index.
-- CAUTION (verified during T007 scratch-DB testing): once the app has performed at least one
-- Skill archive-and-replace (i.e. an Apply reconciliation created an archived row + a new active
-- row sharing the same (profileId, name)), this step FAILS — the plain unique index cannot
-- coexist with that now-legitimate archived/active duplicate. This rollback is only safe before
-- any such archive-and-replace has occurred in production; the guard below fails loudly instead
-- of silently leaving the partial index in place.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT "profileId", name FROM "Skill" GROUP BY 1, 2 HAVING count(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Rollback aborted: % Skill (profileId, name) group(s) have an archived+active duplicate created by the archive-and-replace pattern this migration introduced. Restoring the plain unique index would violate current data; resolve manually (e.g. hard-delete or rename archived rows) before rolling back.', dup_count;
  END IF;
END $$;

DROP INDEX "Skill_profileId_name_active_key";
CREATE UNIQUE INDEX "Skill_profileId_name_key" ON "Skill"("profileId", "name");

-- Reverse: Skill isActive/isArchived columns
ALTER TABLE "Skill" DROP COLUMN "isArchived";
ALTER TABLE "Skill" DROP COLUMN "isActive";

-- Reverse: CV jobListingId FK + unique index + new columns
ALTER TABLE "CV" DROP CONSTRAINT "CV_jobListingId_fkey";
DROP INDEX "CV_profileId_jobListingId_key";
ALTER TABLE "CV" DROP COLUMN "updatedAt";
ALTER TABLE "CV" DROP COLUMN "appliedAt";
ALTER TABLE "CV" DROP COLUMN "snapshotData";
ALTER TABLE "CV" DROP COLUMN "status";
ALTER TABLE "CV" DROP COLUMN "jobListingId";

-- Reverse: CVStatus enum
DROP TYPE "CVStatus";

-- Note: the forward migration's `DELETE FROM "CV"` (pre-existing anticipatory dev rows) is not
-- reversible by design -- those rows carried no jobListingId and predate any real usage of the
-- CV Composer feature (see spectech.md's Migration & Rollback deploy-order note).
