-- Match Score v2 (014): profileFacts/jobFacts JSON columns, UserPreferences table,
-- and the embedding vector dimension change 512 -> 768 (provider-routed embeddings
-- replace TensorFlow.js). Per spectech.md "Technical Decisions" / "Migration & Rollback":
-- this is a one-time RESET, not a backfill — cross-provider/cross-dimension vectors are
-- mathematically incomparable, and this repo's dataset is pre-production/disposable
-- (PRD Assumption #2). All existing `embedding` values become NULL and every
-- COMPLETED JobListing is requeued to PENDING for reclassification through the new
-- structured-extraction + embedding pipeline.

CREATE EXTENSION IF NOT EXISTS vector; -- already present, idempotent

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN "profileFacts" JSONB;
ALTER TABLE "JobListing" ADD COLUMN "jobFacts" JSONB;

-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "seniority" TEXT,
    "totalYearsExperience" INTEGER,
    "acceptsContract" BOOLEAN,
    "acceptsFreelance" BOOLEAN,
    "acceptsOnsite" BOOLEAN,
    "acceptsHybrid" BOOLEAN,
    "acceptsRemote" BOOLEAN,
    "onlyWorldwide" BOOLEAN,
    "hasUsWorkAuth" BOOLEAN,
    "requiresVisaRelocation" BOOLEAN,
    "salaryMin" DOUBLE PRECISION,
    "salaryCurrency" TEXT,
    "excludeKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_profileId_key" ON "UserPreferences"("profileId");

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vector dimension change: 512 -> 768 (destructive reset, see header note above).
-- Existing HNSW indexes must be dropped before the column type change and rebuilt after.
DROP INDEX IF EXISTS "user_profile_embedding_hnsw_idx";
DROP INDEX IF EXISTS "job_listing_embedding_hnsw_idx";

ALTER TABLE "UserProfile" ALTER COLUMN "embedding" TYPE vector(768) USING NULL::vector(768);
ALTER TABLE "JobListing"  ALTER COLUMN "embedding" TYPE vector(768) USING NULL::vector(768);

CREATE INDEX "user_profile_embedding_hnsw_idx" ON "UserProfile" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "job_listing_embedding_hnsw_idx"  ON "JobListing"  USING hnsw ("embedding" vector_cosine_ops);

-- Reset stale sync/classification state so both sides reprocess through the new
-- structured-extraction + 768d-embedding pipeline (Technical Decisions: reset, not backfill).
UPDATE "UserProfile" SET "embeddingSyncedAt" = NULL WHERE "embeddingSyncedAt" IS NOT NULL;

UPDATE "JobListing" SET "classificationStatus" = 'PENDING', "classificationAttempts" = 0,
  "classificationError" = NULL WHERE "classificationStatus" = 'COMPLETED';
