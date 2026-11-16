/**
 * @jest-environment node
 *
 * Migration verification (T015, APC-45 — AC.2, AC.3):
 * Applies the Prisma migration chain up to `20261113120000_embeddings_1024d` inside an isolated
 * PostgreSQL scratch schema (scoped via `search_path`), seeding pre-migration 768d vectors and
 * non-vector records before applying `20261113120000_embeddings_1024d` and subsequent migrations.
 *
 * Asserts:
 *   (a) `UserProfile.embedding`, `JobListing.embedding`, and `SkillEmbedding.embedding` are
 *       migrated to `vector(1024)`.
 *   (b) All 4 HNSW cosine indexes (`user_profile_embedding_hnsw_idx`,
 *       `job_listing_embedding_hnsw_idx`, `skill_embedding_hard_hnsw_idx`,
 *       `skill_embedding_soft_hnsw_idx`) exist.
 *   (c) `SkillEmbedding` and `SkillAlias` are cleared (cascade delete), `UserProfile.embedding`
 *       and `UserProfile.embeddingSyncedAt` are nulled, `JobListing.embedding` is nulled, and
 *       `JobListing.classificationStatus` remains `'COMPLETED'`.
 *   (d) Non-vector data (`profileFacts`, `jobFacts`, `Application`, `UserPreferences`) is 100%
 *       preserved.
 *   (e) 1024-dim embedding writes succeed on all three tables and `getJobsWithSimilarity`'s cosine
 *       ranking query executes cleanly.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { Pool, type PoolClient } from "pg";
import { EMBEDDING_DIMENSION } from "@/lib/ai/vector-service";
import { makeTestEmail, safeCleanup } from "./helpers/test-fixtures";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma/migrations");
const TARGET_MIGRATION = "20261113120000_embeddings_1024d";

const migrationDirs = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((name) =>
    fs.existsSync(path.join(MIGRATIONS_DIR, name, "migration.sql")),
  )
  .sort();

const targetIdx = migrationDirs.indexOf(TARGET_MIGRATION);
if (targetIdx === -1) {
  throw new Error(
    `Could not find ${TARGET_MIGRATION} under ${MIGRATIONS_DIR}`,
  );
}

const PRE_1024_MIGRATIONS = migrationDirs.slice(0, targetIdx);
const POST_AND_TARGET_MIGRATIONS = migrationDirs.slice(targetIdx);

function embeddingLiteral(dim: number, seed: number): string {
  return `[${Array.from({ length: dim }, (_, i) => ((i + seed) % 7) / 7).join(",")}]`;
}

describe("Embedding pgvector 1024d schema migration proof (T015, APC-45)", () => {
  const schemaName = `embedding_migration_test_${Date.now()}`;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let client: PoolClient;

  const expectedProfileFacts = {
    skills: ["TypeScript", "PostgreSQL"],
    seniority: "senior",
  };
  const expectedJobFacts = {
    mustHave: ["TypeScript", "PostgreSQL"],
    niceToHave: ["Docker"],
  };

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL ?? "";
    const isTestDb = /test|localhost|127\.0\.0\.1/i.test(dbUrl);
    if (!isTestDb) {
      throw new Error(
        "Refusing to run embedding-migration.test.ts: DATABASE_URL does not look like a " +
          "local/test database (expected 'test', 'localhost', or '127.0.0.1' in the connection " +
          "string). Aborting before any destructive SQL runs.",
      );
    }

    client = await pool.connect();

    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}", public`);

    // 1. Apply all migrations prior to 20261113120000_embeddings_1024d (768d schema).
    for (const dir of PRE_1024_MIGRATIONS) {
      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, dir, "migration.sql"),
        "utf-8",
      );
      await client.query(sql);
    }

    // 2. Seed pre-migration 768d vectors and non-vector records.
    const vec768 = embeddingLiteral(768, 1);
    const testEmail = makeTestEmail("mig-1024d");

    await client.query(
      `INSERT INTO "User" (id, email, password) VALUES ('mig-user-1', $1, 'x')`,
      [testEmail],
    );
    await client.query(
      `INSERT INTO "UserProfile" (id, "userId", "profileFacts", "embedding", "embeddingSyncedAt", "updatedAt")
       VALUES ('mig-profile-1', 'mig-user-1', $1::jsonb, $2::vector, now(), now())`,
      [JSON.stringify(expectedProfileFacts), vec768],
    );
    await client.query(
      `INSERT INTO "UserPreferences" (id, "profileId", seniority, "salaryMin", "updatedAt")
       VALUES ('mig-prefs-1', 'mig-profile-1', 'senior', 120000, now())`,
    );
    await client.query(
      `INSERT INTO "JobListing" (
        id, "portalId", "externalJobId", title, company, url,
        "jobFacts", "embedding", "classificationStatus", "createdAt", "updatedAt"
      )
      VALUES (
        'mig-job-1', 'portal-1', 'ext-1', 'Senior Engineer', 'Acme Inc', 'https://example.com/job/1',
        $1::jsonb, $2::vector, 'COMPLETED', now(), now()
      )`,
      [JSON.stringify(expectedJobFacts), vec768],
    );
    await client.query(
      `INSERT INTO "CV" (id, "profileId", "jobListingId", name, "snapshotData", "updatedAt")
       VALUES ('mig-cv-1', 'mig-profile-1', 'mig-job-1', 'Tailored CV', '{}'::jsonb, now())`,
    );
    await client.query(
      `INSERT INTO "Application" (id, "cvId", "profileId", "jobListingId", stage, "updatedAt")
       VALUES ('mig-app-1', 'mig-cv-1', 'mig-profile-1', 'mig-job-1', 'APPLIED', now())`,
    );
    await client.query(
      `INSERT INTO "SkillEmbedding" (skill, "displayName", kind, embedding)
       VALUES ('typescript', 'TypeScript', 'HARD', $1::vector)`,
      [vec768],
    );
    await client.query(
      `INSERT INTO "SkillAlias" (alias, skill) VALUES ('ts', 'typescript')`,
    );

    // 3. Apply 20261113120000_embeddings_1024d and any subsequent migrations.
    for (const dir of POST_AND_TARGET_MIGRATIONS) {
      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, dir, "migration.sql"),
        "utf-8",
      );
      await expect(client.query(sql)).resolves.toBeDefined();
    }
  });

  afterAll(async () => {
    await safeCleanup("embedding-migration.test.ts schema drop", async () => {
      if (client) {
        await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        client.release();
      }
      await pool.end();
    });
  });

  it("(a) migrates UserProfile, JobListing, and SkillEmbedding columns to vector(1024)", async () => {
    const res = await client.query<{
      table_name: string;
      column_type: string;
    }>(
      `
      SELECT
        c.relname AS table_name,
        format_type(a.atttypid, a.atttypmod) AS column_type
      FROM pg_attribute a
      JOIN pg_class c ON a.attrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = $1
        AND c.relname IN ('UserProfile', 'JobListing', 'SkillEmbedding')
        AND a.attname = 'embedding'
        AND NOT a.attisdropped
      ORDER BY c.relname
      `,
      [schemaName],
    );

    expect(res.rows).toEqual([
      { table_name: "JobListing", column_type: "vector(1024)" },
      { table_name: "SkillEmbedding", column_type: "vector(1024)" },
      { table_name: "UserProfile", column_type: "vector(1024)" },
    ]);
  });

  it("(b) rebuilds all 4 HNSW cosine similarity indexes for 1024d", async () => {
    const idxCheck = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname IN (
         'user_profile_embedding_hnsw_idx',
         'job_listing_embedding_hnsw_idx',
         'skill_embedding_hard_hnsw_idx',
         'skill_embedding_soft_hnsw_idx'
       )`,
      [schemaName],
    );

    expect(idxCheck.rows.map((r) => r.indexname).sort()).toEqual([
      "job_listing_embedding_hnsw_idx",
      "skill_embedding_hard_hnsw_idx",
      "skill_embedding_soft_hnsw_idx",
      "user_profile_embedding_hnsw_idx",
    ]);
  });

  it("(c) clears SkillEmbedding (cascading SkillAlias), nulls UserProfile.embeddingSyncedAt and vectors, and keeps JobListing COMPLETED", async () => {
    const skillCount = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "SkillEmbedding"`,
    );
    const aliasCount = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "SkillAlias"`,
    );
    expect(Number(skillCount.rows[0].count)).toBe(0);
    expect(Number(aliasCount.rows[0].count)).toBe(0);

    const profileRow = await client.query<{
      has_embedding: boolean;
      embeddingSyncedAt: Date | null;
    }>(
      `SELECT "embedding" IS NOT NULL AS has_embedding, "embeddingSyncedAt"
       FROM "UserProfile" WHERE id = 'mig-profile-1'`,
    );
    expect(profileRow.rows[0].has_embedding).toBe(false);
    expect(profileRow.rows[0].embeddingSyncedAt).toBeNull();

    const jobRow = await client.query<{
      has_embedding: boolean;
      classificationStatus: string;
    }>(
      `SELECT "embedding" IS NOT NULL AS has_embedding, "classificationStatus"
       FROM "JobListing" WHERE id = 'mig-job-1'`,
    );
    expect(jobRow.rows[0].has_embedding).toBe(false);
    expect(jobRow.rows[0].classificationStatus).toBe("COMPLETED");
  });

  it("(d) preserves 100% of non-vector data (profileFacts, jobFacts, Application, UserPreferences)", async () => {
    const profileRow = await client.query<{ profileFacts: unknown }>(
      `SELECT "profileFacts" FROM "UserProfile" WHERE id = 'mig-profile-1'`,
    );
    expect(profileRow.rows[0].profileFacts).toEqual(expectedProfileFacts);

    const jobRow = await client.query<{ jobFacts: unknown }>(
      `SELECT "jobFacts" FROM "JobListing" WHERE id = 'mig-job-1'`,
    );
    expect(jobRow.rows[0].jobFacts).toEqual(expectedJobFacts);

    const appRow = await client.query<{ stage: string; cvId: string }>(
      `SELECT stage, "cvId" FROM "Application" WHERE id = 'mig-app-1'`,
    );
    expect(appRow.rows[0]).toEqual({ stage: "APPLIED", cvId: "mig-cv-1" });

    const prefsRow = await client.query<{
      seniority: string;
      salaryMin: number;
    }>(
      `SELECT seniority, "salaryMin" FROM "UserPreferences" WHERE id = 'mig-prefs-1'`,
    );
    expect(prefsRow.rows[0]).toEqual({ seniority: "senior", salaryMin: 120000 });
  });

  it("(e) writes 1024-dim embeddings to UserProfile, JobListing, and SkillEmbedding and executes cosine similarity ranking", async () => {
    expect(EMBEDDING_DIMENSION).toBe(1024);

    const profileVec = embeddingLiteral(EMBEDDING_DIMENSION, 1);
    const jobVec = embeddingLiteral(EMBEDDING_DIMENSION, 2);
    const skillVec = embeddingLiteral(EMBEDDING_DIMENSION, 3);

    await expect(
      client.query(
        `UPDATE "UserProfile" SET "embedding" = $1::vector WHERE "id" = 'mig-profile-1'`,
        [profileVec],
      ),
    ).resolves.toBeDefined();

    await expect(
      client.query(
        `UPDATE "JobListing"
         SET "embedding" = $1::vector, "updatedAt" = NOW()
         WHERE "id" = 'mig-job-1'`,
        [jobVec],
      ),
    ).resolves.toBeDefined();

    await expect(
      client.query(
        `INSERT INTO "SkillEmbedding" (skill, "displayName", kind, embedding)
         VALUES ('postgresql', 'PostgreSQL', 'HARD', $1::vector)`,
        [skillVec],
      ),
    ).resolves.toBeDefined();

    const result = await client.query<{ id: string; matchScore: number }>(
      `
      SELECT
        id,
        ((1 - (embedding <=> $1::vector)) * 100) as "matchScore"
      FROM "JobListing"
      WHERE "classificationStatus" = 'COMPLETED'
        AND ("postedAt" >= NOW() - $2 * INTERVAL '1 day' OR "postedAt" IS NULL)
      ORDER BY "matchScore" DESC
      LIMIT $3;
      `,
      [profileVec, 15, 50],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe("mig-job-1");
    expect(typeof result.rows[0].matchScore).toBe("number");
  });
});
