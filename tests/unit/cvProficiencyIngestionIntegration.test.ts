/**
 * @jest-environment node
 */

import fs from "fs/promises";
import path from "path";
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
    (prisma.experience.create as jest.Mock).mockImplementation(
      async ({ data }) => ({
        id: "exp-test-1",
        ...data,
        bullets: [],
      }),
    );
    (prisma.experienceBullet.create as jest.Mock).mockImplementation(
      async ({ data }) => ({
        id: `eb-${Math.random().toString(36).substring(2, 9)}`,
        ...data,
      }),
    );

    (prisma.project.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.project.create as jest.Mock).mockImplementation(
      async ({ data }) => ({
        id: "proj-test-1",
        ...data,
        bullets: [],
      }),
    );
    (prisma.projectBullet.create as jest.Mock).mockImplementation(
      async ({ data }) => ({
        id: `pb-${Math.random().toString(36).substring(2, 9)}`,
        ...data,
      }),
    );

    (prisma.education.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.education.create as jest.Mock).mockImplementation(
      async ({ data }) => ({
        id: "edu-test-1",
        ...data,
        bullets: [],
      }),
    );
    (prisma.educationBullet.create as jest.Mock).mockImplementation(
      async ({ data }) => ({
        id: `edub-${Math.random().toString(36).substring(2, 9)}`,
        ...data,
      }),
    );

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

  describe("T008: End-to-End Extraction Typing & Debug Artifact Verification with Reference CV Fixture (APC-36 / US1 & US2)", () => {
    const originalLogLevel = process.env.LOG_LEVEL;
    const trackedDebugDirs: string[] = [];

    afterEach(async () => {
      process.env.LOG_LEVEL = originalLogLevel;
      for (const dir of trackedDebugDirs) {
        try {
          await fs.rm(dir, { recursive: true, force: true });
        } catch {
          // ignore cleanup errors
        }
      }
      trackedDebugDirs.length = 0;
    });

    it("simulates full multi-stage parse with reference CV fixture asserting PARAGRAPH vs BULLET typing and debug stage artifacts", async () => {
      process.env.LOG_LEVEL = "debug";

      const referenceFilename = "Wagner_Taiatella_-_Resume.pdf";
      const referenceBinary = Buffer.from(
        "%PDF-1.4 Reference Resume for Wagner Taiatella - Integration Fixture",
      );

      const referenceCvText = `
WAGNER TAIATELLA
Staff Software Engineer & Engineering Leader
Campinas, SP, Brazil | wagner@example.com | https://linkedin.com/in/wagnertaiatella

PROFESSIONAL SUMMARY
Experienced engineering leader with deep expertise in distributed systems, autonomous AI agents, and high-scale cloud platforms.

EXPERIENCE
Beacon AI | Head of Engineering | 2023 - Present
Beacon is an AI-powered talent marketplace helping engineering organizations scale autonomous agent workflows. Head of Engineering leading cross-functional squads across AI platforms, agent runtimes, and distributed infrastructure.
• Architected multi-stage CV parsing pipeline with isolated debug observability and SSE progress streaming, reducing import failure rate by 80%.
• Implemented resilient profile reconciliation engine preserving user-edited custom bullets and skill proficiency tier upgrades.
• Scaled vector similarity search infrastructure across 50k+ candidate profiles with sub-100ms p95 latency.

PROJECTS
ApplyCopilot | 2024 - Present
Automated job application copilot integrating multi-agent LLM workflows and resume tailoring.
• Developed Chrome extension background service worker and content scripts for real-time ATS job scraping.

EDUCATION & SKILLS
University of Sao Paulo | B.S. in Computer Science | 2010 - 2014
• Honors thesis in distributed consensus algorithms and machine learning.
Skills: TypeScript (EXPERT), Python (ADVANCED), Docker (INTERMEDIATE)
`;

      (DocumentExtractor.extractText as jest.Mock).mockResolvedValue(
        referenceCvText,
      );

      (generateJSON as jest.Mock).mockImplementation(
        async (_prompt: string, type: string) => {
          if (type === "cv.parse.basicData") {
            return {
              firstName: "Wagner",
              lastName: "Taiatella",
              title: "Staff Software Engineer & Engineering Leader",
              summary:
                "Experienced engineering leader with deep expertise in distributed systems, autonomous AI agents, and high-scale cloud platforms.",
              location: "Campinas, SP, Brazil",
              linkedin: "https://linkedin.com/in/wagnertaiatella",
            };
          }
          if (type === "cv.parse.experiences") {
            return [
              {
                company: "Beacon AI",
                position: "Head of Engineering",
                startDate: "2023-01-01",
                endDate: null,
                current: true,
                bullets: [
                  {
                    text: "Beacon is an AI-powered talent marketplace helping engineering organizations scale autonomous agent workflows. Head of Engineering leading cross-functional squads across AI platforms, agent runtimes, and distributed infrastructure.",
                    type: "PARAGRAPH",
                  },
                  {
                    text: "Architected multi-stage CV parsing pipeline with isolated debug observability and SSE progress streaming, reducing import failure rate by 80%.",
                    type: "BULLET",
                  },
                  {
                    text: "Implemented resilient profile reconciliation engine preserving user-edited custom bullets and skill proficiency tier upgrades.",
                    type: "BULLET",
                  },
                  {
                    text: "Scaled vector similarity search infrastructure across 50k+ candidate profiles with sub-100ms p95 latency.",
                    type: "BULLET",
                  },
                ],
              },
            ];
          }
          if (type === "cv.parse.projects") {
            return [
              {
                name: "ApplyCopilot",
                startDate: "2024-01-01",
                endDate: null,
                current: true,
                technologies: ["TypeScript", "Next.js", "PostgreSQL"],
                bullets: [
                  {
                    text: "Automated job application copilot integrating multi-agent LLM workflows and resume tailoring.",
                    type: "PARAGRAPH",
                  },
                  {
                    text: "Developed Chrome extension background service worker and content scripts for real-time ATS job scraping.",
                    type: "BULLET",
                  },
                ],
              },
            ];
          }
          if (type === "cv.parse.education") {
            return {
              education: [
                {
                  institution: "University of Sao Paulo",
                  degree: "B.S. in Computer Science",
                  startDate: "2010-01-01",
                  endDate: "2014-12-01",
                  current: false,
                  hideEndDate: false,
                  bullets: [
                    {
                      text: "Honors thesis in distributed consensus algorithms and machine learning.",
                      type: "PARAGRAPH",
                    },
                  ],
                },
              ],
              skills: [
                {
                  name: "TypeScript",
                  proficiency: "EXPERT",
                  yearsExperience: 8,
                },
                {
                  name: "Python",
                  proficiency: "ADVANCED",
                  yearsExperience: 6,
                },
                {
                  name: "Docker",
                  proficiency: "INTERMEDIATE",
                  yearsExperience: 4,
                },
              ],
            };
          }
          return {};
        },
      );

      const mockFile = {
        name: referenceFilename,
        arrayBuffer: async () =>
          referenceBinary.buffer.slice(
            referenceBinary.byteOffset,
            referenceBinary.byteOffset + referenceBinary.byteLength,
          ),
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

      // 1. Verify SSE events stream completed cleanly
      const events = streamOutput
        .split("\n\n")
        .filter((chunk) => chunk.startsWith("data: "))
        .map((chunk) => JSON.parse(chunk.replace(/^data: /, "")));

      const errorEvent = events.find((e) => e.phase === "error");
      expect(errorEvent).toBeUndefined();

      // 2. Verify experience event and bullet types in stream
      const expEvent = events.find((e) => e.phase === "experiences" && e.data);
      expect(expEvent).toBeDefined();
      const experienceData = expEvent.data[0];
      expect(experienceData.company).toBe("Beacon AI");
      expect(experienceData.bullets).toHaveLength(4);

      // Assert introductory company overview is PARAGRAPH with sortOrder: 0
      expect(experienceData.bullets[0]).toEqual({
        text: "Beacon is an AI-powered talent marketplace helping engineering organizations scale autonomous agent workflows. Head of Engineering leading cross-functional squads across AI platforms, agent runtimes, and distributed infrastructure.",
        type: "PARAGRAPH",
        sortOrder: 0,
      });

      // Assert subsequent achievements are BULLET with sequential sortOrder: 1, 2, 3
      expect(experienceData.bullets[1]).toEqual({
        text: "Architected multi-stage CV parsing pipeline with isolated debug observability and SSE progress streaming, reducing import failure rate by 80%.",
        type: "BULLET",
        sortOrder: 1,
      });
      expect(experienceData.bullets[2]).toEqual({
        text: "Implemented resilient profile reconciliation engine preserving user-edited custom bullets and skill proficiency tier upgrades.",
        type: "BULLET",
        sortOrder: 2,
      });
      expect(experienceData.bullets[3]).toEqual({
        text: "Scaled vector similarity search infrastructure across 50k+ candidate profiles with sub-100ms p95 latency.",
        type: "BULLET",
        sortOrder: 3,
      });

      // 3. Verify Prisma experienceBullet.create calls preserve typing and sequence
      const bulletCreateCalls = (prisma.experienceBullet.create as jest.Mock)
        .mock.calls;
      expect(bulletCreateCalls).toHaveLength(4);
      expect(bulletCreateCalls[0][0].data).toMatchObject({
        type: "PARAGRAPH",
        sortOrder: 0,
      });
      expect(bulletCreateCalls[1][0].data).toMatchObject({
        type: "BULLET",
        sortOrder: 1,
      });
      expect(bulletCreateCalls[2][0].data).toMatchObject({
        type: "BULLET",
        sortOrder: 2,
      });
      expect(bulletCreateCalls[3][0].data).toMatchObject({
        type: "BULLET",
        sortOrder: 3,
      });

      // 4. Verify debug filesystem directory and all 7 artifacts
      const ingestionBaseDir = path.join(process.cwd(), "debug", "ingestion");
      const entries = await fs.readdir(ingestionBaseDir);
      const matchingDirs = entries
        .filter((d) => d.endsWith(`-${referenceFilename}`))
        .sort();
      expect(matchingDirs.length).toBeGreaterThan(0);

      const runDirName = matchingDirs[matchingDirs.length - 1];
      const runDirPath = path.join(ingestionBaseDir, runDirName);
      trackedDebugDirs.push(runDirPath);

      const filesInRunDir = (await fs.readdir(runDirPath)).sort();
      expect(filesInRunDir).toEqual([
        "01_basic.json",
        "02_experiences.json",
        "03_projects.json",
        "04_education_skills.json",
        "05_merged.json",
        "Wagner_Taiatella_-_Resume.pdf",
        "transcription.txt",
      ]);

      // Verify transcription.txt content
      const savedTranscription = await fs.readFile(
        path.join(runDirPath, "transcription.txt"),
        "utf-8",
      );
      expect(savedTranscription).toBe(referenceCvText);

      // Verify original binary saved
      const savedOriginal = await fs.readFile(
        path.join(runDirPath, referenceFilename),
      );
      expect(savedOriginal).toEqual(referenceBinary);

      // Verify 02_experiences.json payload content
      const expJson = JSON.parse(
        await fs.readFile(
          path.join(runDirPath, "02_experiences.json"),
          "utf-8",
        ),
      );
      expect(expJson[0].bullets[0].type).toBe("PARAGRAPH");
      expect(expJson[0].bullets[0].sortOrder).toBe(0);
      expect(expJson[0].bullets[1].type).toBe("BULLET");
      expect(expJson[0].bullets[1].sortOrder).toBe(1);

      // Verify 05_merged.json payload exists and is non-empty
      const mergedJson = JSON.parse(
        await fs.readFile(path.join(runDirPath, "05_merged.json"), "utf-8"),
      );
      expect(mergedJson).toBeDefined();
    });

    it("defensively classifies introductory overview as PARAGRAPH and glyph bullets as BULLET when LLM omits explicit types", async () => {
      (generateJSON as jest.Mock).mockImplementation(
        async (_prompt: string, type: string) => {
          if (type === "cv.parse.basicData") {
            return { firstName: "Wagner", lastName: "Taiatella" };
          }
          if (type === "cv.parse.experiences") {
            return [
              {
                company: "Acme Corp",
                position: "Principal Architect",
                startDate: "2021-01-01",
                current: true,
                bullets: [
                  // Omitted type: narrative description
                  {
                    text: "Acme Corp builds high-throughput real-time telemetry systems for edge computing clusters.",
                  },
                  // Omitted type: bullet with marker
                  {
                    text: "• Directed the migration of legacy monolith to Kubernetes microservices.",
                  },
                  // Omitted type: dash marker
                  {
                    text: "- Cut infrastructure cloud spend by 35% through spot instance automation.",
                  },
                ],
              },
            ];
          }
          if (type === "cv.parse.projects") return [];
          if (type === "cv.parse.education") {
            return { education: [], skills: [] };
          }
          return {};
        },
      );

      const mockFile = {
        name: "test-defensive-bullets.pdf",
        arrayBuffer: async () => Buffer.from("dummy pdf").buffer,
      };
      const mockFormData = {
        get: (key: string) => (key === "file" ? mockFile : null),
      };
      const req = {
        formData: async () => mockFormData,
      } as unknown as Request;

      const response = await parseRouteHandler(req);
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

      const expEvent = events.find((e) => e.phase === "experiences" && e.data);
      expect(expEvent).toBeDefined();
      const bullets = expEvent.data[0].bullets;

      expect(bullets[0].type).toBe("PARAGRAPH");
      expect(bullets[0].sortOrder).toBe(0);

      expect(bullets[1].type).toBe("BULLET");
      expect(bullets[1].sortOrder).toBe(1);

      expect(bullets[2].type).toBe("BULLET");
      expect(bullets[2].sortOrder).toBe(2);
    });
  });
});
