/**
 * @jest-environment node
 */

import {
  POST as parseRouteHandler,
  normalizeParsedBullets,
} from "@/app/api/profile/parse/route";
import { ProfileMergeService } from "@/lib/merge/profileMergeService";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { generateJSON } from "@/lib/ai/aiClient";
import { DocumentExtractor } from "@/lib/parsing/documentExtract";
import { BulletType } from "@/types/profile";

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

jest.mock("@/lib/logging/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
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

describe("CV Extraction Prompts & Classification (APC-38 / US-1)", () => {
  const profileId = "profile-prompt-test";
  const userId = "user-prompt-test";

  beforeEach(() => {
    jest.clearAllMocks();

    (auth as unknown as jest.Mock).mockResolvedValue({
      user: { id: userId, email: "dev@example.com" },
    });

    (prisma.aIUsageLog.count as jest.Mock).mockResolvedValue(0);
    (prisma.aIUsageLog.create as jest.Mock).mockResolvedValue({});
    (prisma.userProfile.findUnique as jest.Mock).mockResolvedValue({
      id: profileId,
      userId,
    });
  });

  describe("normalizeParsedBullets defensive normalization", () => {
    it("should classify narrative summary text as PARAGRAPH and bullet items as BULLET", () => {
      const input = [
        {
          text: "Acme Corp is a leading fintech platform providing high-volume payment processing.",
          type: "PARAGRAPH",
        },
        {
          text: "• Built microservices in Go and Kafka scaling to 50k req/sec.",
          type: "BULLET",
        },
        {
          text: "- Improved database query latency by 45% using Redis caching.",
          type: "BULLET",
        },
      ];

      const normalized = normalizeParsedBullets(input);

      expect(normalized).toHaveLength(3);
      expect(normalized[0]).toEqual({
        text: "Acme Corp is a leading fintech platform providing high-volume payment processing.",
        type: "PARAGRAPH",
        sortOrder: 0,
      });
      expect(normalized[1]).toEqual({
        text: "• Built microservices in Go and Kafka scaling to 50k req/sec.",
        type: "BULLET",
        sortOrder: 1,
      });
      expect(normalized[2]).toEqual({
        text: "- Improved database query latency by 45% using Redis caching.",
        type: "BULLET",
        sortOrder: 2,
      });
    });

    it("should preserve document sequence order across mixed types", () => {
      const input = [
        { text: "Intro overview", type: "PARAGRAPH" },
        { text: "Key accomplishment 1", type: "BULLET" },
        { text: "Mid-role context overview", type: "PARAGRAPH" },
        { text: "Key accomplishment 2", type: "BULLET" },
      ];

      const normalized = normalizeParsedBullets(input);

      expect(normalized.map((n) => n.sortOrder)).toEqual([0, 1, 2, 3]);
      expect(normalized.map((n) => n.type)).toEqual([
        "PARAGRAPH",
        "BULLET",
        "PARAGRAPH",
        "BULLET",
      ]);
    });

    it("should defensively infer type when LLM omits or provides unrecognized type", () => {
      const input = [
        {
          text: "Global payments team responsible for cross-border settlements.",
          // missing type
        },
        {
          text: "• Designed idempotent retry queues using AWS SQS.",
          // invalid type
          type: "UNKNOWN_TYPE",
        },
        {
          text: "* Delivered multi-tenant billing architecture under budget.",
          type: "",
        },
      ];

      const normalized = normalizeParsedBullets(input);

      expect(normalized[0].type).toBe("PARAGRAPH");
      expect(normalized[1].type).toBe("BULLET");
      expect(normalized[2].type).toBe("BULLET");
    });

    it("should handle bare string items defensively", () => {
      const input = [
        "Led core platform architecture across 4 engineering pods.",
        "• Reduced incident MTTR from 45m to 8m.",
      ];

      const normalized = normalizeParsedBullets(input);

      expect(normalized[0]).toEqual({
        text: "Led core platform architecture across 4 engineering pods.",
        type: "PARAGRAPH",
        sortOrder: 0,
      });
      expect(normalized[1]).toEqual({
        text: "• Reduced incident MTTR from 45m to 8m.",
        type: "BULLET",
        sortOrder: 1,
      });
    });

    it("should handle null and empty elements within bullets array gracefully", () => {
      const input = [
        null,
        undefined,
        { text: "", type: "BULLET" },
        { text: "   ", type: "PARAGRAPH" },
      ];

      const normalized = normalizeParsedBullets(input);

      expect(normalized).toHaveLength(4);
      expect(normalized[0]).toEqual({ text: "", type: "BULLET", sortOrder: 0 });
      expect(normalized[1]).toEqual({ text: "", type: "BULLET", sortOrder: 1 });
      expect(normalized[2]).toEqual({ text: "", type: "BULLET", sortOrder: 2 });
      expect(normalized[3]).toEqual({
        text: "   ",
        type: "PARAGRAPH",
        sortOrder: 3,
      });
    });

    it("should return empty array when input is not an array", () => {
      expect(normalizeParsedBullets(null)).toEqual([]);
      expect(normalizeParsedBullets(undefined)).toEqual([]);
      expect(normalizeParsedBullets("some string")).toEqual([]);
    });
  });

  describe("Route Prompt Schema Contracts", () => {
    const createMockRequest = (filename = "resume.pdf") => {
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

    it("should pass prompt schemas containing 'BULLET or PARAGRAPH' and clear classification instructions for experiences, projects, and education", async () => {
      (DocumentExtractor.extractText as jest.Mock).mockResolvedValue(
        "Candidate Resume Text with experiences, projects, and education.",
      );

      const capturedPrompts: Record<string, string> = {};

      (generateJSON as jest.Mock).mockImplementation(
        async (prompt: string, actionKey: string) => {
          capturedPrompts[actionKey] = prompt;

          if (actionKey === "cv.parse.basicData") {
            return {
              firstName: "Alex",
              lastName: "Rivera",
              title: "Senior Staff Engineer",
              summary: "Experienced backend engineer",
            };
          }
          if (actionKey === "cv.parse.experiences") {
            return [
              {
                company: "CloudScale Inc",
                position: "Staff Architect",
                startDate: "2021-01-01",
                endDate: null,
                current: true,
                bullets: [
                  {
                    text: "CloudScale is an enterprise cloud cost optimization platform.",
                    type: "PARAGRAPH",
                  },
                  {
                    text: "• Led development of real-time telemetry streaming engine.",
                    type: "BULLET",
                  },
                ],
              },
            ];
          }
          if (actionKey === "cv.parse.projects") {
            return [
              {
                name: "Distributed Cache",
                technologies: ["Go", "Raft"],
                bullets: [
                  {
                    text: "High-throughput distributed consensus cache implementation.",
                    type: "PARAGRAPH",
                  },
                  {
                    text: "• Benchmarked at 120k ops/sec with sub-millisecond p99 latency.",
                    type: "BULLET",
                  },
                ],
              },
            ];
          }
          if (actionKey === "cv.parse.education") {
            return {
              education: [
                {
                  institution: "MIT",
                  degree: "B.S. Computer Science",
                  startDate: "2015-09-01",
                  endDate: "2019-06-01",
                  bullets: [
                    {
                      text: "Concentration in Distributed Systems and Computer Architecture.",
                      type: "PARAGRAPH",
                    },
                    {
                      text: "• Magna Cum Laude, Dean's List all semesters.",
                      type: "BULLET",
                    },
                  ],
                },
              ],
              skills: [{ name: "TypeScript", proficiency: "EXPERT" }],
            };
          }
          return [];
        },
      );

      jest
        .spyOn(ProfileMergeService, "mergeBasicData")
        .mockResolvedValue(undefined);
      jest
        .spyOn(ProfileMergeService, "mergeExperiences")
        .mockResolvedValue(undefined);
      jest
        .spyOn(ProfileMergeService, "mergeProjects")
        .mockResolvedValue(undefined);
      jest
        .spyOn(ProfileMergeService, "mergeEducation")
        .mockResolvedValue(undefined);
      jest
        .spyOn(ProfileMergeService, "mergeSkills")
        .mockResolvedValue(undefined);
      jest
        .spyOn(ProfileMergeService, "getReconciledProfile")
        .mockResolvedValue({} as any);

      const req = createMockRequest("Mock Resume Content");
      const res = await parseRouteHandler(req);
      expect(res.status).toBe(200);

      // Drain SSE response
      const reader = res.body!.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      // Check experiences prompt schema and instructions
      const expPrompt = capturedPrompts["cv.parse.experiences"];
      expect(expPrompt).toBeDefined();
      expect(expPrompt).toContain('"type": "BULLET or PARAGRAPH"');
      expect(expPrompt).toContain('"PARAGRAPH"');
      expect(expPrompt).toContain('"BULLET"');
      expect(expPrompt).toContain("introductory overview");
      expect(expPrompt).toContain("reading sequence");

      // Check projects prompt schema and instructions
      const projPrompt = capturedPrompts["cv.parse.projects"];
      expect(projPrompt).toBeDefined();
      expect(projPrompt).toContain('"type": "BULLET or PARAGRAPH"');
      expect(projPrompt).toContain("narrative summary");
      expect(projPrompt).toContain("bullet glyphs");

      // Check education prompt schema and instructions
      const edPrompt = capturedPrompts["cv.parse.education"];
      expect(edPrompt).toBeDefined();
      expect(edPrompt).toContain('"type": "BULLET or PARAGRAPH"');
      expect(edPrompt).toContain("narrative summary");
      expect(edPrompt).toContain("bullet glyphs");

      // Verify that ProfileMergeService received the normalized experiences with correct types and sortOrder
      const mergeExpCall = (ProfileMergeService.mergeExperiences as jest.Mock)
        .mock.calls[0];
      const mergedExps = mergeExpCall[1];
      expect(mergedExps[0].bullets[0]).toEqual({
        text: "CloudScale is an enterprise cloud cost optimization platform.",
        type: "PARAGRAPH",
        sortOrder: 0,
      });
      expect(mergedExps[0].bullets[1]).toEqual({
        text: "• Led development of real-time telemetry streaming engine.",
        type: "BULLET",
        sortOrder: 1,
      });

      // Verify that ProfileMergeService received normalized projects
      const mergeProjCall = (ProfileMergeService.mergeProjects as jest.Mock)
        .mock.calls[0];
      const mergedProjs = mergeProjCall[1];
      expect(mergedProjs[0].bullets[0]).toEqual({
        text: "High-throughput distributed consensus cache implementation.",
        type: "PARAGRAPH",
        sortOrder: 0,
      });
      expect(mergedProjs[0].bullets[1]).toEqual({
        text: "• Benchmarked at 120k ops/sec with sub-millisecond p99 latency.",
        type: "BULLET",
        sortOrder: 1,
      });

      // Verify that ProfileMergeService received normalized education
      const mergeEdCall = (ProfileMergeService.mergeEducation as jest.Mock).mock
        .calls[0];
      const mergedEds = mergeEdCall[1];
      expect(mergedEds[0].bullets[0]).toEqual({
        text: "Concentration in Distributed Systems and Computer Architecture.",
        type: "PARAGRAPH",
        sortOrder: 0,
      });
      expect(mergedEds[0].bullets[1]).toEqual({
        text: "• Magna Cum Laude, Dean's List all semesters.",
        type: "BULLET",
        sortOrder: 1,
      });
    });
  });
});
