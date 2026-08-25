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
    profileSummary: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
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
    cVBullet: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

describe("ProfileMergeService", () => {
  const profileId = "test-profile-id";

  beforeEach(() => {
    jest.clearAllMocks();
    // mergeSkills now reconciles each matched skill through reconcileSkillMutation inside a
    // prisma.$transaction — run the callback against the same mocked `prisma` object (tx ===
    // prisma here) so existing `prisma.skill.update`/`.create` assertions below still apply.
    // Default: no existing skill is CV-locked, so reconcileSkillMutation takes its "simple
    // update" path (a plain skill.update), matching this file's pre-existing expectations.
    (prisma.$transaction as jest.Mock).mockImplementation((cb) => cb(prisma));
    (prisma.cVBullet.count as jest.Mock).mockResolvedValue(0);
  });

  describe("normalizeText", () => {
    it("should normalize string casing, spaces, and punctuation", () => {
      expect(ProfileMergeService.normalizeText(" Google, Inc. ")).toBe(
        "google inc",
      );
      expect(ProfileMergeService.normalizeText("Self-Employed!!")).toBe(
        "selfemployed",
      );
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

    it("should create new ProfileSummary and deactivate old ones if summary is new", async () => {
      const basicData = {
        title: "Staff Engineer",
        summary: "Passionate about full-stack architectures.",
      };

      (prisma.profileSummary.findMany as jest.Mock).mockResolvedValue([
        {
          id: "s1",
          title: "Old Title",
          content: "Old Content",
          isActive: true,
        },
      ]);

      await ProfileMergeService.mergeBasicData(profileId, basicData);

      // Should deactivate existing
      expect(prisma.profileSummary.updateMany).toHaveBeenCalledWith({
        where: { profileId },
        data: { isActive: false },
      });

      // Should create new active one
      expect(prisma.profileSummary.create).toHaveBeenCalledWith({
        data: {
          profileId,
          title: "Staff Engineer",
          content: "Passionate about full-stack architectures.",
          isAIGenerated: false,
          isActive: true,
          sortOrder: 1,
        },
      });

      // Should update flat fields
      expect(prisma.userProfile.update).toHaveBeenCalledWith({
        where: { id: profileId },
        data: {
          title: "Staff Engineer",
          summary: "Passionate about full-stack architectures.",
        },
      });
    });

    it("should activate matching duplicate ProfileSummary and deactivate others if duplicate is inactive", async () => {
      const basicData = {
        title: "Staff Engineer",
        summary: "Passionate about full-stack architectures.",
      };

      (prisma.profileSummary.findMany as jest.Mock).mockResolvedValue([
        {
          id: "s1",
          title: "Other Title",
          content: "Other Content",
          isActive: true,
        },
        {
          id: "s2",
          title: "Staff Engineer",
          content: "Passionate about full-stack architectures.",
          isActive: false,
        },
      ]);

      await ProfileMergeService.mergeBasicData(profileId, basicData);

      // Should deactivate all
      expect(prisma.profileSummary.updateMany).toHaveBeenCalledWith({
        where: { profileId },
        data: { isActive: false },
      });

      // Should activate duplicate
      expect(prisma.profileSummary.update).toHaveBeenCalledWith({
        where: { id: "s2" },
        data: { isActive: true },
      });

      // Should not call create
      expect(prisma.profileSummary.create).not.toHaveBeenCalled();
    });

    it("should do nothing to duplicate ProfileSummary if already active", async () => {
      const basicData = {
        title: "Staff Engineer",
        summary: "Passionate about full-stack architectures.",
      };

      (prisma.profileSummary.findMany as jest.Mock).mockResolvedValue([
        {
          id: "s2",
          title: "Staff Engineer",
          content: "Passionate about full-stack architectures.",
          isActive: true,
        },
      ]);

      await ProfileMergeService.mergeBasicData(profileId, basicData);

      expect(prisma.profileSummary.updateMany).not.toHaveBeenCalled();
      expect(prisma.profileSummary.update).not.toHaveBeenCalled();
      expect(prisma.profileSummary.create).not.toHaveBeenCalled();
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
      (prisma.experience.create as jest.Mock).mockResolvedValue({
        id: "new-exp-id",
      });

      await ProfileMergeService.mergeExperiences(profileId, [
        incomingExp,
      ] as unknown as ExperienceDTO[]);

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

      await ProfileMergeService.mergeExperiences(profileId, [
        incomingExp,
      ] as unknown as ExperienceDTO[]);

      expect(prisma.experience.update).toHaveBeenCalled();
      expect(prisma.experience.create).not.toHaveBeenCalled();
    });

    it("should merge bullets and reactivate archived bullets if company and position match exactly", async () => {
      const incomingExp = {
        company: "Avalara",
        position: "Senior Engineer",
        bullets: [
          { text: "Active Bullet" }, // unchanged
          { text: "Archived Bullet" }, // needs reactivation
          { text: "Brand New Bullet" }, // needs creation
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

      await ProfileMergeService.mergeExperiences(profileId, [
        incomingExp,
      ] as unknown as ExperienceDTO[]);

      expect(prisma.experienceBullet.update).toHaveBeenCalledWith({
        where: { id: "b2" },
        data: { isArchived: false },
      });

      expect(prisma.experienceBullet.create).toHaveBeenCalledWith({
        data: {
          experienceId: "existing-exp-id",
          text: "Brand New Bullet",
          type: "BULLET",
          sortOrder: 2,
        },
      });

      expect(prisma.experienceBullet.create).toHaveBeenCalledTimes(1);
      expect(prisma.experienceBullet.update).toHaveBeenCalledTimes(1);
    });

    it("should merge and filter duplicate context notes", async () => {
      const incomingExp = {
        company: "Avalara",
        freeFormContext: ["Note A", "Note B"],
      };

      (prisma.experience.findMany as jest.Mock).mockResolvedValue([
        {
          id: "existing-exp-id",
          company: "Avalara",
          freeFormContext: ["Note A"],
          bullets: [],
        },
      ]);

      await ProfileMergeService.mergeExperiences(profileId, [
        incomingExp,
      ] as unknown as ExperienceDTO[]);

      expect(prisma.experience.update).toHaveBeenCalledWith({
        where: { id: "existing-exp-id" },
        data: expect.objectContaining({
          freeFormContext: ["Note A", "Note B"],
        }),
      });
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

    it("should create new project if no project match exists", async () => {
      const incomingProj = {
        name: "NewProject",
        technologies: ["Golang"],
        bullets: [{ text: "Created REST API" }],
      };

      (prisma.project.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.project.create as jest.Mock).mockResolvedValue({
        id: "new-proj-id",
      });

      await ProfileMergeService.mergeProjects(profileId, [incomingProj]);

      expect(prisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          profileId,
          name: "NewProject",
          technologies: ["Golang"],
        }),
      });

      expect(prisma.projectBullet.create).toHaveBeenCalledWith({
        data: {
          projectId: "new-proj-id",
          text: "Created REST API",
          type: "BULLET",
          sortOrder: 0,
        },
      });
    });

    it("should merge and filter duplicate project context notes", async () => {
      const incomingProj = {
        name: "ApplyCopilot",
        freeFormContext: ["Note X", "Note Y"],
        bullets: [{ text: "Archived Bullet" }, { text: "New Bullet" }],
      };

      (prisma.project.findMany as jest.Mock).mockResolvedValue([
        {
          id: "existing-proj-id",
          name: "ApplyCopilot",
          freeFormContext: ["Note X"],
          bullets: [{ id: "pb1", text: "Archived Bullet", isArchived: true }],
          technologies: [],
        },
      ]);

      await ProfileMergeService.mergeProjects(profileId, [incomingProj]);

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: "existing-proj-id" },
        data: expect.objectContaining({
          freeFormContext: ["Note X", "Note Y"],
        }),
      });

      expect(prisma.projectBullet.update).toHaveBeenCalledWith({
        where: { id: "pb1" },
        data: { isArchived: false },
      });

      expect(prisma.projectBullet.create).toHaveBeenCalledWith({
        data: {
          projectId: "existing-proj-id",
          text: "New Bullet",
          type: "BULLET",
          sortOrder: 1,
        },
      });
    });
  });

  describe("mergeEducation", () => {
    it("should create new education if no institution + degree match exists", async () => {
      const incomingEd = {
        institution: "UFSC",
        degree: "B.S. Computer Science",
        startDate: "2015-03-01",
        bullets: [{ text: "GPA 3.9" }],
      };

      (prisma.education.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.education.create as jest.Mock).mockResolvedValue({
        id: "new-ed-id",
      });

      await ProfileMergeService.mergeEducation(profileId, [incomingEd]);

      expect(prisma.education.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          profileId,
          institution: "UFSC",
          degree: "B.S. Computer Science",
        }),
      });

      expect(prisma.educationBullet.create).toHaveBeenCalledWith({
        data: {
          educationId: "new-ed-id",
          text: "GPA 3.9",
          type: "BULLET",
          sortOrder: 0,
        },
      });
    });

    it("should update existing education and merge contexts/bullets", async () => {
      const incomingEd = {
        institution: "UFSC",
        degree: "B.S. Computer Science",
        freeFormContext: ["Thesis about AI", "Thesis about compilers"],
        bullets: [{ text: "Archived Bullet" }, { text: "New Bullet" }],
      };

      (prisma.education.findMany as jest.Mock).mockResolvedValue([
        {
          id: "existing-ed-id",
          institution: "UFSC",
          degree: "B.S. Computer Science",
          freeFormContext: ["Thesis about AI"],
          bullets: [{ id: "eb1", text: "Archived Bullet", isArchived: true }],
        },
      ]);

      await ProfileMergeService.mergeEducation(profileId, [incomingEd]);

      expect(prisma.education.update).toHaveBeenCalledWith({
        where: { id: "existing-ed-id" },
        data: expect.objectContaining({
          freeFormContext: ["Thesis about AI", "Thesis about compilers"],
        }),
      });

      expect(prisma.educationBullet.update).toHaveBeenCalledWith({
        where: { id: "eb1" },
        data: { isArchived: false },
      });

      expect(prisma.educationBullet.create).toHaveBeenCalledWith({
        data: {
          educationId: "existing-ed-id",
          text: "New Bullet",
          type: "BULLET",
          sortOrder: 1,
        },
      });
    });
  });

  describe("mergeSkills", () => {
    it("should keep the higher proficiency level and higher years of experience", async () => {
      const incomingSkills = [
        {
          name: "TypeScript",
          proficiency: "EXPERT" as const,
          yearsExperience: 3,
        },
        {
          name: "Next.js",
          proficiency: "INTERMEDIATE" as const,
          yearsExperience: 5,
        },
      ];

      (prisma.skill.findMany as jest.Mock).mockResolvedValue([
        {
          id: "s1",
          name: "TypeScript",
          proficiency: "ADVANCED",
          yearsExperience: 5,
        },
        {
          id: "s2",
          name: "Next.js",
          proficiency: "EXPERT",
          yearsExperience: 2,
        },
      ]);

      await ProfileMergeService.mergeSkills(profileId, incomingSkills);

      expect(prisma.skill.update).toHaveBeenCalledWith({
        where: { id: "s1" },
        data: {
          name: "TypeScript",
          proficiency: "EXPERT",
          yearsExperience: 5,
        },
      });

      expect(prisma.skill.update).toHaveBeenCalledWith({
        where: { id: "s2" },
        data: {
          name: "Next.js",
          proficiency: "EXPERT",
          yearsExperience: 5,
        },
      });
    });

    it("archives the existing skill and creates a fresh row when it is locked into a generated CV", async () => {
      const incomingSkills = [
        { name: "Python", proficiency: "EXPERT" as const, yearsExperience: 4 },
      ];

      (prisma.skill.findMany as jest.Mock).mockResolvedValue([
        {
          id: "s1",
          name: "Python",
          proficiency: "INTERMEDIATE",
          yearsExperience: 2,
        },
      ]);
      (prisma.cVBullet.count as jest.Mock).mockResolvedValue(1);
      (prisma.skill.create as jest.Mock).mockResolvedValue({ id: "s1-new" });

      await ProfileMergeService.mergeSkills(profileId, incomingSkills);

      expect(prisma.skill.update).toHaveBeenCalledWith({
        where: { id: "s1" },
        data: { isArchived: true, isActive: false },
      });
      expect(prisma.skill.create).toHaveBeenCalledWith({
        data: {
          profileId,
          name: "Python",
          proficiency: "EXPERT",
          yearsExperience: 4,
          isActive: true,
          isArchived: false,
        },
      });
    });

    it("should create new skill if no skill match exists", async () => {
      const incomingSkills = [
        { name: "Rust", proficiency: "BEGINNER" as const, yearsExperience: 1 },
      ];

      (prisma.skill.findMany as jest.Mock).mockResolvedValue([]);

      await ProfileMergeService.mergeSkills(profileId, incomingSkills);

      expect(prisma.skill.create).toHaveBeenCalledWith({
        data: {
          profileId,
          name: "Rust",
          proficiency: "BEGINNER",
          yearsExperience: 1,
        },
      });
    });
  });
});
