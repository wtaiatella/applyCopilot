/**
 * @jest-environment node
 *
 * Migration verification (T011, spec 008-critical-fix, US3):
 * Simulates the pre-fix, per-jobId-only `JobAnalysis` production shape on an
 * isolated scratch schema (a dedicated Postgres schema inside the same
 * database — the DB user has no CREATEDB privilege, so a true separate
 * database is not available; a scratch schema gives the same isolation
 * guarantee without touching real "public" tables), seeds legacy-shaped
 * rows, applies the actual migration SQL file unmodified, and asserts:
 *   (a) the migration completes without error,
 *   (b) the table is empty of legacy rows post-migration,
 *   (c) the composite (profileId, jobId) unique index exists and rejects
 *       a duplicate insert.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { Pool, type PoolClient } from "pg";

const MIGRATION_SQL_PATH = path.join(
  process.cwd(),
  "prisma/migrations/20260803111436_scope_job_analysis_by_profile/migration.sql",
);

describe("JobAnalysis legacy-row remediation migration (T011)", () => {
  const schemaName = `legacy_test_${Date.now()}`;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let client: PoolClient;

  beforeAll(async () => {
    // Safety guard: refuse to run any destructive schema/table operation
    // against a DATABASE_URL that doesn't obviously point at a local/test
    // database. This is a scratch-schema test, but a misconfigured
    // DATABASE_URL (e.g. pointed at staging/production) must never be able
    // to reach real tables — fail loudly before any query runs.
    const dbUrl = process.env.DATABASE_URL ?? "";
    const isTestDb = /test|localhost|127\.0\.0\.1/i.test(dbUrl);
    if (!isTestDb) {
      throw new Error(
        "Refusing to run job-analysis-migration.test.ts: DATABASE_URL does not " +
          "look like a local/test database (expected 'test', 'localhost', or " +
          "'127.0.0.1' in the connection string). Aborting before any " +
          "destructive SQL runs.",
      );
    }

    client = await pool.connect();

    await client.query(`CREATE SCHEMA "${schemaName}"`);
    // Local schema first in search_path so unqualified names in the
    // migration file (the actual artifact under test) resolve to our
    // scratch tables, not "public". The migration file itself is
    // intentionally run unmodified via this search_path scoping — see the
    // module doc comment. Everything below that is this test's OWN
    // setup/seed/cleanup SQL is schema-qualified explicitly so it can never
    // touch "public" tables even if search_path gets reset mid-test.
    await client.query(`SET search_path TO "${schemaName}", public`);

    // Minimal FK targets, mirroring the real UserProfile/JobListing tables
    // only to the extent JobAnalysis's own constraints need them.
    await client.query(
      `CREATE TABLE "${schemaName}"."UserProfile" (id TEXT PRIMARY KEY)`,
    );
    await client.query(
      `CREATE TABLE "${schemaName}"."JobListing" (id TEXT PRIMARY KEY)`,
    );

    // Pre-fix JobAnalysis shape: no profileId column, single-column unique
    // index on jobId only — the actual current-production shape this
    // migration must remediate.
    await client.query(`
      CREATE TABLE "${schemaName}"."JobAnalysis" (
        id TEXT PRIMARY KEY,
        "jobId" TEXT NOT NULL,
        strengths TEXT[] NOT NULL DEFAULT '{}',
        weaknesses TEXT[] NOT NULL DEFAULT '{}',
        "missingSkills" TEXT[] NOT NULL DEFAULT '{}',
        verdict "public"."RecommendationVerdict" NOT NULL DEFAULT 'CAUTION',
        justification TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "JobAnalysis_jobId_fkey" FOREIGN KEY ("jobId")
          REFERENCES "${schemaName}"."JobListing"(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await client.query(
      `CREATE UNIQUE INDEX "JobAnalysis_jobId_key" ON "${schemaName}"."JobAnalysis"("jobId")`,
    );

    // Seed legacy pre-fix rows (unique on jobId, no profileId at all —
    // simulating the current production shape's cross-tenant-unsafe cache).
    await client.query(
      `INSERT INTO "${schemaName}"."JobListing"(id) VALUES ('job-1'), ('job-2'), ('job-3')`,
    );
    await client.query(`
      INSERT INTO "${schemaName}"."JobAnalysis"(id, "jobId", justification)
      VALUES
        ('legacy-1', 'job-1', 'legacy justification 1'),
        ('legacy-2', 'job-2', 'legacy justification 2'),
        ('legacy-3', 'job-3', 'legacy justification 3')
    `);
  });

  afterAll(async () => {
    await client.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    client.release();
    await pool.end();
  });

  it("(a) applies the migration file without error against legacy-shaped rows", async () => {
    const migrationSql = fs.readFileSync(MIGRATION_SQL_PATH, "utf-8");

    // Sanity check: legacy rows are present before the migration runs.
    const preCount = await client.query(
      `SELECT COUNT(*)::int AS count FROM "${schemaName}"."JobAnalysis"`,
    );
    expect(preCount.rows[0].count).toBe(3);

    // The migration file itself is run unmodified and unqualified,
    // intentionally relying on search_path scoping (set in beforeAll) so it
    // exercises the real migration artifact exactly as it runs in
    // production — this is the one deliberate exception to schema
    // qualification in this file.
    await expect(client.query(migrationSql)).resolves.toBeDefined();
  });

  it("(b) leaves the table empty of legacy rows post-migration", async () => {
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM "${schemaName}"."JobAnalysis"`,
    );
    expect(result.rows[0].count).toBe(0);
  });

  it("(c) creates the composite (profileId, jobId) unique index and rejects duplicate inserts", async () => {
    const indexResult = await client.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname = 'JobAnalysis_profileId_jobId_key'`,
      [schemaName],
    );
    expect(indexResult.rows).toHaveLength(1);

    // A duplicate (profileId, jobId) pair must now be rejected by the DB.
    await client.query(
      `INSERT INTO "${schemaName}"."UserProfile"(id) VALUES ('profile-1')`,
    );
    await client.query(`
      INSERT INTO "${schemaName}"."JobAnalysis"(id, "profileId", "jobId", justification)
      VALUES ('post-migration-1', 'profile-1', 'job-1', 'first analysis')
    `);

    await expect(
      client.query(`
        INSERT INTO "${schemaName}"."JobAnalysis"(id, "profileId", "jobId", justification)
        VALUES ('post-migration-2', 'profile-1', 'job-1', 'duplicate analysis')
      `),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
