/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * @jest-environment node
 */
import "dotenv/config";
import { GET as getProfileHandler } from "@/app/api/profile/route";
import { POST as createExperienceHandler } from "@/app/api/profile/experiences/route";
import { PUT as updateExperienceHandler, DELETE as deleteExperienceHandler } from "@/app/api/profile/experiences/[id]/route";
import { POST as createEducationHandler } from "@/app/api/profile/education/route";
import { PUT as updateEducationHandler, DELETE as deleteEducationHandler } from "@/app/api/profile/education/[id]/route";
import { POST as createProjectHandler } from "@/app/api/profile/projects/route";
import { PUT as updateProjectHandler, DELETE as deleteProjectHandler } from "@/app/api/profile/projects/[id]/route";
import { PUT as updateSkillsHandler } from "@/app/api/profile/skills/route";
import { PUT as updateReferencesHandler } from "@/app/api/profile/references/route";
import { PUT as updateBasicDataHandler } from "@/app/api/profile/basic/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

describe("Profile Sub-resources CRUD & Reconciliation Integration Tests", () => {
  const mockAuth = auth as unknown as jest.Mock;
  const testEmail = `profile-test-${Date.now()}@example.com`;
  let testUserId: string;
  let testProfileId: string;

  beforeAll(async () => {
    // Create test user and profile in database
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: "hashedpassword123",
        profile: {
          create: {
            firstName: "John",
            lastName: "Doe",
          },
        },
      },
      include: {
        profile: true,
      },
    });

    testUserId = user.id;
    testProfileId = user.profile!.id;
  });

  afterAll(async () => {
    // Clean up database records
    if (testUserId) {
      await prisma.user.delete({
        where: { id: testUserId },
      }).catch(() => {});
    }

    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default authenticated mock session
    mockAuth.mockResolvedValue({
      user: { id: testUserId, email: testEmail, role: "USER" },
      expires: "any",
    });
  });

  describe("GET /api/profile", () => {
    it("should successfully return complete profile DTO", async () => {
      const res = await getProfileHandler();
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.id).toBe(testProfileId);
      expect(data.basicData.firstName).toBe("John");
      expect(data.basicData.email).toBe(testEmail);
      expect(data.experiences).toBeDefined();
      expect(data.education).toBeDefined();
      expect(data.projects).toBeDefined();
    });

    it("should reject unauthenticated request", async () => {
      mockAuth.mockResolvedValue(null);
      const res = await getProfileHandler();
      expect(res.status).toBe(401);
    });
  });

  describe("Experience CRUD & Bullet Reconciliation", () => {
    let experienceId: string;

    it("should create a new experience", async () => {
      const payload = {
        company: "Google",
        position: "Software Engineer",
        startDate: new Date("2024-01-01").toISOString(),
        current: true,
        bullets: [{ text: "Initial highlight bullet", type: "BULLET", sortOrder: 0 }],
      };

      const req = new Request("http://localhost:3000/api/profile/experiences", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await createExperienceHandler(req);
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.id).toBeDefined();
      expect(data.company).toBe("Google");
      expect(data.bullets).toHaveLength(1);
      expect(data.bullets[0].text).toBe("Initial highlight bullet");
      
      experienceId = data.id;
    });

    it("should update experience details and reconcile bullets", async () => {
      // Fetch currently created experience bullets
      const createdBullets = await prisma.experienceBullet.findMany({
        where: { experienceId },
      });
      expect(createdBullets).toHaveLength(1);

      const payload = {
        company: "Google LLC",
        position: "Senior Software Engineer",
        startDate: new Date("2024-01-01").toISOString(),
        current: true,
        bullets: [
          // Keep and update existing bullet by passing its ID
          { id: createdBullets[0].id, text: "Updated highlight bullet", type: "BULLET", sortOrder: 0, isActive: true, isArchived: false },
          // Add a new bullet
          { text: "Brand new highlight bullet", type: "BULLET", sortOrder: 1, isActive: true, isArchived: false }
          // The old bullet is not deleted since it was updated, but any omitted ones would be
        ],
      };

      const req = new Request(`http://localhost:3000/api/profile/experiences/${experienceId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      const params = Promise.resolve({ id: experienceId });
      const res = await updateExperienceHandler(req, { params });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.company).toBe("Google LLC");
      expect(data.position).toBe("Senior Software Engineer");
      expect(data.bullets).toHaveLength(2);
      expect(data.bullets.map((b: any) => b.text)).toContain("Updated highlight bullet");
      expect(data.bullets.map((b: any) => b.text)).toContain("Brand new highlight bullet");
    });

    it("should soft-delete bullets that are used in CVs, and hard-delete those that are not", async () => {
      // 1. Get current experience bullets
      const bullets = await prisma.experienceBullet.findMany({
        where: { experienceId },
      });
      expect(bullets).toHaveLength(2);

      const bulletUsed = bullets[0];
      const bulletNotUsed = bullets[1];

      // 2. Create a test CV and associate it with bulletUsed
      const cv = await prisma.cV.create({
        data: {
          profileId: testProfileId,
          name: "Test CV",
        },
      });

      await prisma.cVBullet.create({
        data: {
          cvId: cv.id,
          experienceBulletId: bulletUsed.id,
          renderedText: bulletUsed.text,
        },
      });

      // 3. Update experience, completely omitting both bullets (so they should be deleted/soft-deleted)
      const payload = {
        company: "Google LLC",
        position: "Senior Software Engineer",
        startDate: new Date("2024-01-01").toISOString(),
        current: true,
        bullets: [], // Omit both
      };

      const req = new Request(`http://localhost:3000/api/profile/experiences/${experienceId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      const params = Promise.resolve({ id: experienceId });
      const res = await updateExperienceHandler(req, { params });
      expect(res.status).toBe(200);

      // 4. Verify bulletNotUsed is hard-deleted from database
      const notUsedInDb = await prisma.experienceBullet.findUnique({
        where: { id: bulletNotUsed.id },
      });
      expect(notUsedInDb).toBeNull();

      // 5. Verify bulletUsed is soft-deleted (isArchived: true)
      const usedInDb = await prisma.experienceBullet.findUnique({
        where: { id: bulletUsed.id },
      });
      expect(usedInDb).not.toBeNull();
      expect(usedInDb!.isArchived).toBe(true);
      expect(usedInDb!.isActive).toBe(false);

      // 6. Verify retrieve profile GET filters out the soft-deleted bullet
      const getRes = await getProfileHandler();
      expect(getRes.status).toBe(200);
      const getProfileData = await getRes.json();
      const expFromGet = getProfileData.experiences.find((e: any) => e.id === experienceId);
      expect(expFromGet).toBeDefined();
      expect(expFromGet.bullets).toHaveLength(0); // Should be empty since the only remaining bullet is archived

      // Clean up CV & CVBullet records (cascade delete on CV will remove CVBullet)
      await prisma.cV.delete({
        where: { id: cv.id },
      });
    });

    it("should delete experience and cascade delete bullets", async () => {
      const params = Promise.resolve({ id: experienceId });
      const req = new Request(`http://localhost:3000/api/profile/experiences/${experienceId}`, {
        method: "DELETE",
      });

      const res = await deleteExperienceHandler(req, { params });
      expect(res.status).toBe(200);

      const expInDb = await prisma.experience.findUnique({ where: { id: experienceId } });
      expect(expInDb).toBeNull();

      const bulletsInDb = await prisma.experienceBullet.findMany({ where: { experienceId } });
      expect(bulletsInDb).toHaveLength(0);
    });
  });

  describe("Education CRUD & Bullet Reconciliation", () => {
    let educationId: string;

    it("should create a new education entry", async () => {
      const payload = {
        institution: "Stanford University",
        degree: "M.S.",
        fieldOfStudy: "Computer Science",
        startDate: new Date("2022-09-01").toISOString(),
        current: false,
        hideEndDate: false,
        bullets: [{ text: "TA for CS 101", type: "BULLET", sortOrder: 0 }],
      };

      const req = new Request("http://localhost:3000/api/profile/education", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await createEducationHandler(req);
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.id).toBeDefined();
      expect(data.institution).toBe("Stanford University");
      educationId = data.id;
    });

    it("should update and delete education", async () => {
      const params = Promise.resolve({ id: educationId });
      const deleteReq = new Request(`http://localhost:3000/api/profile/education/${educationId}`, {
        method: "DELETE",
      });

      const res = await deleteEducationHandler(deleteReq, { params });
      expect(res.status).toBe(200);

      const eduInDb = await prisma.education.findUnique({ where: { id: educationId } });
      expect(eduInDb).toBeNull();
    });
  });

  describe("Projects CRUD & Bullet Reconciliation", () => {
    let projectId: string;

    it("should create a new project", async () => {
      const payload = {
        name: "AI Copilot Project",
        technologies: ["Next.js", "Prisma", "PostgreSQL"],
        bullets: [{ text: "Built state manager context", type: "BULLET", sortOrder: 0 }],
      };

      const req = new Request("http://localhost:3000/api/profile/projects", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await createProjectHandler(req);
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.id).toBeDefined();
      expect(data.name).toBe("AI Copilot Project");
      projectId = data.id;
    });

    it("should delete project", async () => {
      const params = Promise.resolve({ id: projectId });
      const deleteReq = new Request(`http://localhost:3000/api/profile/projects/${projectId}`, {
        method: "DELETE",
      });

      const res = await deleteProjectHandler(deleteReq, { params });
      expect(res.status).toBe(200);

      const projInDb = await prisma.project.findUnique({ where: { id: projectId } });
      expect(projInDb).toBeNull();
    });
  });

  describe("Skills & References PUT Overwrite", () => {
    it("should successfully overwrite skills list", async () => {
      const payload = [
        { name: "TypeScript", proficiency: "EXPERT", yearsExperience: 5 },
        { name: "Rust", proficiency: "INTERMEDIATE", yearsExperience: 2 },
      ];

      const req = new Request("http://localhost:3000/api/profile/skills", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      const res = await updateSkillsHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveLength(2);
      expect(data.map((s: any) => s.name)).toContain("TypeScript");
      expect(data.map((s: any) => s.proficiency)).toContain("EXPERT");

      const skillsInDb = await prisma.skill.findMany({ where: { profileId: testProfileId } });
      expect(skillsInDb).toHaveLength(2);
    });

    it("should successfully overwrite references list", async () => {
      const payload = [
        { name: "Manager One", company: "Company A", relationship: "Manager", email: "mgr1@example.com", phone: "123", canContact: true },
      ];

      const req = new Request("http://localhost:3000/api/profile/references", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      const res = await updateReferencesHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("Manager One");

      const refsInDb = await prisma.reference.findMany({ where: { profileId: testProfileId } });
      expect(refsInDb).toHaveLength(1);
    });
  });

  describe("Basic Data PUT Update & Active Summary Sync", () => {
    it("should successfully update basic data fields directly", async () => {
      const payload = {
        firstName: "Wagner",
        lastName: "Taiatella",
        phone: "555-0199",
        location: "Sao Paulo, Brazil",
        linkedin: "https://linkedin.com/in/wagner",
        github: "https://github.com/wagner",
        website: "https://wagner.dev",
        title: "Staff Software Engineer",
        summary: "Passionate developer.",
      };

      const req = new Request("http://localhost:3000/api/profile/basic", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      const res = await updateBasicDataHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.firstName).toBe("Wagner");
      expect(data.lastName).toBe("Taiatella");
      expect(data.phone).toBe("555-0199");
      expect(data.location).toBe("Sao Paulo, Brazil");
      expect(data.title).toBe("Staff Software Engineer");
      expect(data.summary).toBe("Passionate developer.");

      const profileInDb = await prisma.userProfile.findUnique({
        where: { id: testProfileId },
      });
      expect(profileInDb!.firstName).toBe("Wagner");
      expect(profileInDb!.lastName).toBe("Taiatella");
    });

    it("should successfully sync active summary title and content", async () => {
      const payload = {
        firstName: "Wagner",
        lastName: "Taiatella",
        summaries: [
          { title: "Standard Resume Summary", content: "Experience building Next.js apps.", isActive: true, isAIGenerated: false, sortOrder: 0 },
          { title: "Alternative Summary", content: "Passionate engineer.", isActive: false, isAIGenerated: false, sortOrder: 1 },
        ],
      };

      const req = new Request("http://localhost:3000/api/profile/basic", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      const res = await updateBasicDataHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.title).toBe("Standard Resume Summary");
      expect(data.summary).toBe("Experience building Next.js apps.");

      const profileInDb = await prisma.userProfile.findUnique({
        where: { id: testProfileId },
        include: { summaries: true },
      });
      expect(profileInDb!.title).toBe("Standard Resume Summary");
      expect(profileInDb!.summary).toBe("Experience building Next.js apps.");
      expect(profileInDb!.summaries).toHaveLength(2);
    });

    it("should successfully update basic data with social links lacking protocol schemas", async () => {
      const payload = {
        firstName: "Wagner",
        lastName: "Taiatella",
        linkedin: "linkedin.com/in/wagner-taiatella/",
        github: "github.com/wtaiatella",
        website: "wtaiatella.com.br",
      };

      const req = new Request("http://localhost:3000/api/profile/basic", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      const res = await updateBasicDataHandler(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.linkedin).toBe("linkedin.com/in/wagner-taiatella/");
      expect(data.github).toBe("github.com/wtaiatella");
      expect(data.website).toBe("wtaiatella.com.br");

      const profileInDb = await prisma.userProfile.findUnique({
        where: { id: testProfileId },
      });
      expect(profileInDb!.linkedin).toBe("linkedin.com/in/wagner-taiatella/");
      expect(profileInDb!.github).toBe("github.com/wtaiatella");
      expect(profileInDb!.website).toBe("wtaiatella.com.br");
    });
  });
});
