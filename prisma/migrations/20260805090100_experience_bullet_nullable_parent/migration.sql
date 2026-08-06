-- Audit Remediation (011) — experience_bullet_nullable_parent (REM-3)
--
-- Allow an ExperienceBullet to survive its parent Experience's deletion when it is referenced by a
-- CVBullet — mirrors CVBullet.experienceBulletId's existing SetNull pattern one level up. The
-- application layer (DELETE /api/profile/experiences/[id]) is responsible for explicitly nulling
-- experienceId on CV-referenced bullets before deleting the parent; this migration only relaxes
-- the constraint to permit that.
ALTER TABLE "ExperienceBullet" ALTER COLUMN "experienceId" DROP NOT NULL;

ALTER TABLE "ExperienceBullet" DROP CONSTRAINT "ExperienceBullet_experienceId_fkey";
ALTER TABLE "ExperienceBullet" ADD CONSTRAINT "ExperienceBullet_experienceId_fkey"
  FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE SET NULL ON UPDATE CASCADE;
