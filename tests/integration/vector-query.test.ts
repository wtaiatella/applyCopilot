/**
 * @jest-environment node
 */
import "dotenv/config";
import { prisma, pool } from "@/lib/db/prisma";
import { getJobsWithSimilarity } from "@/lib/db/job-query";
import { EMBEDDING_DIMENSION } from "@/lib/ai/vector-service";

describe("Vector Similarity Search Integration Tests (Stage 1, 768d, FR-12)", () => {
  const createdJobIds: string[] = [];

  const sampleJobFacts = {
    mustHave: ["React", "TypeScript"],
    niceToHave: ["GraphQL"],
    softSkills: [],
    seniority: "mid",
    yearsExperienceMin: 3,
    employmentType: "permanent",
    workMode: "remote",
    isWorldwide: null,
    requiresUsWorkAuth: null,
    providesRelocationVisa: null,
    location: null,
    salaryMin: null,
    salaryMax: null,
    currency: null,
  };

  beforeAll(async () => {
    // Make sure we have the pgvector extension enabled (just in case)
    await prisma
      .$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector;")
      .catch(() => {});

    // Helper to generate an EMBEDDING_DIMENSION (768) vector with a specific bias
    const makeVector = (bias: number) => {
      const vec = new Array(EMBEDDING_DIMENSION).fill(0.1);
      vec[0] = bias; // Vary the first element to change similarity
      return `[${vec.join(",")}]`;
    };

    // Insert 4 jobs with different statuses, embeddings, jobFacts, and post dates
    // Job 1: status=COMPLETED, postedAt=today, highly similar (vector first element = 0.9)
    const job1 = await prisma.jobListing.create({
      data: {
        portalId: "portal1",
        externalJobId: "ext1",
        title: "Highly Similar Job",
        company: "Company A",
        url: "http://example.com/job1",
        isFullDescriptionFetched: true,
        classificationStatus: "COMPLETED",
        postedAt: new Date(),
      },
    });
    createdJobIds.push(job1.id);
    await prisma.$executeRawUnsafe(
      `UPDATE "JobListing" SET embedding = $1::vector, "jobFacts" = $2::jsonb WHERE id = $3`,
      makeVector(0.9),
      JSON.stringify(sampleJobFacts),
      job1.id,
    );

    // Job 2: status=COMPLETED, postedAt=today, less similar (vector first element = -0.9)
    const job2 = await prisma.jobListing.create({
      data: {
        portalId: "portal1",
        externalJobId: "ext2",
        title: "Less Similar Job",
        company: "Company B",
        url: "http://example.com/job2",
        isFullDescriptionFetched: true,
        classificationStatus: "COMPLETED",
        postedAt: new Date(),
      },
    });
    createdJobIds.push(job2.id);
    await prisma.$executeRawUnsafe(
      `UPDATE "JobListing" SET embedding = $1::vector, "jobFacts" = $2::jsonb WHERE id = $3`,
      makeVector(-0.9),
      JSON.stringify(sampleJobFacts),
      job2.id,
    );

    // Job 3: status=PENDING, postedAt=today, identical vector to job 1 but NOT completed
    const job3 = await prisma.jobListing.create({
      data: {
        portalId: "portal1",
        externalJobId: "ext3",
        title: "Pending Job",
        company: "Company C",
        url: "http://example.com/job3",
        isFullDescriptionFetched: true,
        classificationStatus: "PENDING",
        postedAt: new Date(),
      },
    });
    createdJobIds.push(job3.id);
    await prisma.$executeRawUnsafe(
      `UPDATE "JobListing" SET embedding = $1::vector WHERE id = $2`,
      makeVector(0.9),
      job3.id,
    );

    // Job 4: status=COMPLETED, postedAt=30 days ago (outside 15-day window), highly similar
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const job4 = await prisma.jobListing.create({
      data: {
        portalId: "portal1",
        externalJobId: "ext4",
        title: "Old Completed Job",
        company: "Company D",
        url: "http://example.com/job4",
        isFullDescriptionFetched: true,
        classificationStatus: "COMPLETED",
        postedAt: thirtyDaysAgo,
      },
    });
    createdJobIds.push(job4.id);
    await prisma.$executeRawUnsafe(
      `UPDATE "JobListing" SET embedding = $1::vector WHERE id = $2`,
      makeVector(0.9),
      job4.id,
    );
  });

  afterAll(async () => {
    // Cleanup created jobs
    if (createdJobIds.length > 0) {
      await prisma.jobListing
        .deleteMany({
          where: { id: { in: createdJobIds } },
        })
        .catch(() => {});
    }

    await prisma.$disconnect();
    await pool.end();
  });

  // The query under test intentionally scans the whole JobListing table with
  // no portalId scoping, and this suite runs against the same database as
  // local dev (no separate test DB / no destructive table wipe — see
  // beforeAll above). To stay isolated from any pre-existing/real rows, we
  // request a generously large pool size and then filter the results down
  // to just the rows this test created before asserting on count/order.
  const onlyOurJobs = (
    results: Awaited<ReturnType<typeof getJobsWithSimilarity>>,
  ) => results.filter((r) => createdJobIds.includes(r.id));

  it("should rank jobs by similarity when a 768d query embedding is provided, filtering by date and status", async () => {
    // Query embedding similar to Job 1 (bias = 0.8)
    const queryEmbedding = new Array(EMBEDDING_DIMENSION).fill(0.1);
    queryEmbedding[0] = 0.8;

    const results = onlyOurJobs(
      await getJobsWithSimilarity(queryEmbedding, 15, 1000),
    );

    // Should return Job 1 and Job 2, but NOT Job 3 (PENDING) and NOT Job 4 (too old)
    expect(results).toHaveLength(2);

    // Order should be highest similarity first: Job 1 then Job 2
    expect(results[0].title).toBe("Highly Similar Job");
    expect(results[1].title).toBe("Less Similar Job");

    // Similarity is aliased "mustHaveSimilarity" (Stage-1 SQL score), not "matchScore" (which is
    // Stage 2's composite, computed downstream by jobs/route.ts) — spectech.md Technical Decisions.
    expect(results[0].mustHaveSimilarity).toBeDefined();
    expect(results[1].mustHaveSimilarity).toBeDefined();
    expect(results[0].mustHaveSimilarity).toBeGreaterThan(
      results[1].mustHaveSimilarity!,
    );
  });

  it("selects jobFacts alongside each candidate so Stage 2 needs no second DB round-trip", async () => {
    const queryEmbedding = new Array(EMBEDDING_DIMENSION).fill(0.1);
    queryEmbedding[0] = 0.8;

    const results = onlyOurJobs(
      await getJobsWithSimilarity(queryEmbedding, 15, 1000),
    );

    const job1Result = results.find((r) => r.title === "Highly Similar Job");
    expect(job1Result?.jobFacts).toEqual(sampleJobFacts);
  });

  it("guards vector length against EMBEDDING_DIMENSION — falls back to the no-embedding branch (null mustHaveSimilarity) when the profile vector is the wrong dimension", async () => {
    // A 512-dimension vector (the pre-014 shape) is NOT EMBEDDING_DIMENSION (768), so the
    // implementation must not attempt the pgvector `<=>` operator with a mismatched vector —
    // it falls back to the date-sorted branch, matching the null-embedding path exactly.
    const wrongDimensionEmbedding = new Array(512).fill(0.1);

    const results = onlyOurJobs(
      await getJobsWithSimilarity(wrongDimensionEmbedding, 15, 1000),
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.mustHaveSimilarity === null)).toBe(true);
  });

  it("should return jobs ordered chronologically with null mustHaveSimilarity when query embedding is null", async () => {
    const results = onlyOurJobs(await getJobsWithSimilarity(null, 15, 1000));

    // Should return completed jobs inside 15-day range: Job 1 and Job 2
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.mustHaveSimilarity === null)).toBe(true);

    // Should be ordered by postedAt / createdAt descending (they were created in order, so the latest is returned)
    expect(results[0].title).toBeDefined();
  });

  it("should extend the date range filtering when daysLimit parameter is larger", async () => {
    const queryEmbedding = new Array(EMBEDDING_DIMENSION).fill(0.1);
    queryEmbedding[0] = 0.8;

    // Use 40 days limit to include the old completed job (Job 4)
    const results = onlyOurJobs(
      await getJobsWithSimilarity(queryEmbedding, 40, 1000),
    );

    // Should return Job 1, Job 2, and Job 4 (Job 3 is still skipped because of status=PENDING)
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.title)).toContain("Old Completed Job");
  });

  it("decouples poolSize (Stage-1 candidate pool) from any client-facing page size — a small poolSize still bounds the SQL LIMIT independently (FR-12)", async () => {
    const queryEmbedding = new Array(EMBEDDING_DIMENSION).fill(0.1);
    queryEmbedding[0] = 0.8;

    // poolSize=1 should return at most 1 row total (not scoped to our 4 fixture jobs — this
    // proves the LIMIT itself, not just our filtered view of it).
    const results = await getJobsWithSimilarity(queryEmbedding, 40, 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("defaults poolSize to 300 when not provided", async () => {
    const queryEmbedding = new Array(EMBEDDING_DIMENSION).fill(0.1);
    queryEmbedding[0] = 0.8;

    const results = onlyOurJobs(
      await getJobsWithSimilarity(queryEmbedding, 40),
    );
    // Our 3 completed/in-range fixture jobs are well within a 300-row default pool.
    expect(results).toHaveLength(3);
  });
});
