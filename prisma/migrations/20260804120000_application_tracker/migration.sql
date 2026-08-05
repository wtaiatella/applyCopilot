-- Application Tracker (009) — Foundational schema migration
--
-- Ordered per spectech.md § Migration & Rollback / Technical Decisions. Fully additive: three new
-- enums, three new tables (Application, ApplicationEvent, JobFavorite), their indexes/FKs, a
-- one-time backfill of Application rows for pre-existing CV.status = 'APPLIED' rows (Risks table
-- row 1), and a raw-SQL CHECK constraint backstopping ApplicationEvent's per-type shape invariant
-- (Risks table row 3) — mirrors 007's 20260730120000_cv_composer / 008's
-- 20260803111436_scope_job_analysis_by_profile precedent for this repo's raw-SQL-after-Prisma-DDL
-- convention. No existing column on CV/JobListing/UserProfile is altered by this migration.

-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('APPLIED', 'SCREENING', 'TECH_INTERVIEW', 'OFFER', 'FINAL');

-- CreateEnum
CREATE TYPE "ApplicationOutcome" AS ENUM ('NOT_APPROVED', 'NO_RESPONSE', 'DECLINED_BY_COMPANY', 'DECLINED_BY_CANDIDATE', 'HIRED');

-- CreateEnum
CREATE TYPE "ApplicationEventType" AS ENUM ('STAGE_CHANGE', 'NOTE', 'MEETING', 'COMPANY_RESPONSE');

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "cvId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "jobListingId" TEXT NOT NULL,
    "stage" "ApplicationStage" NOT NULL DEFAULT 'APPLIED',
    "outcome" "ApplicationOutcome",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "ApplicationEventType" NOT NULL,
    "fromStage" "ApplicationStage",
    "toStage" "ApplicationStage",
    "title" TEXT,
    "eventAt" TIMESTAMP(3),
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobFavorite" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "jobListingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Application_cvId_key" ON "Application"("cvId");

-- CreateIndex
CREATE INDEX "Application_profileId_stage_idx" ON "Application"("profileId", "stage");

-- CreateIndex
CREATE INDEX "ApplicationEvent_applicationId_createdAt_idx" ON "ApplicationEvent"("applicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobFavorite_profileId_jobListingId_key" ON "JobFavorite"("profileId", "jobListingId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_cvId_fkey" FOREIGN KEY ("cvId") REFERENCES "CV"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobListingId_fkey" FOREIGN KEY ("jobListingId") REFERENCES "JobListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobFavorite" ADD CONSTRAINT "JobFavorite_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobFavorite" ADD CONSTRAINT "JobFavorite_jobListingId_fkey" FOREIGN KEY ("jobListingId") REFERENCES "JobListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (spectech.md § Migration & Rollback, Risks table row 1): for every pre-existing CV row
-- with status = 'APPLIED' that has no Application yet (i.e. every CV that was applied to before
-- this feature shipped, via 007's Apply flow), create one Application (stage = 'APPLIED') so it
-- still appears on the Kanban board (FR-15) instead of silently disappearing. Ids are generated
-- with gen_random_uuid() (built into PostgreSQL 13+ core, verified against this project's dev DB
-- running PostgreSQL 18) since this is a one-time raw-SQL data migration, not an application-code
-- write through Prisma's @default(cuid()) — the resulting rows are still ordinary String ids as
-- far as Prisma/the rest of the app is concerned.
INSERT INTO "Application" ("id", "cvId", "profileId", "jobListingId", "stage", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, cv."id", cv."profileId", cv."jobListingId", 'APPLIED', COALESCE(cv."appliedAt", now()), COALESCE(cv."appliedAt", now())
FROM "CV" cv
WHERE cv."status" = 'APPLIED'
  AND NOT EXISTS (SELECT 1 FROM "Application" a WHERE a."cvId" = cv."id");

-- One synthetic STAGE_CHANGE event per backfilled Application (fromStage: NULL, toStage: APPLIED),
-- createdAt = CV.appliedAt (the original apply time), so the timeline reads correctly from day one.
INSERT INTO "ApplicationEvent" ("id", "applicationId", "type", "fromStage", "toStage", "createdAt")
SELECT gen_random_uuid()::text, a."id", 'STAGE_CHANGE', NULL, 'APPLIED', COALESCE(cv."appliedAt", a."createdAt")
FROM "Application" a
JOIN "CV" cv ON cv."id" = a."cvId"
WHERE cv."status" = 'APPLIED'
  AND NOT EXISTS (SELECT 1 FROM "ApplicationEvent" e WHERE e."applicationId" = a."id");

-- ApplicationEvent invariant backstop (raw SQL, added after the Prisma-generated table DDL, same
-- belt-and-suspenders pattern as 007's "cvbullet_one_fk_check"): STAGE_CHANGE requires toStage set
-- and title/eventAt/content null; NOTE/COMPANY_RESPONSE require content set and
-- fromStage/toStage/title/eventAt null; MEETING requires title+eventAt set and fromStage/toStage
-- null (content optional for MEETING notes).
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "applicationevent_type_shape_check" CHECK (
  ("type" = 'STAGE_CHANGE' AND "toStage" IS NOT NULL AND "title" IS NULL AND "eventAt" IS NULL AND "content" IS NULL)
  OR ("type" IN ('NOTE', 'COMPANY_RESPONSE') AND "content" IS NOT NULL AND "fromStage" IS NULL AND "toStage" IS NULL AND "title" IS NULL AND "eventAt" IS NULL)
  OR ("type" = 'MEETING' AND "title" IS NOT NULL AND "eventAt" IS NOT NULL AND "fromStage" IS NULL AND "toStage" IS NULL)
);
