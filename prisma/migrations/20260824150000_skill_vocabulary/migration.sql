-- Match Score Precision (015): canonical skill vocabulary tables.
-- Additive only (spectech.md "Migration & Rollback") — no existing table is altered, so this
-- migration is safe to run before the application code deploy (expand step). `UserProfile`/
-- `JobListing` are untouched (FR-04).
--
-- Length constraint + lowercase invariant: `SkillEmbedding.skill`/`SkillAlias.alias` are the
-- lookup keys and stay a bounded VARCHAR(100) at the DB level (matches the existing
-- `mustHave`/`niceToHave`/`softSkills` string length cap in `JobFactsSchema`, z.string().max(100));
-- lowercase normalization itself is enforced at the application level, once, at the top of
-- `skillCanonicalizationService.resolveCanonicalSkills` (spectech.md Implementation Notes) — the
-- DB does not re-derive or enforce lowercase.

CREATE TYPE "SkillKind" AS ENUM ('HARD', 'SOFT');

CREATE TABLE "SkillEmbedding" (
  skill        VARCHAR(100) PRIMARY KEY,
  "displayName" TEXT NOT NULL,
  kind         "SkillKind" NOT NULL,
  embedding    vector(768) NOT NULL,
  "createdAt"  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE "SkillAlias" (
  alias       VARCHAR(100) PRIMARY KEY,
  skill       VARCHAR(100) NOT NULL REFERENCES "SkillEmbedding"(skill) ON DELETE CASCADE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- Partial-by-kind cosine index so the top-1 similarity search (FR-05 step 2) never scans
-- across the HARD/SOFT boundary (FR-03) — same hnsw/vector_cosine_ops index type as the
-- existing user_profile_embedding_hnsw_idx / job_listing_embedding_hnsw_idx
-- (prisma/migrations/20260819120000_match_score_v2/migration.sql), naming convention matched.
CREATE INDEX "skill_embedding_hard_hnsw_idx" ON "SkillEmbedding"
  USING hnsw (embedding vector_cosine_ops) WHERE kind = 'HARD';
CREATE INDEX "skill_embedding_soft_hnsw_idx" ON "SkillEmbedding"
  USING hnsw (embedding vector_cosine_ops) WHERE kind = 'SOFT';
