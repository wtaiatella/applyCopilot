-- Down-migration (rollback) for fix_pgvector_embedding_columns (REM-1, REM-2).

DROP INDEX IF EXISTS "job_listing_embedding_hnsw_idx";
ALTER TABLE "JobListing" DROP COLUMN "embedding";

DROP INDEX IF EXISTS "user_profile_embedding_hnsw_idx";
-- Deviation from spectech.md's literal down SQL (verified during T007's scratch-DB rollback
-- proof): widening vector(512) -> vector(1536) re-validates every existing row against the new
-- dimension and fails with "expected 1536 dimensions, not 512" against any genuinely-written
-- 512-dim row (e.g. real embeddings computed by vector-service.ts after this migration deployed —
-- not just the pre-existing rows the forward migration already nulled). Null the column first,
-- mirroring the forward migration's own documented precaution, so rollback is actually executable
-- in the emergency-abort scenario it exists for, not just against a pristine pre-deploy DB.
DO $$
DECLARE
  embedding_count integer;
BEGIN
  SELECT count(*) INTO embedding_count FROM "UserProfile" WHERE "embedding" IS NOT NULL;
  IF embedding_count > 0 THEN
    RAISE NOTICE 'fix_pgvector_embedding_columns (down): nulling % UserProfile.embedding row(s) before widening to vector(1536) — see spectech.md Risks & Mitigations.', embedding_count;
  END IF;
END $$;

UPDATE "UserProfile" SET "embedding" = NULL WHERE "embedding" IS NOT NULL;
ALTER TABLE "UserProfile" ALTER COLUMN "embedding" TYPE vector(1536);
-- Note: rows nulled above (by the forward migration originally, or by this down migration for any
-- post-deploy writes) are not recoverable on rollback — accepted, documented data loss for an
-- emergency deploy-abort operation, not a routine one.
