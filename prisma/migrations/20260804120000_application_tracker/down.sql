-- Down-migration (rollback) for Application Tracker (009) Foundational schema migration.
-- Reverses migration.sql: drops the new CHECK constraint, foreign keys, tables (Application,
-- ApplicationEvent, JobFavorite — including the backfilled Application/ApplicationEvent rows,
-- which go with the tables) and enums (ApplicationStage, ApplicationOutcome,
-- ApplicationEventType). Fully additive forward migration, so no pre-existing CV/JobListing/
-- UserProfile column, row, or constraint is touched by this rollback (spectech.md § Migration &
-- Rollback). Mirrors 007's 20260730120000_cv_composer/down.sql precedent for this repo's
-- down-migration convention.

-- Reverse: ApplicationEvent "per-type shape" CHECK constraint
ALTER TABLE "ApplicationEvent" DROP CONSTRAINT IF EXISTS "applicationevent_type_shape_check";

-- Reverse: foreign keys (explicit, before the table drops below)
ALTER TABLE "JobFavorite" DROP CONSTRAINT IF EXISTS "JobFavorite_jobListingId_fkey";
ALTER TABLE "JobFavorite" DROP CONSTRAINT IF EXISTS "JobFavorite_profileId_fkey";
ALTER TABLE "ApplicationEvent" DROP CONSTRAINT IF EXISTS "ApplicationEvent_applicationId_fkey";
ALTER TABLE "Application" DROP CONSTRAINT IF EXISTS "Application_jobListingId_fkey";
ALTER TABLE "Application" DROP CONSTRAINT IF EXISTS "Application_profileId_fkey";
ALTER TABLE "Application" DROP CONSTRAINT IF EXISTS "Application_cvId_fkey";

-- Reverse: tables (their indexes, e.g. Application_cvId_key, Application_profileId_stage_idx,
-- ApplicationEvent_applicationId_createdAt_idx, JobFavorite_profileId_jobListingId_key, and the
-- backfilled rows go with them; CASCADE covers any residual dependency from the FK drops above)
DROP TABLE IF EXISTS "JobFavorite" CASCADE;
DROP TABLE IF EXISTS "ApplicationEvent" CASCADE;
DROP TABLE IF EXISTS "Application" CASCADE;

-- Reverse: enums
DROP TYPE IF EXISTS "ApplicationEventType";
DROP TYPE IF EXISTS "ApplicationOutcome";
DROP TYPE IF EXISTS "ApplicationStage";
