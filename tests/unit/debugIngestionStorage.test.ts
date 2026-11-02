import fs from "fs/promises";
import path from "path";
import {
  IngestionDebugSession,
  sanitizeFilename,
  getRepoRoot,
} from "@/lib/parsing/debugIngestionStorage";
import { logger } from "@/lib/logging/logger";
import { POST as parseRouteHandler } from "@/app/api/profile/parse/route";
import { ProfileMergeService } from "@/lib/merge/profileMergeService";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { generateJSON } from "@/lib/ai/aiClient";
import {
  DocumentExtractor,
  saveRawUploadForDebug,
} from "@/lib/parsing/documentExtract";

jest.mock("fs/promises", () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));

jest.mock("@/lib/logging/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

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
  saveRawUploadForDebug: jest.fn(),
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
    $transaction: jest.fn((cb) => cb(prisma)),
  },
}));

describe("IngestionDebugStorage & IngestionDebugSession (APC-37 / US2 & US3)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("sanitizeFilename", () => {
    it("should strip path traversal sequences and return base name", () => {
      expect(sanitizeFilename("../../malicious.pdf")).toBe("malicious.pdf");
      expect(sanitizeFilename("../../../evil.pdf")).toBe("evil.pdf");
      expect(sanitizeFilename("..\\..\\windows_traversal.docx")).toBe(
        "windows_traversal.docx",
      );
    });

    it("should sanitize whitespace and special characters to underscores", () => {
      expect(sanitizeFilename("Wagner Taiatella - Resume (1).pdf")).toBe(
        "Wagner_Taiatella_-_Resume__1_.pdf",
      );
      expect(sanitizeFilename("résumé & cv #2026!.docx")).toBe(
        "r_sum____cv__2026_.docx",
      );
    });

    it("should truncate long filenames to 80 characters", () => {
      const longName = "a".repeat(120) + ".pdf";
      const sanitized = sanitizeFilename(longName);
      expect(sanitized.length).toBe(80);
      expect(sanitized).toBe("a".repeat(80));
    });

    it("should return fallback 'upload' if given empty or undefined", () => {
      expect(sanitizeFilename("")).toBe("upload");
      expect(sanitizeFilename(null as unknown as string)).toBe("upload");
    });
  });

  describe("getRepoRoot", () => {
    it("should respect REPO_ROOT environment variable if set", () => {
      process.env.REPO_ROOT = "/custom/repo/root";
      expect(getRepoRoot()).toBe("/custom/repo/root");
    });

    it("should return cwd or parent if ending in frontend", () => {
      delete process.env.REPO_ROOT;
      const root = getRepoRoot();
      expect(typeof root).toBe("string");
      expect(root.length).toBeGreaterThan(0);
    });
  });

  describe("Session Initialization & Gating", () => {
    it("should be active and set runDir when LOG_LEVEL=debug", () => {
      process.env.LOG_LEVEL = "debug";
      const session = new IngestionDebugSession("resume.pdf");

      expect(session.isDebug).toBe(true);
      expect(session.runDir).toBeDefined();
      expect(session.runDir).toContain(path.join("debug", "ingestion"));
      expect(session.runDir).toContain("resume.pdf");
    });

    it("should support case-insensitive LOG_LEVEL=DEBUG", () => {
      process.env.LOG_LEVEL = "DEBUG";
      const session = IngestionDebugSession.createSession("resume.pdf");

      expect(session.isDebug).toBe(true);
      expect(session.runDir).not.toBeNull();
    });

    it("should be inactive and have null runDir when LOG_LEVEL is info or unset", () => {
      process.env.LOG_LEVEL = "info";
      const session = new IngestionDebugSession("resume.pdf");

      expect(session.isDebug).toBe(false);
      expect(session.runDir).toBeNull();

      delete process.env.LOG_LEVEL;
      const sessionUnset = new IngestionDebugSession("resume.pdf");
      expect(sessionUnset.isDebug).toBe(false);
      expect(sessionUnset.runDir).toBeNull();
    });

    it("should not perform any filesystem operations when debug is disabled", async () => {
      process.env.LOG_LEVEL = "info";
      const session = new IngestionDebugSession("resume.pdf");

      await session.saveOriginal("resume.pdf", Buffer.from("test"));
      await session.saveTranscription("raw text");
      await session.saveStagePayload("01_basic", { name: "test" });

      expect(fs.mkdir).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe("Artifact Persistence", () => {
    beforeEach(() => {
      process.env.LOG_LEVEL = "debug";
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    });

    it("should lazily create directory on first save operation and log initialization", async () => {
      const session = new IngestionDebugSession("resume.pdf");
      expect(fs.mkdir).not.toHaveBeenCalled();

      await session.saveTranscription("sample transcription");

      expect(fs.mkdir).toHaveBeenCalledTimes(1);
      expect(fs.mkdir).toHaveBeenCalledWith(session.runDir, {
        recursive: true,
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          "[IngestionDebugStorage] Initialized run directory",
        ),
      );

      // Subsequent saves should not re-invoke mkdir
      await session.saveStagePayload("01_basic", { ok: true });
      expect(fs.mkdir).toHaveBeenCalledTimes(1);
    });

    it("should save original upload binary with sanitized filename", async () => {
      const session = new IngestionDebugSession("../../evil-cv.pdf");
      const buffer = Buffer.from("pdf-binary-data");

      await session.saveOriginal("../../evil-cv.pdf", buffer);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(session.runDir!, "evil-cv.pdf"),
        buffer,
      );
    });

    it("should save transcription text in utf-8", async () => {
      const session = new IngestionDebugSession("resume.pdf");
      await session.saveTranscription("Extracted candidate CV text...");

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(session.runDir!, "transcription.txt"),
        "Extracted candidate CV text...",
        "utf-8",
      );
    });

    it("should save stage payloads formatted with 2-space indented JSON", async () => {
      const session = new IngestionDebugSession("resume.pdf");
      const testData = { candidate: "Alice", role: "Engineer" };

      await session.saveStagePayload("01_basic", testData);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(session.runDir!, "01_basic.json"),
        JSON.stringify(testData, null, 2),
        "utf-8",
      );
    });

    it("should write all 5 stages cleanly when called in sequence", async () => {
      const session = new IngestionDebugSession("resume.pdf");

      await session.saveStagePayload("01_basic", { firstName: "Wagner" });
      await session.saveStagePayload("02_experiences", [{ company: "Acme" }]);
      await session.saveStagePayload("03_projects", [{ name: "Project X" }]);
      await session.saveStagePayload("04_education_skills", {
        education: [],
        skills: [],
      });
      await session.saveStagePayload("05_merged", { id: "profile-1" });

      expect(fs.writeFile).toHaveBeenCalledTimes(5);
      const writtenFiles = (fs.writeFile as jest.Mock).mock.calls.map((call) =>
        path.basename(call[0]),
      );
      expect(writtenFiles).toEqual([
        "01_basic.json",
        "02_experiences.json",
        "03_projects.json",
        "04_education_skills.json",
        "05_merged.json",
      ]);
    });
  });

  describe("Error Suppression & Non-Blocking Resilience (AC.6 / US3)", () => {
    beforeEach(() => {
      process.env.LOG_LEVEL = "debug";
    });

    it("should safely swallow fs.mkdir failure (e.g. EACCES), log a warning, and not throw", async () => {
      (fs.mkdir as jest.Mock).mockRejectedValue(
        new Error("EACCES: permission denied, mkdir '/debug/ingestion'"),
      );

      const session = new IngestionDebugSession("resume.pdf");

      await expect(
        session.saveOriginal("resume.pdf", Buffer.from("data")),
      ).resolves.not.toThrow();

      expect(logger.warn).toHaveBeenCalledWith(
        "[IngestionDebugStorage] Failed to create debug directory",
        expect.objectContaining({ error: expect.any(Error) }),
      );
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it("should safely swallow fs.writeFile failure (e.g. ENOSPC), log a warning, and not throw", async () => {
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockRejectedValue(
        new Error("ENOSPC: no space left on device"),
      );

      const session = new IngestionDebugSession("resume.pdf");

      await expect(
        session.saveTranscription("some text"),
      ).resolves.not.toThrow();

      expect(logger.warn).toHaveBeenCalledWith(
        "[IngestionDebugStorage] Failed to save transcription",
        expect.objectContaining({ error: expect.any(Error) }),
      );

      await expect(
        session.saveStagePayload("01_basic", { foo: "bar" }),
      ).resolves.not.toThrow();

      expect(logger.warn).toHaveBeenCalledWith(
        "[IngestionDebugStorage] Failed to save stage payload: 01_basic",
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });

    it("should safely handle fs.writeFile throwing non-Error object without crashing", async () => {
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockRejectedValue("Disk error string");

      const session = new IngestionDebugSession("resume.pdf");

      await expect(
        session.saveOriginal("resume.pdf", Buffer.from("abc")),
      ).resolves.not.toThrow();

      expect(logger.warn).toHaveBeenCalledWith(
        "[IngestionDebugStorage] Failed to save original upload",
        expect.objectContaining({ error: "Disk error string" }),
      );
    });
  });

  describe("CV Ingestion Route Integration (POST /api/profile/parse)", () => {
    const mockUserId = "user-debug-test";
    const mockProfileId = "profile-debug-test";

    const createMockRequest = (filename = "Wagner_Resume.pdf") => {
      const mockFile = {
        name: filename,
        arrayBuffer: async () => Buffer.from("fake-binary-content").buffer,
      };
      const mockFormData = {
        get: (key: string) => (key === "file" ? mockFile : null),
      };
      return {
        formData: async () => mockFormData,
      } as unknown as Request;
    };

    beforeEach(() => {
      (auth as unknown as jest.Mock).mockResolvedValue({
        user: { id: mockUserId, email: "candidate@example.com" },
      });
      (prisma.aIUsageLog.count as jest.Mock).mockResolvedValue(0);
      (prisma.aIUsageLog.create as jest.Mock).mockResolvedValue({
        id: "log-1",
      });
      (prisma.userProfile.findUnique as jest.Mock).mockResolvedValue({
        id: mockProfileId,
        userId: mockUserId,
      });
      (prisma.profileSummary.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.experience.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.experience.create as jest.Mock).mockResolvedValue({
        id: "exp-1",
      });
      (prisma.experienceBullet.create as jest.Mock).mockResolvedValue({
        id: "eb-1",
      });
      (prisma.project.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.project.create as jest.Mock).mockResolvedValue({ id: "proj-1" });
      (prisma.projectBullet.create as jest.Mock).mockResolvedValue({
        id: "pb-1",
      });
      (prisma.education.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.education.create as jest.Mock).mockResolvedValue({ id: "edu-1" });
      (prisma.educationBullet.create as jest.Mock).mockResolvedValue({
        id: "edub-1",
      });
      (prisma.skill.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.skill.create as jest.Mock).mockResolvedValue({ id: "sk-1" });
      (prisma.cVBullet.count as jest.Mock).mockResolvedValue(0);

      (DocumentExtractor.extractText as jest.Mock).mockResolvedValue(
        "Candidate CV Extracted Plain Text Content",
      );

      (generateJSON as jest.Mock).mockImplementation(
        async (_prompt, action) => {
          if (action === "cv.parse.basicData") {
            return {
              firstName: "Wagner",
              lastName: "Taiatella",
              email: "wagner@example.com",
              title: "Staff Engineer",
              summary: "Experienced software engineer",
            };
          }
          if (action === "cv.parse.experiences") {
            return [
              {
                company: "Google",
                position: "Staff Software Engineer",
                startDate: "2020-01-01",
                current: true,
                bullets: [
                  { text: "Led engineering initiative", type: "PARAGRAPH" },
                ],
              },
            ];
          }
          if (action === "cv.parse.projects") {
            return [
              {
                name: "Antigravity",
                startDate: "2023-01-01",
                technologies: ["TypeScript", "Next.js"],
                bullets: [{ text: "Built agent framework", type: "PARAGRAPH" }],
              },
            ];
          }
          if (action === "cv.parse.education") {
            return {
              education: [
                {
                  institution: "MIT",
                  degree: "BS Computer Science",
                  startDate: "2010-09-01",
                  endDate: "2014-06-01",
                  current: false,
                  hideEndDate: false,
                  bullets: [],
                },
              ],
              skills: [
                {
                  name: "TypeScript",
                  proficiency: "EXPERT",
                  yearsExperience: 8,
                },
              ],
            };
          }
          return {};
        },
      );

      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    });

    it("should generate run folder with all 7 expected artifacts and serialize reconciled profile in debug mode", async () => {
      process.env.LOG_LEVEL = "debug";

      const mockReconciledProfile = {
        id: mockProfileId,
        userId: mockUserId,
        firstName: "Wagner",
        lastName: "Taiatella",
        experiences: [
          { company: "Google", position: "Staff Software Engineer" },
        ],
        projects: [{ name: "Antigravity" }],
        education: [{ institution: "MIT" }],
        skills: [{ name: "TypeScript", proficiency: "EXPERT" }],
        summaries: [
          { title: "Staff Engineer", content: "Experienced software engineer" },
        ],
      };

      jest
        .spyOn(ProfileMergeService, "getReconciledProfile")
        .mockResolvedValueOnce(mockReconciledProfile as any);

      const req = createMockRequest("Wagner_Resume.pdf");
      const res = await parseRouteHandler(req);

      expect(res.status).toBe(200);

      // Read stream to completion
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let streamOutput = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        streamOutput += decoder.decode(value);
      }
      expect(streamOutput).toContain('"phase":"education"');

      // Assert directory created
      expect(fs.mkdir).toHaveBeenCalledTimes(1);

      // Assert 7 artifacts written
      expect(fs.writeFile).toHaveBeenCalledTimes(7);
      const writtenPaths = (fs.writeFile as jest.Mock).mock.calls.map((call) =>
        path.basename(call[0]),
      );
      expect(writtenPaths).toEqual([
        "Wagner_Resume.pdf",
        "transcription.txt",
        "01_basic.json",
        "02_experiences.json",
        "03_projects.json",
        "04_education_skills.json",
        "05_merged.json",
      ]);

      // Assert 05_merged.json contains the serialized reconciled profile object from ProfileMergeService
      const mergedCall = (fs.writeFile as jest.Mock).mock.calls.find(
        (call) => path.basename(call[0]) === "05_merged.json",
      );
      expect(mergedCall).toBeDefined();
      const mergedJson = JSON.parse(mergedCall[1]);
      expect(mergedJson).toEqual(mockReconciledProfile);
    });

    it("should generate zero filesystem artifacts when LOG_LEVEL is info (AC.5)", async () => {
      process.env.LOG_LEVEL = "info";

      const req = createMockRequest("Normal_Resume.pdf");
      const res = await parseRouteHandler(req);

      expect(res.status).toBe(200);

      const reader = res.body!.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(fs.mkdir).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });
});
