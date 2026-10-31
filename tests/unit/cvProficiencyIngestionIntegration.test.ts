/**
 * @jest-environment node
 */

import { POST as parseRouteHandler } from "@/app/api/profile/parse/route";
import { ProfileMergeService } from "@/lib/merge/profileMergeService";
import { normalizeProficiency } from "@/lib/normalization/proficiencyNormalizer";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { generateJSON } from "@/lib/ai/aiClient";
import { DocumentExtractor } from "@/lib/parsing/documentExtract";
import { logger } from "@/lib/logging/logger";
import { ProficiencyLevel, SkillDTO } from "@/types/profile";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/ai/aiClient", () => ({
  generateJSON: jest.fn(),
}));

jest.mock("@/lib/parsing/documentExtract", () => ({
  DocumentExtractor: {
    extractText: jest.fn(),
  },
}));

jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    userProfile: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    profileSummary: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    aIUsageLog: {
      count: jest.fn(),
      create: jest.fn(),
    },
    experience: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    experienceBullet: {
      create: jest.fn(),
      update: jest.fn(),
    },
    project: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    projectBullet: {
      create: jest.fn(),
      update: jest.fn(),
    },
    education: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    educationBullet: {
      create: jest.fn(),
      update: jest.fn(),
    },
    skill: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cVBullet: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

