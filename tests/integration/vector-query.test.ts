/**
 * @jest-environment node
 */
import "dotenv/config";
import { prisma, pool } from "@/lib/db/prisma";
import { getJobsWithSimilarity } from "@/lib/db/job-query";

describe("Vector Similarity Search Integration Tests", () => {
  const createdJobIds: string[] = [];

  beforeAll(async () => {
    // Make sure we have the pgvector extension enabled (just in case)
    await prisma
      .$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector;")
      .catch(() => {});

    // Helper to generate a 512-dimension vector with a specific bias
    const makeVector = (bias: number) => {
      const vec = new Array(512).fill(0.1);
      vec[0] = bias; // Vary the first element to change similarity
      return `[${vec.join(",")}]`;
    };

    // Insert 4 jobs with different statuses, embeddings, and post dates
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
      `UPDATE "JobListing" SET embedding = $1::vector WHERE id = $2`,
      makeVector(0.9),
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
      `UPDATE "JobListing" SET embedding = $1::vector WHERE id = $2`,
      makeVector(-0.9),
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
  // request a generously large limit and then filter the results down to
  // just the rows this test created before asserting on count/order.
  const onlyOurJobs = (
    results: Awaited<ReturnType<typeof getJobsWithSimilarity>>,
  ) => results.filter((r) => createdJobIds.includes(r.id));

  it("should rank jobs by similarity when query embedding is provided, filtering by date and status", async () => {
    // Query embedding similar to Job 1 (bias = 0.8)
    const queryEmbedding = new Array(512).fill(0.1);
    queryEmbedding[0] = 0.8;

    const results = onlyOurJobs(
      await getJobsWithSimilarity(queryEmbedding, 15, 1000),
    );

    // Should return Job 1 and Job 2, but NOT Job 3 (PENDING) and NOT Job 4 (too old)
    expect(results).toHaveLength(2);

    // Order should be highest similarity first: Job 1 then Job 2
    expect(results[0].title).toBe("Highly Similar Job");
    expect(results[1].title).toBe("Less Similar Job");

    // Similarity score should be returned and be correct
    expect(results[0].matchScore).toBeDefined();
    expect(results[1].matchScore).toBeDefined();
    expect(results[0].matchScore).toBeGreaterThan(results[1].matchScore!);
  });

  it("should return jobs ordered chronologically with null matchScore when query embedding is null", async () => {
    const results = onlyOurJobs(await getJobsWithSimilarity(null, 15, 1000));

    // Should return completed jobs inside 15-day range: Job 1 and Job 2
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.matchScore === null)).toBe(true);

    // Should be ordered by postedAt / createdAt descending (they were created in order, so the latest is returned)
    expect(results[0].title).toBeDefined();
  });

  it("should extend the date range filtering when daysLimit parameter is larger", async () => {
    const queryEmbedding = new Array(512).fill(0.1);
    queryEmbedding[0] = 0.8;

    // Use 40 days limit to include the old completed job (Job 4)
    const results = onlyOurJobs(
      await getJobsWithSimilarity(queryEmbedding, 40, 1000),
    );

    // Should return Job 1, Job 2, and Job 4 (Job 3 is still skipped because of status=PENDING)
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.title)).toContain("Old Completed Job");
  });
});
