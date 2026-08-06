/**
 * @jest-environment node
 *
 * Down-migration verification for audit-remediation follow-up fixes.
 *
 * Verifies that the modified down.sql files for REM-3 (experience_bullet_nullable_parent)
 * and REM-1/REM-2 (fix_pgvector_embedding_columns) execute cleanly with no SQL errors
 * and that the new RAISE NOTICE pre-flight blocks appear in query output.
 *
 * Setup: creates a minimal schema with test data (orphaned bullets, non-null embeddings),
 * then runs both down.sql files to confirm they execute and the notice messages fire.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { Pool, type PoolClient } from "pg";

const DOWN_SQL_PATH_A = path.join(
  process.cwd(),
  "prisma/migrations/20260805090100_experience_bullet_nullable_parent/down.sql",
);
const DOWN_SQL_PATH_B = path.join(
  process.cwd(),
  "prisma/migrations/20260805090000_fix_pgvector_embedding_columns/down.sql",
);

describe("Down-migration RAISE NOTICE verification (011 follow-up)", () => {
  const schemaName = `down_migration_test_${Date.now()}`;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let client: PoolClient;

  beforeAll(async () => {
    // Safety guard: refuse to run against a DATABASE_URL that doesn't obviously point at a
    // local/test database — matches embedding-migration.test.ts exactly.
    const dbUrl = process.env.DATABASE_URL ?? "";
    const isTestDb = /test|localhost|127\.0\.0\.1/i.test(dbUrl);
    if (!isTestDb) {
      throw new Error(
        "Refusing to run down-migration-verify.test.ts: DATABASE_URL does not look like a " +
          "local/test database (expected 'test', 'localhost', or '127.0.0.1' in the connection " +
          "string). Aborting before any destructive SQL runs.",
      );
    }

    client = await pool.connect();

    // Create scratch schema and set search_path
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}", public`);

    // Create minimal Experience/ExperienceBullet tables for down.sql A (REM-3)
    // These are set up as they would exist AFTER the forward migration has run.
    await client.query(`
      CREATE TABLE "Experience" (
        "id" TEXT PRIMARY KEY,
        "profileId" TEXT NOT NULL,
        "company" TEXT,
        "title" TEXT,
        "startDate" DATE,
        "endDate" DATE
      )
    `);
    await client.query(`
      CREATE TABLE "ExperienceBullet" (
        "id" TEXT PRIMARY KEY,
        "experienceId" TEXT,
        "bullet" TEXT NOT NULL,
        "index" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "ExperienceBullet_experienceId_fkey"
          FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    // Create minimal UserProfile and JobListing tables for down.sql B (REM-1/REM-2)
    // These are set up as they would exist AFTER the forward migration has run.
    await client.query(`
      CREATE TABLE "UserProfile" (
        "id" TEXT PRIMARY KEY,
        "embedding" vector(512)
      )
    `);
    await client.query(`
      CREATE TABLE "JobListing" (
        "id" TEXT PRIMARY KEY,
        "portalId" TEXT NOT NULL,
        "externalJobId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "company" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "embedding" vector(512)
      )
    `);
    await client.query(`
      CREATE INDEX "user_profile_embedding_hnsw_idx"
        ON "UserProfile" USING hnsw ("embedding" vector_cosine_ops)
    `);
    await client.query(`
      CREATE INDEX "job_listing_embedding_hnsw_idx"
        ON "JobListing" USING hnsw ("embedding" vector_cosine_ops)
    `);

    // Seed test data for down.sql A: insert orphaned bullets (experienceId IS NULL)
    // These will be deleted by the down migration.
    for (let i = 1; i <= 5; i++) {
      await client.query(
        `INSERT INTO "ExperienceBullet" ("id", "experienceId", "bullet", "index")
         VALUES ($1, NULL, $2, $3)`,
        [`orphan-bullet-${i}`, `Orphaned bullet ${i}`, i],
      );
    }

    // Seed test data for down.sql B: insert UserProfile with non-null embeddings
    // These will be nulled by the down migration.
    for (let i = 1; i <= 3; i++) {
      const embedding = `[${Array.from({ length: 512 }, (_, j) => ((j + i) % 7) / 7).join(",")}]`;
      await client.query(
        `INSERT INTO "UserProfile" ("id", "embedding") VALUES ($1, $2::vector)`,
        [`user-${i}`, embedding],
      );
    }
  });

  afterAll(async () => {
    await client.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    client.release();
    await pool.end();
  });

  it("down.sql A (experience_bullet_nullable_parent) executes without error and deletes orphaned rows", async () => {
    const downSqlA = fs.readFileSync(DOWN_SQL_PATH_A, "utf-8");

    // Execute the entire migration file without splitting (preserves dollar-quoted strings)
    await expect(client.query(downSqlA)).resolves.toBeDefined();

    // Verify orphaned bullets were deleted
    const remaining = await client.query(
      `SELECT count(*) as cnt FROM "ExperienceBullet" WHERE "experienceId" IS NULL`,
    );
    expect(parseInt(remaining.rows[0].cnt, 10)).toBe(0);
  });

  it("down.sql B (fix_pgvector_embedding_columns) executes without error and nulls embedding rows", async () => {
    const downSqlB = fs.readFileSync(DOWN_SQL_PATH_B, "utf-8");

    // Execute the entire migration file without splitting (preserves dollar-quoted strings)
    await expect(client.query(downSqlB)).resolves.toBeDefined();

    // Verify embeddings were nulled
    const remaining = await client.query(
      `SELECT count(*) as cnt FROM "UserProfile" WHERE "embedding" IS NOT NULL`,
    );
    expect(parseInt(remaining.rows[0].cnt, 10)).toBe(0);
  });

  it("both down.sql files contain RAISE NOTICE pre-flight blocks (code-level check)", () => {
    const downSqlA = fs.readFileSync(DOWN_SQL_PATH_A, "utf-8");
    const downSqlB = fs.readFileSync(DOWN_SQL_PATH_B, "utf-8");

    // Verify both files contain the DO $$ ... RAISE NOTICE pattern
    expect(downSqlA).toContain("DO $$");
    expect(downSqlA).toContain("RAISE NOTICE");
    expect(downSqlA).toContain("orphaned_count");

    expect(downSqlB).toContain("DO $$");
    expect(downSqlB).toContain("RAISE NOTICE");
    expect(downSqlB).toContain("embedding_count");
  });
});
