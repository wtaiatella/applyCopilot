-- Drop 768d HNSW indexes before column type change
DROP INDEX IF EXISTS "user_profile_embedding_hnsw_idx";
DROP INDEX IF EXISTS "job_listing_embedding_hnsw_idx";
DROP INDEX IF EXISTS "skill_embedding_hard_hnsw_idx";
DROP INDEX IF EXISTS "skill_embedding_soft_hnsw_idx";

-- Clear 768d canonical skill vocabulary (cascades to SkillAlias via ON DELETE CASCADE)
DELETE FROM "SkillEmbedding";

-- Alter vector columns 768 -> 1024 (existing 768d vectors nulled cleanly; non-vector columns untouched)
ALTER TABLE "UserProfile" ALTER COLUMN "embedding" TYPE vector(1024) USING NULL::vector(1024);
ALTER TABLE "JobListing"  ALTER COLUMN "embedding" TYPE vector(1024) USING NULL::vector(1024);
ALTER TABLE "SkillEmbedding" ALTER COLUMN "embedding" TYPE vector(1024) USING NULL::vector(1024);

-- Reset profile sync timestamps so profiles re-sync in 1024d (do NOT reset JobListing.classificationStatus)
UPDATE "UserProfile" SET "embeddingSyncedAt" = NULL WHERE "embeddingSyncedAt" IS NOT NULL;

-- Rebuild HNSW cosine similarity indexes for 1024d
CREATE INDEX "user_profile_embedding_hnsw_idx" ON "UserProfile" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "job_listing_embedding_hnsw_idx"  ON "JobListing"  USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "skill_embedding_hard_hnsw_idx"   ON "SkillEmbedding" USING hnsw ("embedding" vector_cosine_ops) WHERE kind = 'HARD';
CREATE INDEX "skill_embedding_soft_hnsw_idx"   ON "SkillEmbedding" USING hnsw ("embedding" vector_cosine_ops) WHERE kind = 'SOFT';
