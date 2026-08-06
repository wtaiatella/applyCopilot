-- Audit Remediation (011) — fix_pgvector_embedding_columns
--
-- REM-1 + REM-2 land together per spectech.md Decision 1: both are the same root-cause class of
-- bug (schema/migration-history drift on a pgvector column definition), touch adjacent tables, and
-- gain no independent-rollback benefit from being split. Also recreates the HNSW index dropped by
-- 20260611104028_add_ai_usage_log and never restored (Decision 2's bonus finding), plus a matching
-- new index for JobListing.

-- REM-1: UserProfile.embedding was created as vector(1536) by the init migration despite
-- schema.prisma already declaring vector(512) — and vector-service.ts has only ever produced
-- 512-dim vectors. No genuine 512-dim value could ever have been written through this app's own
-- code path against a 1536-dim column (every write would have failed at the DB level), so any
-- existing non-null value is not real application data — nulled defensively before narrowing.
DO $$
DECLARE
  existing_count integer;
BEGIN
  SELECT count(*) INTO existing_count FROM "UserProfile" WHERE "embedding" IS NOT NULL;
  IF existing_count > 0 THEN
    RAISE NOTICE 'fix_pgvector_embedding_columns: nulling % pre-existing UserProfile.embedding row(s) before narrowing to vector(512) — see spectech.md Risks & Mitigations.', existing_count;
  END IF;
END $$;

UPDATE "UserProfile" SET "embedding" = NULL WHERE "embedding" IS NOT NULL;

-- The HNSW index must be dropped before a column-type ALTER; it was already absent here (see
-- below) but DROP IF EXISTS keeps this migration idempotent/safe to re-run against any DB state.
DROP INDEX IF EXISTS "user_profile_embedding_hnsw_idx";

ALTER TABLE "UserProfile" ALTER COLUMN "embedding" TYPE vector(512);

-- Bonus finding (spectech.md Decision 2): this index was dropped by
-- 20260611104028_add_ai_usage_log and never recreated by any later migration. Recreated here
-- since this migration already touches the column.
CREATE INDEX IF NOT EXISTS "user_profile_embedding_hnsw_idx"
  ON "UserProfile" USING hnsw ("embedding" vector_cosine_ops);

-- REM-2: JobListing.embedding was declared in schema.prisma but never created by any migration —
-- GET /api/jobs, the classification worker, and cvMatchScoreService.ts all depend on it existing.
ALTER TABLE "JobListing" ADD COLUMN "embedding" vector(512);

CREATE INDEX IF NOT EXISTS "job_listing_embedding_hnsw_idx"
  ON "JobListing" USING hnsw ("embedding" vector_cosine_ops);
