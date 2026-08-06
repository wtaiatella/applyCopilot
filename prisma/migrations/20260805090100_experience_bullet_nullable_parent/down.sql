-- Down-migration (rollback) for experience_bullet_nullable_parent (REM-3).
--
-- Any bullet already detached (experienceId IS NULL) by application code running under the new
-- behavior must be hard-deleted before re-adding the NOT NULL constraint — they have no valid
-- parent to reattach to. Accepted, documented data-loss-on-rollback (mirrors the forward
-- migration's own accepted trade-off for REM-1's nulled rows).
DO $$
DECLARE
  orphaned_count integer;
BEGIN
  SELECT count(*) INTO orphaned_count FROM "ExperienceBullet" WHERE "experienceId" IS NULL;
  IF orphaned_count > 0 THEN
    RAISE NOTICE 'experience_bullet_nullable_parent: deleting % orphaned ExperienceBullet row(s) before re-adding NOT NULL constraint — see spectech.md Risks & Mitigations.', orphaned_count;
  END IF;
END $$;

DELETE FROM "ExperienceBullet" WHERE "experienceId" IS NULL;

ALTER TABLE "ExperienceBullet" DROP CONSTRAINT "ExperienceBullet_experienceId_fkey";
ALTER TABLE "ExperienceBullet" ADD CONSTRAINT "ExperienceBullet_experienceId_fkey"
  FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExperienceBullet" ALTER COLUMN "experienceId" SET NOT NULL;
