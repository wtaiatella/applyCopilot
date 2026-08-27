/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as createExperienceHandler } from "@/app/api/profile/experiences/route";
import { DELETE as deleteExperienceHandler } from "@/app/api/profile/experiences/[id]/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { safeCleanup } from "./helpers/test-fixtures";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

describe("DELETE /api/profile/experiences/[id] — archive-not-cascade for CV-referenced bullets (REM-3, AC.3)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `experience-delete-cv-integrity-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Delete", lastName: "Tester" } },
      },
      include: { profile: true },
    });
    testUserId = user.id;
    testProfileId = user.profile!.id;
  });

  afterAll(async () => {
    await safeCleanup(
      "experience-delete-cv-integrity.test.ts afterAll",
      async () => {
        await prisma.user.delete({ where: { id: testUserId } });
      },
    );
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

  function deleteExperience(id: string) {
    const req = new Request(
      `http://localhost:3000/api/profile/experiences/${id}`,
      { method: "DELETE" },
    );
    return deleteExperienceHandler(req, { params: Promise.resolve({ id }) });
  }

  it("archives + detaches a CV-referenced bullet instead of hard-deleting it, and leaves the CV's renderedText unaffected (AC.3)", async () => {
    const req = new Request("http://localhost:3000/api/profile/experiences", {
      method: "POST",
      body: JSON.stringify({
        company: "Acme Corp",
        position: "Staff Engineer",
        startDate: new Date("2023-01-01").toISOString(),
        current: true,
        bullets: [
          { text: "Referenced highlight bullet", type: "BULLET", sortOrder: 0 },
        ],
      }),
    });
    const createRes = await createExperienceHandler(req);
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const experienceId = created.id as string;
    const bulletId = created.bullets[0].id as string;

    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-experience-delete-cv-integrity-${Date.now()}`,
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

    const res = await deleteExperience(experienceId);
    expect(res.status).toBe(200);

    // Experience itself is gone.
    const experienceInDb = await prisma.experience.findUnique({
      where: { id: experienceId },
    });
    expect(experienceInDb).toBeNull();

    // Referenced bullet is archived and detached, NOT hard-deleted.
    const bulletInDb = await prisma.experienceBullet.findUnique({
      where: { id: bulletId },
    });
    expect(bulletInDb).not.toBeNull();
    expect(bulletInDb!.isArchived).toBe(true);
    expect(bulletInDb!.isActive).toBe(false);
    expect(bulletInDb!.experienceId).toBeNull();

    // The CV's rendered content is unaffected by the parent Experience's deletion.
    const cvBulletInDb = await prisma.cVBullet.findUnique({
      where: { id: cvBullet.id },
    });
    expect(cvBulletInDb).not.toBeNull();
    expect(cvBulletInDb!.renderedText).toBe(renderedText);
    expect(cvBulletInDb!.experienceBulletId).toBe(bulletId);

    // Clean up CV & CVBullet records (cascade delete on CV will remove CVBullet).
    await prisma.cV.delete({ where: { id: cv.id } });
    await safeCleanup(
      "experience-delete-cv-integrity.test.ts jobListing",
      async () => {
        await prisma.jobListing.delete({ where: { id: jobListing.id } });
      },
    );
    // `bulletId` is the AC.3-verified archived-and-detached (experienceId: null) survivor of the
    // deleted Experience — ExperienceBullet.experienceId's `onDelete: SetNull` means it's never
    // otherwise cleaned up once its parent Experience row is gone (T017 rework).
    await safeCleanup(
      "experience-delete-cv-integrity.test.ts bullet",
      async () => {
        await prisma.experienceBullet.delete({ where: { id: bulletId } });
      },
    );
  });

  it("regression: hard-deletes an unreferenced bullet on Experience delete (no CV reference)", async () => {
    const req = new Request("http://localhost:3000/api/profile/experiences", {
      method: "POST",
      body: JSON.stringify({
        company: "Beta Inc",
        position: "Engineer",
        startDate: new Date("2022-01-01").toISOString(),
        current: true,
        bullets: [
          {
            text: "Unreferenced highlight bullet",
            type: "BULLET",
            sortOrder: 0,
          },
        ],
      }),
    });
    const createRes = await createExperienceHandler(req);
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    const experienceId = created.id as string;
    const bulletId = created.bullets[0].id as string;

    const res = await deleteExperience(experienceId);
    expect(res.status).toBe(200);

    const experienceInDb = await prisma.experience.findUnique({
      where: { id: experienceId },
    });
    expect(experienceInDb).toBeNull();

    const bulletInDb = await prisma.experienceBullet.findUnique({
      where: { id: bulletId },
    });
    expect(bulletInDb).toBeNull();
  });
});
