/**
 * @jest-environment node
 */
import "dotenv/config";
import { prisma, pool } from "@/lib/db/prisma";
import { sweepTestData } from "@/lib/testing/test-data-marker";
import { safeCleanup } from "./helpers/test-fixtures";

describe("sweepTestData — deletes @example.com-marked users, leaves real data alone (US5, T016)", () => {
  const testEmail = `db-cleanup-sweep-${Date.now()}@example.com`;
  let markedUserId: string;
  let realJobListingId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Sweep", lastName: "Tester" } },
      },
      include: { profile: true },
    });
    markedUserId = user.id;

    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "db-cleanup-sweep-real-portal",
        externalJobId: `db-cleanup-sweep-real-job-${Date.now()}-${Math.random()}`,
        title: "Real Backend Engineer",
        company: "Real Company",
        url: "https://real-job-board.test/job",
      },
    });
    realJobListingId = jobListing.id;
  });

  afterAll(async () => {
    await safeCleanup("db-cleanup-sweep.test.ts afterAll", async () => {
      await prisma.jobListing.delete({ where: { id: realJobListingId } });
    });
    await prisma.$disconnect();
    await pool.end();
  });

  it("deletes the marked user (and cascaded profile) while leaving non-marked JobListing rows untouched", async () => {
    const result = await sweepTestData(prisma, { execute: true });

    expect(result.matchedUserCount).toBeGreaterThanOrEqual(1);
    expect(result.deletedUserCount).toBe(result.matchedUserCount);

    const markedUser = await prisma.user.findUnique({
      where: { id: markedUserId },
    });
    expect(markedUser).toBeNull();

    const markedProfile = await prisma.userProfile.findUnique({
      where: { userId: markedUserId },
    });
    expect(markedProfile).toBeNull();

    const realJobListing = await prisma.jobListing.findUnique({
      where: { id: realJobListingId },
    });
    expect(realJobListing).not.toBeNull();
  });
});
