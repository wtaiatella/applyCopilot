/**
 * @jest-environment node
 */
import "dotenv/config";
import { POST as applyHandler } from "@/app/api/cv/[cvId]/apply/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import * as cvReconciliationService from "@/services/cvReconciliationService";
import type { CVSnapshotData } from "@/types/cv";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

// Re-exported as a plain (configurable) object so `jest.spyOn(cvReconciliationService,
// "reconcileCVApply")` can wrap the real implementation below — the compiled ES module
// binding itself is a non-configurable property and can't be spied on directly.
jest.mock("@/services/cvReconciliationService", () => ({
  __esModule: true,
  ...jest.requireActual("@/services/cvReconciliationService"),
}));

describe("POST /api/cv/[cvId]/apply — end-to-end 3-way reconciliation (AC.9, FR-15)", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `cv-apply-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;
  let jobListingId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: { create: { firstName: "Apply", lastName: "Tester" } },
      },
      include: { profile: true },
    });
    testUserId = user.id;
    testProfileId = user.profile!.id;

    const jobListing = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-apply-${Date.now()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job",
      },
    });
    jobListingId = jobListing.id;
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

  async function createCV(snapshotData: CVSnapshotData, jobId = jobListingId) {
    return prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId: jobId,
        name: "Test CV",
        status: "DRAFT",
        snapshotData: snapshotData as unknown as object,
      },
    });
  }

  it("reconciles one unchanged, one edited, and one brand-new bullet; freezes the CV; leaves non-included pool bullets untouched (AC.3a)", async () => {
    // Master Profile: one experience with 2 bullets.
    const experience = await prisma.experience.create({
      data: {
        profileId: testProfileId,
        company: "Acme",
        position: "Engineer",
        startDate: new Date("2021-01-01"),
        current: true,
        bullets: {
          create: [
            { text: "Unchanged bullet", type: "BULLET", sortOrder: 0 },
            { text: "Original text before edit", type: "BULLET", sortOrder: 1 },
          ],
        },
      },
      include: { bullets: { orderBy: { sortOrder: "asc" } } },
    });
    const [unchangedMaster, editedMaster] = experience.bullets;

    const job2 = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-apply-main-${Date.now()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job-main",
      },
    });

    const snapshot: CVSnapshotData = {
      version: 1,
      basicData: {
        firstName: "Apply",
        lastName: "Tester",
        phone: null,
        location: null,
        linkedin: null,
        github: null,
        website: null,
        title: null,
      },
      summaries: [],
      experiences: [
        {
          id: "local-exp-1",
          sourceExperienceId: experience.id,
          company: "Acme",
          position: "Engineer",
          startDate: "2021-01-01T00:00:00.000Z",
          endDate: null,
          current: true,
          tabLabel: null,
          freeFormContext: [],
          bullets: [
            {
              id: "local-b1",
              sourceBulletId: unchangedMaster.id,
              text: "Unchanged bullet",
              type: "BULLET",
              included: true,
              sortOrder: 0,
            },
            {
              id: "local-b2",
              sourceBulletId: editedMaster.id,
              text: "Edited text after tailoring",
              type: "BULLET",
              included: true,
              sortOrder: 1,
            },
            {
              id: "local-b3",
              sourceBulletId: null,
              text: "Brand new bullet from AI",
              type: "BULLET",
              included: true,
              sortOrder: 2,
            },
            {
              id: "local-b4-excluded",
              sourceBulletId: null,
              text: "AI candidate the user chose not to include",
              type: "BULLET",
              included: false,
              sortOrder: 3,
            },
          ],
        },
      ],
      education: [],
      projects: [],
      skills: [],
    };

    const cv = await createCV(snapshot, job2.id);

    const req = new Request(`http://localhost:3000/api/cv/${cv.id}/apply`, {
      method: "POST",
    });
    const res = await applyHandler(req, {
      params: Promise.resolve({ cvId: cv.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("APPLIED");
    expect(body.appliedAt).toBeTruthy();

    // CV frozen
    const updatedCV = await prisma.cV.findUnique({ where: { id: cv.id } });
    expect(updatedCV?.status).toBe("APPLIED");
    expect(updatedCV?.appliedAt).toBeTruthy();

    // Unchanged bullet: marked used, not mutated.
    const unchangedRow = await prisma.experienceBullet.findUnique({
      where: { id: unchangedMaster.id },
    });
    expect(unchangedRow?.text).toBe("Unchanged bullet");
    expect(unchangedRow?.isArchived).toBe(false);

    // Edited bullet: archived (was unused elsewhere prior to this Apply → in-place update).
    const editedRow = await prisma.experienceBullet.findUnique({
      where: { id: editedMaster.id },
    });
    expect(editedRow?.text).toBe("Edited text after tailoring");
    expect(editedRow?.isArchived).toBe(false);

    // Brand-new bullet: created fresh, active.
    const allBullets = await prisma.experienceBullet.findMany({
      where: { experienceId: experience.id },
    });
    const brandNew = allBullets.find(
      (b) => b.text === "Brand new bullet from AI",
    );
    expect(brandNew).toBeTruthy();
    expect(brandNew?.isActive).toBe(true);
    expect(brandNew?.isArchived).toBe(false);

    // Excluded pool bullet never created on the master Profile (AC.3a).
    const excluded = allBullets.find(
      (b) => b.text === "AI candidate the user chose not to include",
    );
    expect(excluded).toBeUndefined();

    // CVBullet linking rows: exactly 3 (unchanged, edited, new) — none for the excluded item.
    const cvBullets = await prisma.cVBullet.findMany({
      where: { cvId: cv.id },
    });
    expect(cvBullets).toHaveLength(3);
  });

  it("reconciles ProfileSummary and Skill with the same 3-way rule, including the archived-skill + partial-unique-index path (FR-15 worked example)", async () => {
    const summary = await prisma.profileSummary.create({
      data: {
        profileId: testProfileId,
        title: "Main summary",
        content: "Original summary content",
        isActive: true,
        sortOrder: 0,
      },
    });

    const skillUnused = await prisma.skill.create({
      data: {
        profileId: testProfileId,
        name: "Go",
        proficiency: "INTERMEDIATE",
      },
    });

    // A skill already used by a prior Applied CV — editing it must archive+replace, not update in
    // place, since the partial unique index only allows one active row per (profileId, name).
    const skillUsedElsewhere = await prisma.skill.create({
      data: {
        profileId: testProfileId,
        name: "Python",
        proficiency: "INTERMEDIATE",
      },
    });
    const priorJob = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-apply-prior-${Date.now()}`,
        title: "Prior job",
        company: "Prior Co",
        url: "https://example.com/prior",
      },
    });
    const priorCV = await prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId: priorJob.id,
        name: "Prior CV",
        status: "APPLIED",
        appliedAt: new Date(),
        snapshotData: {} as object,
      },
    });
    await prisma.cVBullet.create({
      data: {
        cvId: priorCV.id,
        skillId: skillUsedElsewhere.id,
        renderedText: "Python (INTERMEDIATE)",
      },
    });

    const job = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-apply-summary-skill-${Date.now()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job-summary-skill",
      },
    });

    const snapshot: CVSnapshotData = {
      version: 1,
      basicData: {
        firstName: "Apply",
        lastName: "Tester",
        phone: null,
        location: null,
        linkedin: null,
        github: null,
        website: null,
        title: null,
      },
      summaries: [
        {
          id: "local-s1",
          sourceSummaryId: summary.id,
          title: "Main summary",
          content: "Tailored summary content",
          isAIGenerated: false,
          included: true,
        },
      ],
      experiences: [],
      education: [],
      projects: [],
      skills: [
        {
          id: "local-sk1",
          sourceSkillId: skillUnused.id,
          name: "Go",
          proficiency: "ADVANCED", // edited, unused elsewhere → in-place update
          yearsExperience: 3,
          included: true,
        },
        {
          id: "local-sk2",
          sourceSkillId: skillUsedElsewhere.id,
          name: "Python",
          proficiency: "ADVANCED", // edited, used elsewhere → archive + replace
          yearsExperience: 4,
          included: true,
        },
        {
          id: "local-sk3",
          sourceSkillId: null,
          name: "Rust",
          proficiency: "BEGINNER",
          yearsExperience: null,
          included: true,
        },
      ],
    };

    const cv = await createCV(snapshot, job.id);

    const req = new Request(`http://localhost:3000/api/cv/${cv.id}/apply`, {
      method: "POST",
    });
    const res = await applyHandler(req, {
      params: Promise.resolve({ cvId: cv.id }),
    });
    expect(res.status).toBe(200);

    // Summary: edited, unused elsewhere → in-place update.
    const updatedSummary = await prisma.profileSummary.findUnique({
      where: { id: summary.id },
    });
    expect(updatedSummary?.content).toBe("Tailored summary content");
    expect(updatedSummary?.isActive).toBe(true);

    // Skill "Go": edited, unused elsewhere → in-place update.
    const updatedGo = await prisma.skill.findUnique({
      where: { id: skillUnused.id },
    });
    expect(updatedGo?.proficiency).toBe("ADVANCED");
    expect(updatedGo?.isArchived).toBe(false);

    // Skill "Python": edited, used elsewhere → archived, replaced by a new active row with
    // the same name — this is exactly the path the partial unique index must tolerate.
    const archivedPython = await prisma.skill.findUnique({
      where: { id: skillUsedElsewhere.id },
    });
    expect(archivedPython?.isArchived).toBe(true);
    expect(archivedPython?.isActive).toBe(false);

    const activePythonRows = await prisma.skill.findMany({
      where: { profileId: testProfileId, name: "Python", isArchived: false },
    });
    expect(activePythonRows).toHaveLength(1);
    expect(activePythonRows[0].proficiency).toBe("ADVANCED");

    // Skill "Rust": brand new, created fresh & active.
    const rust = await prisma.skill.findFirst({
      where: { profileId: testProfileId, name: "Rust" },
    });
    expect(rust).toBeTruthy();
    expect(rust?.isActive).toBe(true);
  });

  it("returns 409 when the CV is already APPLIED (no double-apply)", async () => {
    const job = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-apply-already-${Date.now()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job-already",
      },
    });
    const cv = await prisma.cV.create({
      data: {
        profileId: testProfileId,
        jobListingId: job.id,
        name: "Already applied",
        status: "APPLIED",
        appliedAt: new Date(),
        snapshotData: {} as object,
      },
    });

    const req = new Request(`http://localhost:3000/api/cv/${cv.id}/apply`, {
      method: "POST",
    });
    const res = await applyHandler(req, {
      params: Promise.resolve({ cvId: cv.id }),
    });
    expect(res.status).toBe(409);

    const stillApplied = await prisma.cV.findUnique({ where: { id: cv.id } });
    expect(stillApplied?.status).toBe("APPLIED");
  });

  it("rolls back the whole transaction (including status/appliedAt) when reconciliation fails mid-way", async () => {
    const job = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-apply-fail-${Date.now()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job-fail",
      },
    });

    // A bullet referencing a sourceBulletId that does not exist on the master Profile at all —
    // reconcileBulletMutation's underlying `update` will throw (no such row), forcing a
    // mid-transaction failure so we can assert the whole Apply rolls back.
    const snapshot: CVSnapshotData = {
      version: 1,
      basicData: {
        firstName: null,
        lastName: null,
        phone: null,
        location: null,
        linkedin: null,
        github: null,
        website: null,
        title: null,
      },
      summaries: [],
      experiences: [
        {
          id: "local-exp-1",
          sourceExperienceId: "does-not-exist-experience-id",
          company: "Acme",
          position: "Engineer",
          startDate: "2021-01-01T00:00:00.000Z",
          endDate: null,
          current: true,
          tabLabel: null,
          freeFormContext: [],
          bullets: [
            {
              id: "local-b1",
              sourceBulletId: "does-not-exist-bullet-id",
              text: "Edited text that will fail to reconcile",
              type: "BULLET",
              included: true,
              sortOrder: 0,
            },
          ],
        },
      ],
      education: [],
      projects: [],
      skills: [],
    };

    const cv = await createCV(snapshot, job.id);

    const req = new Request(`http://localhost:3000/api/cv/${cv.id}/apply`, {
      method: "POST",
    });
    const res = await applyHandler(req, {
      params: Promise.resolve({ cvId: cv.id }),
    });
    expect(res.status).toBe(422);

    const stillDraft = await prisma.cV.findUnique({ where: { id: cv.id } });
    expect(stillDraft?.status).toBe("DRAFT");
    expect(stillDraft?.appliedAt).toBeNull();

    // No CVBullet linking row leaked out of the rolled-back transaction.
    const cvBullets = await prisma.cVBullet.findMany({
      where: { cvId: cv.id },
    });
    expect(cvBullets).toHaveLength(0);
  });

  it("rejects unauthenticated requests", async () => {
    mockAuth.mockResolvedValue(null);
    const job = await prisma.jobListing.create({
      data: {
        portalId: "test-portal",
        externalJobId: `test-job-apply-unauth-${Date.now()}`,
        title: "Backend Engineer",
        company: "Test Company",
        url: "https://example.com/job-unauth",
      },
    });
    const cv = await createCV(
      {
        version: 1,
        basicData: {
          firstName: null,
          lastName: null,
          phone: null,
          location: null,
          linkedin: null,
          github: null,
          website: null,
          title: null,
        },
        summaries: [],
        experiences: [],
        education: [],
        projects: [],
        skills: [],
      },
      job.id,
    );

    const req = new Request(`http://localhost:3000/api/cv/${cv.id}/apply`, {
      method: "POST",
    });
    const res = await applyHandler(req, {
      params: Promise.resolve({ cvId: cv.id }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for a CV that does not exist or is not owned by the requester", async () => {
    const req = new Request(
      "http://localhost:3000/api/cv/does-not-exist/apply",
      { method: "POST" },
    );
    const res = await applyHandler(req, {
      params: Promise.resolve({ cvId: "does-not-exist" }),
    });
    expect(res.status).toBe(404);
  });

  describe("cross-tenant IDOR guard (CRITICAL rework fix)", () => {
    it("rejects the whole apply when a snapshot source*Id references another user's profile data, leaving that data completely unmodified", async () => {
      // A second, unrelated user with its own master Profile data.
      const otherEmail = `cv-apply-other-user-${Date.now()}@example.com`;
      const otherUser = await prisma.user.create({
        data: {
          email: otherEmail,
          password: "hashedpassword123",
          profile: { create: { firstName: "Other", lastName: "User" } },
        },
        include: { profile: true },
      });
      const otherProfileId = otherUser.profile!.id;

      const otherExperience = await prisma.experience.create({
        data: {
          profileId: otherProfileId,
          company: "Other Co",
          position: "Other Role",
          startDate: new Date("2020-01-01"),
          current: true,
          bullets: {
            create: [
              { text: "Other user's bullet", type: "BULLET", sortOrder: 0 },
            ],
          },
        },
        include: { bullets: true },
      });
      const otherBullet = otherExperience.bullets[0];

      const otherSummary = await prisma.profileSummary.create({
        data: {
          profileId: otherProfileId,
          title: "Other summary",
          content: "Other user's summary content",
          isActive: true,
          sortOrder: 0,
        },
      });

      const otherSkill = await prisma.skill.create({
        data: {
          profileId: otherProfileId,
          name: "OtherSkill",
          proficiency: "INTERMEDIATE",
        },
      });

      try {
        const job = await prisma.jobListing.create({
          data: {
            portalId: "test-portal",
            externalJobId: `test-job-apply-idor-${Date.now()}`,
            title: "Backend Engineer",
            company: "Test Company",
            url: "https://example.com/job-idor",
          },
        });

        // A malicious/tampered snapshot on testUser's CV that references otherProfileId's
        // experience (and, via its bullets, otherBullet) as a "source" — simulating a
        // client-controlled PUT /snapshot payload pointing at another tenant's rows.
        const snapshot: CVSnapshotData = {
          version: 1,
          basicData: {
            firstName: "Apply",
            lastName: "Tester",
            phone: null,
            location: null,
            linkedin: null,
            github: null,
            website: null,
            title: null,
          },
          summaries: [
            {
              id: "local-s1",
              sourceSummaryId: otherSummary.id,
              title: "Other summary",
              content: "Tampered summary content",
              isAIGenerated: false,
              included: true,
            },
          ],
          experiences: [
            {
              id: "local-exp-1",
              sourceExperienceId: otherExperience.id,
              company: "Acme",
              position: "Engineer",
              startDate: "2021-01-01T00:00:00.000Z",
              endDate: null,
              current: true,
              tabLabel: null,
              freeFormContext: [],
              bullets: [
                {
                  id: "local-b1",
                  sourceBulletId: otherBullet.id,
                  text: "Tampered bullet text",
                  type: "BULLET",
                  included: true,
                  sortOrder: 0,
                },
              ],
            },
          ],
          education: [],
          projects: [],
          skills: [
            {
              id: "local-sk1",
              sourceSkillId: otherSkill.id,
              name: "OtherSkill",
              proficiency: "ADVANCED",
              yearsExperience: 1,
              included: true,
            },
          ],
        };

        const cv = await createCV(snapshot, job.id);

        const req = new Request(`http://localhost:3000/api/cv/${cv.id}/apply`, {
          method: "POST",
        });
        const res = await applyHandler(req, {
          params: Promise.resolve({ cvId: cv.id }),
        });

        // Whole apply rejected (422 — same HTTP contract as any other reconciliation failure).
        expect(res.status).toBe(422);

        // The requester's own CV stays DRAFT (transaction rolled back).
        const stillDraft = await prisma.cV.findUnique({ where: { id: cv.id } });
        expect(stillDraft?.status).toBe("DRAFT");
        expect(stillDraft?.appliedAt).toBeNull();

        // The other user's data is completely unmodified.
        const otherExperienceAfter = await prisma.experience.findUnique({
          where: { id: otherExperience.id },
        });
        expect(otherExperienceAfter?.company).toBe("Other Co");

        const otherBulletAfter = await prisma.experienceBullet.findUnique({
          where: { id: otherBullet.id },
        });
        expect(otherBulletAfter?.text).toBe("Other user's bullet");
        expect(otherBulletAfter?.isArchived).toBe(false);

        const otherSummaryAfter = await prisma.profileSummary.findUnique({
          where: { id: otherSummary.id },
        });
        expect(otherSummaryAfter?.content).toBe("Other user's summary content");

        const otherSkillAfter = await prisma.skill.findUnique({
          where: { id: otherSkill.id },
        });
        expect(otherSkillAfter?.proficiency).toBe("INTERMEDIATE");
        expect(otherSkillAfter?.isArchived).toBe(false);

        // No stray CVBullet rows leaked from the rolled-back transaction.
        const cvBullets = await prisma.cVBullet.findMany({
          where: { cvId: cv.id },
        });
        expect(cvBullets).toHaveLength(0);
      } finally {
        await prisma.user
          .delete({ where: { id: otherUser.id } })
          .catch(() => {});
      }
    });
  });

  describe("atomic double-apply guard (HIGH rework fix — TOCTOU race)", () => {
    it("moves the DRAFT→APPLIED check inside the transaction so a second apply on an already-APPLIED CV returns 409 without re-running reconciliation", async () => {
      const job = await prisma.jobListing.create({
        data: {
          portalId: "test-portal",
          externalJobId: `test-job-apply-atomic-${Date.now()}`,
          title: "Backend Engineer",
          company: "Test Company",
          url: "https://example.com/job-atomic",
        },
      });

      const cv = await createCV(
        {
          version: 1,
          basicData: {
            firstName: null,
            lastName: null,
            phone: null,
            location: null,
            linkedin: null,
            github: null,
            website: null,
            title: null,
          },
          summaries: [],
          experiences: [],
          education: [],
          projects: [],
          skills: [],
        },
        job.id,
      );

      const reconcileSpy = jest.spyOn(
        cvReconciliationService,
        "reconcileCVApply",
      );

      const req1 = new Request(`http://localhost:3000/api/cv/${cv.id}/apply`, {
        method: "POST",
      });
      const res1 = await applyHandler(req1, {
        params: Promise.resolve({ cvId: cv.id }),
      });
      expect(res1.status).toBe(200);
      expect(reconcileSpy).toHaveBeenCalledTimes(1);

      // Second apply on the now-APPLIED CV: the atomic `updateMany({ where: { status: "DRAFT" } })`
      // guard inside the transaction must find count 0 and reject BEFORE reconciliation runs again.
      const req2 = new Request(`http://localhost:3000/api/cv/${cv.id}/apply`, {
        method: "POST",
      });
      const res2 = await applyHandler(req2, {
        params: Promise.resolve({ cvId: cv.id }),
      });
      expect(res2.status).toBe(409);

      // Reconciliation was never invoked a second time.
      expect(reconcileSpy).toHaveBeenCalledTimes(1);

      reconcileSpy.mockRestore();
    });
  });
});
