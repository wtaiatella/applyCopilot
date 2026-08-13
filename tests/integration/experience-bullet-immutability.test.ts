/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as createExperienceHandler } from "@/app/api/profile/experiences/route";
import { PUT as putExperienceHandler } from "@/app/api/profile/experiences/[id]/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

describe("PUT /api/profile/experiences/[id] — tagged-bullet delete archives instead of hard-deleting (US-2, AC.2, AC.3, AC.7)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `experience-bullet-immutability-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Immutability", lastName: "Tester" } },
      },
      include: { profile: true },
    });
    testUserId = user.id;
    testProfileId = user.profile!.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: testUserId, email: testEmail, role: "USER" },
      expires: "any",
    });
  });

  function putExperience(id: string, body: Record<string, unknown>) {
    const req = new Request(
      `http://localhost:3000/api/profile/experiences/${id}`,
      { method: "PUT", body: JSON.stringify(body) },
    );
    return putExperienceHandler(req, { params: Promise.resolve({ id }) });
  }

  async function createExperience(text: string) {
    const req = new Request("http://localhost:3000/api/profile/experiences", {
      method: "POST",
      body: JSON.stringify({
        company: "Acme Corp",
        position: "Staff Engineer",
        startDate: new Date("2023-01-01").toISOString(),
        current: true,
        bullets: [{ text, type: "BULLET", sortOrder: 0 }],
      }),
    });
    const res = await createExperienceHandler(req);
    expect(res.status).toBe(201);
    const created = await res.json();
    return {
      experienceId: created.id as string,
      bulletId: created.bullets[0].id as string,
    };
  }

  it("(a) archives (not hard-deletes) a tagged bullet omitted from the PUT bullets array; CVBullet.renderedText unaffected (AC.2, AC.3)", async () => {
    const { experienceId, bulletId } = await createExperience(
      "Referenced highlight bullet",
    );

    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-bullet-immutability-${Date.now()}`,
        title: "Test Job",
        company: "Test Company",
        url: "https://example.com/job",
      },
    });

    const cv = await prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId: jobListing.id,
        name: "Test CV",
        snapshotData: {},
      },
    });

    const renderedText = "Referenced highlight bullet";
    const cvBullet = await prisma.cVBullet.create({
      data: {
        cvId: cv.id,
        experienceBulletId: bulletId,
        renderedText,
      },
    });

    // Simulate the UI's delete: PUT with the bullet omitted from the bullets array.
    const res = await putExperience(experienceId, {
      company: "Acme Corp",
      position: "Staff Engineer",
      startDate: new Date("2023-01-01").toISOString(),
      current: true,
      bullets: [],
    });
    expect(res.status).toBe(200);

    const bulletInDb = await prisma.experienceBullet.findUnique({
      where: { id: bulletId },
    });
    expect(bulletInDb).not.toBeNull();
    expect(bulletInDb!.isArchived).toBe(true);
    expect(bulletInDb!.isActive).toBe(false);

    const cvBulletInDb = await prisma.cVBullet.findUnique({
      where: { id: cvBullet.id },
    });
    expect(cvBulletInDb).not.toBeNull();
    expect(cvBulletInDb!.renderedText).toBe(renderedText);

    await prisma.cV.delete({ where: { id: cv.id } });
    await prisma.experience
      .delete({ where: { id: experienceId } })
      .catch(() => {});
  });

  it("(b) regression: hard-deletes an untagged bullet omitted from the PUT bullets array (AC.7)", async () => {
    const { experienceId, bulletId } = await createExperience(
      "Unreferenced highlight bullet",
    );

    const res = await putExperience(experienceId, {
      company: "Acme Corp",
      position: "Staff Engineer",
      startDate: new Date("2023-01-01").toISOString(),
      current: true,
      bullets: [],
    });
    expect(res.status).toBe(200);

    const bulletInDb = await prisma.experienceBullet.findUnique({
      where: { id: bulletId },
    });
    expect(bulletInDb).toBeNull();

    await prisma.experience
      .delete({ where: { id: experienceId } })
      .catch(() => {});
  });

  it("(c) US-1 backstop: server-side guard reverts a text change on a CV-referenced bullet even if submitted", async () => {
    const { experienceId, bulletId } = await createExperience(
      "Original tagged text",
    );

    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-bullet-immutability-backstop-${Date.now()}`,
        title: "Test Job",
        company: "Test Company",
        url: "https://example.com/job",
      },
    });

    const cv = await prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId: jobListing.id,
        name: "Test CV",
        snapshotData: {},
      },
    });

    await prisma.cVBullet.create({
      data: {
        cvId: cv.id,
        experienceBulletId: bulletId,
        renderedText: "Original tagged text",
      },
    });

    const res = await putExperience(experienceId, {
      company: "Acme Corp",
      position: "Staff Engineer",
      startDate: new Date("2023-01-01").toISOString(),
      current: true,
      bullets: [
        {
          id: bulletId,
          text: "Attempted overwrite of tagged bullet",
          type: "BULLET",
          isActive: true,
          isArchived: false,
          sortOrder: 0,
        },
      ],
    });
    expect(res.status).toBe(200);

    const bulletInDb = await prisma.experienceBullet.findUnique({
      where: { id: bulletId },
    });
    expect(bulletInDb!.text).toBe("Original tagged text");

    // Deleting the CV cascades and removes its CVBullet rows.
    await prisma.cV.delete({ where: { id: cv.id } });
    await prisma.experience
      .delete({ where: { id: experienceId } })
      .catch(() => {});
  });
});
