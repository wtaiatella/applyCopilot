/**
 * @jest-environment node
 */

import { ProfileMergeService } from "../../src/lib/merge/profileMergeService";
import { prisma } from "../../src/lib/db/prisma";
import { ExperienceDTO } from "../../src/types/profile";

// Mock the database client
jest.mock("../../src/lib/db/prisma", () => ({
  prisma: {
    userProfile: {
      update: jest.fn(),
    },
    experience: {
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    experienceBullet: {
      create: jest.fn(),
      update: jest.fn(),
    },
    project: {
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    projectBullet: {
      create: jest.fn(),
      update: jest.fn(),
    },
    education: {
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    educationBullet: {
      create: jest.fn(),
      update: jest.fn(),
    },
    skill: {
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  },
}));

describe("ProfileMergeService", () => {
  const profileId = "test-profile-id";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("normalizeText", () => {
    it("should normalize string casing, spaces, and punctuation", () => {
      expect(ProfileMergeService.normalizeText(" Google, Inc. ")).toBe("google inc");
      expect(ProfileMergeService.normalizeText("Self-Employed!!")).toBe("selfemployed");
      expect(ProfileMergeService.normalizeText("")).toBe("");
    });
  });

  describe("mergeBasicData", () => {
    it("should update UserProfile with non-empty fields", async () => {
      const basicData = {
        firstName: "Wagner",
        lastName: "Taiatella",
        phone: "+554899999999",
      };

      await ProfileMergeService.mergeBasicData(profileId, basicData);

      expect(prisma.userProfile.update).toHaveBeenCalledWith({
        where: { id: profileId },
        data: basicData,
      });
    });
  });


  describe("mergeExperiences", () => {
    it("should create new experience if no company match exists", async () => {
      const incomingExp = {
        company: "Avalara",
        position: "Senior Engineer",
        startDate: "2020-01-01",
        bullets: [{ text: "Developed cool APIs" }],
      };

      (prisma.experience.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.experience.create as jest.Mock).mockResolvedValue({ id: "new-exp-id" });

      await ProfileMergeService.mergeExperiences(profileId, [incomingExp] as unknown as ExperienceDTO[]);

      expect(prisma.experience.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          profileId,
          company: "Avalara",
          position: "Senior Engineer",
        }),
      });

      expect(prisma.experienceBullet.create).toHaveBeenCalledWith({
        data: {
          experienceId: "new-exp-id",
          text: "Developed cool APIs",
          type: "BULLET",
          sortOrder: 0,
        },
      });
    });

    it("should update existing experience when company matches (even if position differs)", async () => {
      // Per spec: experience match key is normalized company ONLY.
      // "Same company / different position" must NOT create a duplicate company entry.
      // Instead, the existing experience is updated with the new incoming data.
      const incomingExp = {
        company: "Avalara",
        position: "Manager",
        startDate: "2022-01-01",
      };

      (prisma.experience.findMany as jest.Mock).mockResolvedValue([
        {
          id: "existing-exp-id",
          company: "Avalara",
          position: "Senior Engineer",
          freeFormContext: [],
          bullets: [],
        },
      ]);

      await ProfileMergeService.mergeExperiences(profileId, [incomingExp] as unknown as ExperienceDTO[]);

      // Should update existing, NOT create a new experience
      expect(prisma.experience.update).toHaveBeenCalled();
      expect(prisma.experience.create).not.toHaveBeenCalled();
    });

    it("should merge bullets and reactivate archived bullets if company and position match exactly", async () => {
      const incomingExp = {
        company: "Avalara",
        position: "Senior Engineer",
        bullets: [
          { text: "Active Bullet" },     // unchanged
          { text: "Archived Bullet" },   // needs reactivation
          { text: "Brand New Bullet" },  // needs creation
        ],
      };

      (prisma.experience.findMany as jest.Mock).mockResolvedValue([
        {
          id: "existing-exp-id",
          company: "Avalara",
          position: "Senior Engineer",
          freeFormContext: [],
          bullets: [
            { id: "b1", text: "Active Bullet", isArchived: false },
            { id: "b2", text: "Archived Bullet", isArchived: true },
          ],
        },
      ]);

      await ProfileMergeService.mergeExperiences(profileId, [incomingExp] as unknown as ExperienceDTO[]);

      // Bullets merge assertions
      // 1. Should unarchive "Archived Bullet" (id: b2)
      expect(prisma.experienceBullet.update).toHaveBeenCalledWith({
        where: { id: "b2" },
        data: { isArchived: false },
      });

      // 2. Should create "Brand New Bullet"
      expect(prisma.experienceBullet.create).toHaveBeenCalledWith({
        data: {
          experienceId: "existing-exp-id",
          text: "Brand New Bullet",
          type: "BULLET",
          sortOrder: 2,
        },
      });

      // 3. Should not touch already active "Active Bullet" (id: b1)
      expect(prisma.experienceBullet.create).toHaveBeenCalledTimes(1); // Only for the new one
      expect(prisma.experienceBullet.update).toHaveBeenCalledTimes(1); // Only for the unarchived one
    });
  });

  describe("mergeProjects", () => {
    it("should union technologies when merging an existing project", async () => {
      const incomingProj = {
        name: "ApplyCopilot",
        technologies: ["React", "TypeScript", "PostgreSQL"],
        bullets: [],
      };

      (prisma.project.findMany as jest.Mock).mockResolvedValue([
        {
          id: "existing-proj-id",
          name: "ApplyCopilot",
          technologies: ["React", "Next.js"],
          freeFormContext: [],
          bullets: [],
        },
      ]);

      await ProfileMergeService.mergeProjects(profileId, [incomingProj]);

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: "existing-proj-id" },
        data: expect.objectContaining({
          technologies: ["React", "Next.js", "TypeScript", "PostgreSQL"],
        }),
      });
    });
  });

  describe("mergeSkills", () => {
    it("should keep the higher proficiency level and higher years of experience", async () => {
      const incomingSkills = [
        { name: "TypeScript", proficiency: "EXPERT" as const, yearsExperience: 3 },
        { name: "Next.js", proficiency: "INTERMEDIATE" as const, yearsExperience: 5 },
      ];

      (prisma.skill.findMany as jest.Mock).mockResolvedValue([
        { id: "s1", name: "TypeScript", proficiency: "ADVANCED", yearsExperience: 5 },
        { id: "s2", name: "Next.js", proficiency: "EXPERT", yearsExperience: 2 },
      ]);

      await ProfileMergeService.mergeSkills(profileId, incomingSkills);

      // TypeScript: EXPERT (from incoming) > ADVANCED, max years = 5 (from existing)
      expect(prisma.skill.update).toHaveBeenCalledWith({
        where: { id: "s1" },
        data: {
          proficiency: "EXPERT",
          yearsExperience: 5,
        },
      });

      // Next.js: EXPERT (from existing) > INTERMEDIATE, max years = 5 (from incoming)
      expect(prisma.skill.update).toHaveBeenCalledWith({
        where: { id: "s2" },
        data: {
          proficiency: "EXPERT",
          yearsExperience: 5,
        },
      });
    });
  });
});