describe("CV Proficiency Ingestion Integration & End-to-End Simulation (APC-28)", () => {
  const CANONICAL_LEVELS: Set<ProficiencyLevel> = new Set([
    "BEGINNER",
    "INTERMEDIATE",
    "ADVANCED",
    "EXPERT",
  ]);

  const profileId = "profile-test-apc-28";
  const userId = "user-test-apc-28";

  beforeEach(() => {
    jest.clearAllMocks();

    (auth as unknown as jest.Mock).mockResolvedValue({
      user: { id: userId, email: "candidate@example.com" },
    });

    (prisma.aIUsageLog.count as jest.Mock).mockResolvedValue(0);
    (prisma.aIUsageLog.create as jest.Mock).mockResolvedValue({ id: "log-1" });

    (prisma.userProfile.findUnique as jest.Mock).mockResolvedValue({
      id: profileId,
      userId,
    });
    (prisma.userProfile.update as jest.Mock).mockResolvedValue({});
    (prisma.profileSummary.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.profileSummary.create as jest.Mock).mockResolvedValue({
      id: "sum-1",
    });
    (prisma.profileSummary.updateMany as jest.Mock).mockResolvedValue({});
    (prisma.profileSummary.update as jest.Mock).mockResolvedValue({});

    (prisma.experience.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.project.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.education.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.skill.findMany as jest.Mock).mockResolvedValue([]);

    (prisma.skill.create as jest.Mock).mockImplementation(async ({ data }) => ({
      id: `skill-${Math.random().toString(36).substring(2, 9)}`,
      profileId: data.profileId,
      name: data.name,
      proficiency: data.proficiency,
      yearsExperience: data.yearsExperience,
      isArchived: false,
    }));

    (prisma.skill.update as jest.Mock).mockImplementation(
      async ({ where, data }) => ({
        id: where.id,
        ...data,
      }),
    );

    (prisma.cVBullet.count as jest.Mock).mockResolvedValue(0);
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb) =>
      cb(prisma),
    );

    (DocumentExtractor.extractText as jest.Mock).mockResolvedValue(
      "Sample CV text with mixed skills and proficiencies",
    );
  });

  describe("T009: Ingestion Flow & Merge Resilience with Non-Standard Proficiencies", () => {
    it("successfully ingests 10 mixed conversational, localized, and informal skills with 100% retention", async () => {
      const rawExtractedSkills = [
        { name: "English", proficiency: "Conversational", yearsExperience: 4 },
        { name: "Spanish", proficiency: "Fluent", yearsExperience: 6 },
        { name: "Portuguese", proficiency: "native", yearsExperience: 10 },
        { name: "Python", proficiency: "Basic", yearsExperience: 1 },
        { name: "Docker", proficiency: "beginner", yearsExperience: 2 },
        { name: "TypeScript", proficiency: "EXPERT", yearsExperience: 5 },
        { name: "Kubernetes", proficiency: "", yearsExperience: null },
        { name: "AWS", proficiency: null, yearsExperience: 3 },
        { name: "GraphQL", proficiency: undefined, yearsExperience: 2 },
        { name: "Rust", proficiency: "rockstar", yearsExperience: 1 },
      ];

      // Simulate pre-merge sanitization as executed in route handler
      const sanitizedSkills = rawExtractedSkills.map((s) => ({
        ...s,
        proficiency: normalizeProficiency(s.proficiency as string, s.name),
      }));

      // Verify all pre-merge proficiencies are strictly canonical enums
      for (const skill of sanitizedSkills) {
        expect(CANONICAL_LEVELS.has(skill.proficiency)).toBe(true);
      }

      // Execute mergeSkills
      await expect(
        ProfileMergeService.mergeSkills(profileId, sanitizedSkills),
      ).resolves.not.toThrow();

      // Assert 100% retention: all 10 skills persisted
      expect(prisma.skill.create).toHaveBeenCalledTimes(10);

      // Verify each mock database create received canonical uppercase enum
      const createdSkills: Record<string, ProficiencyLevel> = {};
      const createCalls = (prisma.skill.create as jest.Mock).mock.calls;
      for (const [callArg] of createCalls) {
        const { name, proficiency } = callArg.data;
        expect(CANONICAL_LEVELS.has(proficiency)).toBe(true);
        createdSkills[name] = proficiency;
      }

      expect(createdSkills).toEqual({
        English: "INTERMEDIATE",
        Spanish: "ADVANCED",
        Portuguese: "EXPERT",
        Python: "BEGINNER",
        Docker: "BEGINNER",
        TypeScript: "EXPERT",
        Kubernetes: "INTERMEDIATE",
        AWS: "INTERMEDIATE",
        GraphQL: "INTERMEDIATE",
        Rust: "INTERMEDIATE",
      });
    });

    it("verifies observability logging captures normalization events without leaking PII", async () => {
      const warnSpy = jest.spyOn(logger, "warn");

      const rawSkills = [
        { name: "English", proficiency: "Conversational" },
        { name: "Spanish", proficiency: "Fluent" },
        { name: "Go", proficiency: "" },
        { name: "Scala", proficiency: "ninja" },
      ];

      await ProfileMergeService.mergeSkills(
        profileId,
        rawSkills as unknown as SkillDTO[],
      );

      expect(warnSpy).toHaveBeenCalled();
      for (const call of warnSpy.mock.calls) {
        const metadata = (call as unknown as any[])[1] as
          | Record<string, unknown>
          | undefined;
        if (metadata && metadata.action === "normalize_proficiency") {
          expect(metadata).toHaveProperty("skillName");
          expect(metadata).toHaveProperty("rawProficiency");
          expect(metadata).toHaveProperty("normalizedProficiency");
          expect(metadata).toHaveProperty("reason");

          // Ensure no PII (email, user ID, document ID) is present
          expect(metadata).not.toHaveProperty("email");
          expect(metadata).not.toHaveProperty("userId");
          expect(metadata).not.toHaveProperty("profileId");
          expect(metadata).not.toHaveProperty("candidateEmail");
        }
      }

      warnSpy.mockRestore();
    });

    it("reconciles incoming informal skills against existing database skills safely upgrading tiers", async () => {
      // Existing skills in database: English (BEGINNER) and Python (ADVANCED)
      (prisma.skill.findMany as jest.Mock).mockResolvedValue([
        {
          id: "skill-existing-eng",
          profileId,
          name: "English",
          proficiency: "BEGINNER",
          yearsExperience: 1,
          isArchived: false,
        },
        {
          id: "skill-existing-py",
          profileId,
          name: "Python",
          proficiency: "ADVANCED",
          yearsExperience: 4,
          isArchived: false,
        },
      ]);

      const incomingSkills = [
        // English incoming: Conversational -> INTERMEDIATE. Math.max(BEGINNER=1, INTERMEDIATE=2) -> INTERMEDIATE
        {
          name: "English",
          proficiency: "Conversational" as any,
          yearsExperience: 3,
        },
        // Python incoming: Basic -> BEGINNER. Math.max(ADVANCED=3, BEGINNER=1) -> ADVANCED
        { name: "Python", proficiency: "Basic" as any, yearsExperience: 2 },
      ];

      await expect(
        ProfileMergeService.mergeSkills(profileId, incomingSkills),
      ).resolves.not.toThrow();

      expect(prisma.skill.update).toHaveBeenCalledWith({
        where: { id: "skill-existing-eng" },
        data: {
          name: "English",
          proficiency: "INTERMEDIATE",
          yearsExperience: 3,
        },
      });

      expect(prisma.skill.update).toHaveBeenCalledWith({
        where: { id: "skill-existing-py" },
        data: {
          name: "Python",
          proficiency: "ADVANCED",
          yearsExperience: 4,
        },
      });
    });
  });

  describe("T007 & T009: End-to-End POST /api/profile/parse SSE Route Simulation", () => {
    it("completes full SSE stream without aborts, emits canonical enums, and persists 100% of skills", async () => {
      const mockEdSkillsExtraction = {
        education: [
          {
            institution: "MIT",
            degree: "B.S. in Computer Science",
            startDate: "2018-09-01",
            endDate: "2022-05-31",
            current: false,
            hideEndDate: false,
            bullets: [],
          },
        ],
        skills: [
          {
            name: "English",
            proficiency: "Conversational",
            yearsExperience: 5,
          },
          { name: "Spanish", proficiency: "Fluent", yearsExperience: 3 },
          { name: "Python", proficiency: "Basic", yearsExperience: 1 },
          { name: "Docker", proficiency: "", yearsExperience: null },
          { name: "AWS", proficiency: null, yearsExperience: 2 },
          { name: "Portuguese", proficiency: "native", yearsExperience: 10 },
        ],
      };

      (generateJSON as jest.Mock).mockImplementation(
        async (_prompt: string, type: string) => {
          if (type === "cv.parse.basicData") {
            return {
              firstName: "Alex",
              lastName: "Rivera",
              title: "Full Stack Engineer",
              summary: "Experienced developer.",
            };
          }
          if (type === "cv.parse.experiences") {
            return [];
          }
          if (type === "cv.parse.projects") {
            return [];
          }
          if (type === "cv.parse.education") {
            return mockEdSkillsExtraction;
          }
          return {};
        },
      );

      const mockFile = {
        name: "resume.pdf",
        arrayBuffer: async () =>
          Buffer.from("dummy resume text content").buffer,
      };
      const mockFormData = {
        get: (key: string) => (key === "file" ? mockFile : null),
      };
      const req = {
        formData: async () => mockFormData,
      } as unknown as Request;

      const response = await parseRouteHandler(req);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain(
        "text/event-stream",
      );

      // Read SSE stream to completion
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let streamOutput = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        streamOutput += decoder.decode(value);
      }

      // Parse SSE events
      const events = streamOutput
        .split("\n\n")
        .filter((chunk) => chunk.startsWith("data: "))
        .map((chunk) => JSON.parse(chunk.replace(/^data: /, "")));

      // Assert error event was NOT emitted
      const errorEvent = events.find((e) => e.phase === "error");
      expect(errorEvent).toBeUndefined();

      // Find the education phase event with data
      const educationEvent = events.find(
        (e) => e.phase === "education" && e.data,
      );
      expect(educationEvent).toBeDefined();
      expect(educationEvent.progress).toBe(100);

      // Verify skills returned in SSE data have canonical enums
      const emittedSkills = educationEvent.data.skills;
      expect(emittedSkills).toHaveLength(6);
      for (const skill of emittedSkills) {
        expect(CANONICAL_LEVELS.has(skill.proficiency)).toBe(true);
      }

      expect(
        emittedSkills.map((s: SkillDTO) => [s.name, s.proficiency]),
      ).toEqual([
        ["English", "INTERMEDIATE"],
        ["Spanish", "ADVANCED"],
        ["Python", "BEGINNER"],
        ["Docker", "INTERMEDIATE"],
        ["AWS", "INTERMEDIATE"],
        ["Portuguese", "EXPERT"],
      ]);

      // Verify mock DB received all 6 skills with canonical uppercase enums
      expect(prisma.skill.create).toHaveBeenCalledTimes(6);
      const createCalls = (prisma.skill.create as jest.Mock).mock.calls;
      for (const [callArg] of createCalls) {
        expect(CANONICAL_LEVELS.has(callArg.data.proficiency)).toBe(true);
      }
    });

    it("handles AI fallback extraction path and normalizes fallback skills before SSE emission", async () => {
      // Primary education prompt returns empty skills
      (generateJSON as jest.Mock).mockImplementation(
        async (_prompt: string, type: string) => {
          if (type === "cv.parse.basicData") return { firstName: "Test" };
          if (type === "cv.parse.experiences") return [];
          if (type === "cv.parse.projects") return [];
          if (type === "cv.parse.education") {
            return {
              education: [],
              skills: [], // empty -> triggers fallback prompt
            };
          }
          if (type === "cv.parse.skills") {
            // Fallback prompt returns informal and localized skills
            return [
              { name: "English", proficiency: "Conversational" },
              { name: "Docker", proficiency: "iniciante" },
              { name: "React", proficiency: "avançado" },
            ];
          }
          return {};
        },
      );

      const mockFile = {
        name: "resume.pdf",
        arrayBuffer: async () => Buffer.from("cv file content").buffer,
      };
      const mockFormData = {
        get: (key: string) => (key === "file" ? mockFile : null),
      };
      const req = {
        formData: async () => mockFormData,
      } as unknown as Request;

      const response = await parseRouteHandler(req);
      expect(response.status).toBe(200);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let streamOutput = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        streamOutput += decoder.decode(value);
      }

      const events = streamOutput
        .split("\n\n")
        .filter((chunk) => chunk.startsWith("data: "))
        .map((chunk) => JSON.parse(chunk.replace(/^data: /, "")));

      const educationEvent = events.find(
        (e) => e.phase === "education" && e.data,
      );
      expect(educationEvent).toBeDefined();

      const fallbackSkills = educationEvent.data.skills;
      expect(fallbackSkills).toHaveLength(3);
      expect(
        fallbackSkills.map((s: SkillDTO) => [s.name, s.proficiency]),
      ).toEqual([
        ["English", "INTERMEDIATE"],
        ["Docker", "BEGINNER"],
        ["React", "ADVANCED"],
      ]);

      expect(prisma.skill.create).toHaveBeenCalledTimes(3);
    });
  });
});
