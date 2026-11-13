/**
 * @jest-environment node
 */

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    aIUsageLog: {
      count: jest.fn(),
      create: jest.fn(),
    },
    userProfile: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    experienceBullet: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/ai/aiRateLimit", () => {
  const actual = jest.requireActual("@/lib/ai/aiRateLimit");
  return {
    ...actual,
    assertAiRateLimit: jest.fn(),
  };
});

jest.mock("@/lib/ai/aiClient", () => {
  const actual = jest.requireActual("@/lib/ai/aiClient");
  return {
    ...actual,
    generateJSON: jest.fn(),
  };
});

jest.mock("@/lib/db/profileEntityAccess", () => {
  const actual = jest.requireActual("@/lib/db/profileEntityAccess");
  return {
    ...actual,
    loadOwnedEntity: jest.fn(),
  };
});

jest.mock("@/lib/db/cvEntityAccess", () => ({
  loadOwnedCV: jest.fn(),
  buildCVJobContext: jest.fn(),
  findSnapshotEntity: jest.fn(),
}));

jest.mock("@/services/profileBulletAIService", () => ({
  runGenerateBullet: jest.fn(),
  runReviewAll: jest.fn(),
  runReviewBullet: jest.fn(),
  runGenerateSummary: jest.fn(),
}));

jest.mock("@/lib/logging/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("@/lib/merge/profileMergeService", () => ({
  ProfileMergeService: {},
}));

jest.mock("@/lib/parsing/documentExtract", () => ({
  DocumentExtractor: {
    extractText: jest.fn(),
  },
}));

jest.mock("@/lib/parsing/debugIngestionStorage", () => ({
  IngestionDebugSession: jest.fn(),
}));

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import {
  assertAiRateLimit,
  AiRateLimitExceededError,
} from "@/lib/ai/aiRateLimit";
import { AIServiceUnavailableError, generateJSON } from "@/lib/ai/aiClient";
import { loadOwnedEntity } from "@/lib/db/profileEntityAccess";
import {
  loadOwnedCV,
  buildCVJobContext,
  findSnapshotEntity,
} from "@/lib/db/cvEntityAccess";
import {
  runGenerateBullet,
  runReviewAll,
  runReviewBullet,
  runGenerateSummary,
} from "@/services/profileBulletAIService";

import { POST as profileGenerateBulletPOST } from "@/app/api/profile/ai/generate-bullet/route";
import { POST as profileReviewAllPOST } from "@/app/api/profile/ai/review-all/route";
import { POST as profileReviewBulletPOST } from "@/app/api/profile/ai/review-bullet/route";
import { POST as profileAcceptSuggestionPOST } from "@/app/api/profile/ai/accept-suggestion/route";
import { POST as cvGenerateBulletPOST } from "@/app/api/cv/[cvId]/ai/generate-bullet/route";
import { POST as cvReviewAllPOST } from "@/app/api/cv/[cvId]/ai/review-all/route";
import { POST as cvReviewBulletPOST } from "@/app/api/cv/[cvId]/ai/review-bullet/route";
import { POST as cvGenerateSummaryPOST } from "@/app/api/cv/[cvId]/ai/generate-summary/route";
import { POST as profileProjectsSuggestPOST } from "@/app/api/profile/projects/suggest/route";
import { POST as profileSummariesGeneratePOST } from "@/app/api/profile/summaries/generate/route";
import { POST as profileSkillsSuggestPOST } from "@/app/api/profile/skills/suggest/route";
import { POST as profileParsePOST } from "@/app/api/profile/parse/route";

const mockAuth = auth as jest.Mock;
const mockAssertAiRateLimit = assertAiRateLimit as jest.Mock;
const mockGenerateJSON = generateJSON as jest.Mock;
const mockLoadOwnedEntity = loadOwnedEntity as jest.Mock;
const mockLoadOwnedCV = loadOwnedCV as jest.Mock;
const mockBuildCVJobContext = buildCVJobContext as jest.Mock;
const mockFindSnapshotEntity = findSnapshotEntity as jest.Mock;
const mockRunGenerateBullet = runGenerateBullet as jest.Mock;
const mockRunReviewAll = runReviewAll as jest.Mock;
const mockRunReviewBullet = runReviewBullet as jest.Mock;
const mockRunGenerateSummary = runGenerateSummary as jest.Mock;
const mockUsageCount = prisma.aIUsageLog.count as jest.Mock;
const mockProfileFindUnique = prisma.userProfile.findUnique as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;
const mockExperienceBulletCreate = prisma.experienceBullet.create as jest.Mock;

const VALID_CUID = "ck12345678901234567890123";
const SANITIZED_503_MESSAGE =
  "AI service temporarily unavailable. Please try again later.";
const FORBIDDEN_LEAK_TOKENS = [
  "127.0.0.1:4000",
  "LITELLM_API_KEY",
  "sk-litellm",
  "Bearer",
];

function makeJsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function assertSanitized503(res: Response, rawBody: string, json: { error?: string }) {
  expect(res.status).toBe(503);
  expect(json.error).toBe(SANITIZED_503_MESSAGE);
  for (const token of FORBIDDEN_LEAK_TOKENS) {
    expect(rawBody).not.toContain(token);
  }
}

describe("Interactive AI Routes — 503 Sanitization & 429 Precedence (APC-41)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LITELLM_BASE_URL = "http://127.0.0.1:4000/v1";
    process.env.LITELLM_API_KEY = "sk-litellm-secret-test-key";

    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockAssertAiRateLimit.mockResolvedValue(undefined);
    mockUsageCount.mockResolvedValue(0);

    mockLoadOwnedEntity.mockResolvedValue({
      id: VALID_CUID,
      freeFormContext: ["Built distributed APIs"],
      bullets: [{ id: VALID_CUID, text: "Led API migration", isArchived: false }],
    });

    mockLoadOwnedCV.mockResolvedValue({
      id: VALID_CUID,
      userId: "user-1",
      snapshotData: {
        experiences: [
          {
            id: "exp-1",
            company: "Acme",
            position: "Engineer",
            bullets: [{ id: "b-1", text: "Built services" }],
          },
        ],
        summaries: [],
      },
    });
    mockBuildCVJobContext.mockResolvedValue({
      jobTitle: "Senior Engineer",
      company: "Beta",
      jobDescription: "TypeScript and Node.js",
    });
    mockFindSnapshotEntity.mockReturnValue({
      id: "exp-1",
      freeFormContext: ["Built distributed APIs"],
      bullets: [{ id: "b-1", text: "Built services" }],
    });

    mockProfileFindUnique.mockResolvedValue({
      id: "profile-1",
      userId: "user-1",
      experiences: [
        {
          position: "Software Engineer",
          company: "Acme",
          startDate: new Date("2022-01-01"),
          endDate: null,
          current: true,
          bullets: [{ text: "Built APIs" }],
        },
      ],
      projects: [],
      education: [],
      skills: [],
    });
  });

  describe("Profile AI routes (assertAiRateLimit + AIServiceUnavailableError)", () => {
    it("POST /api/profile/ai/generate-bullet returns 429 on rate limit and 503 sanitized on gateway outage", async () => {
      mockAssertAiRateLimit.mockRejectedValueOnce(new AiRateLimitExceededError("profile_generate_bullet", 50));
      const res429 = await profileGenerateBulletPOST(
        makeJsonRequest("http://localhost/api/profile/ai/generate-bullet", {
          entityType: "experience",
          entityId: VALID_CUID,
        }),
      );
      expect(res429.status).toBe(429);
      expect(mockRunGenerateBullet).not.toHaveBeenCalled();

      mockRunGenerateBullet.mockRejectedValueOnce(new AIServiceUnavailableError());
      const res503 = await profileGenerateBulletPOST(
        makeJsonRequest("http://localhost/api/profile/ai/generate-bullet", {
          entityType: "experience",
          entityId: VALID_CUID,
        }),
      );
      const raw503 = await res503.text();
      assertSanitized503(res503, raw503, JSON.parse(raw503));
    });

    it("POST /api/profile/ai/review-all returns 429 on rate limit and 503 sanitized on gateway outage", async () => {
      mockAssertAiRateLimit.mockRejectedValueOnce(new AiRateLimitExceededError("profile_review_all", 20));
      const res429 = await profileReviewAllPOST(
        makeJsonRequest("http://localhost/api/profile/ai/review-all", {
          entityType: "experience",
          entityId: VALID_CUID,
        }),
      );
      expect(res429.status).toBe(429);
      expect(mockRunReviewAll).not.toHaveBeenCalled();

      mockRunReviewAll.mockRejectedValueOnce(new AIServiceUnavailableError());
      const res503 = await profileReviewAllPOST(
        makeJsonRequest("http://localhost/api/profile/ai/review-all", {
          entityType: "experience",
          entityId: VALID_CUID,
        }),
      );
      const raw503 = await res503.text();
      assertSanitized503(res503, raw503, JSON.parse(raw503));
    });

    it("POST /api/profile/ai/review-bullet returns 429 on rate limit and 503 sanitized on gateway outage", async () => {
      mockAssertAiRateLimit.mockRejectedValueOnce(new AiRateLimitExceededError("profile_review_bullet", 50));
      const res429 = await profileReviewBulletPOST(
        makeJsonRequest("http://localhost/api/profile/ai/review-bullet", {
          entityType: "experience",
          entityId: VALID_CUID,
          bulletId: VALID_CUID,
        }),
      );
      expect(res429.status).toBe(429);
      expect(mockRunReviewBullet).not.toHaveBeenCalled();

      mockRunReviewBullet.mockRejectedValueOnce(new AIServiceUnavailableError());
      const res503 = await profileReviewBulletPOST(
        makeJsonRequest("http://localhost/api/profile/ai/review-bullet", {
          entityType: "experience",
          entityId: VALID_CUID,
          bulletId: VALID_CUID,
        }),
      );
      const raw503 = await res503.text();
      assertSanitized503(res503, raw503, JSON.parse(raw503));
    });

    it("POST /api/profile/ai/accept-suggestion returns 429 on rate limit and 503 sanitized on AIServiceUnavailableError", async () => {
      mockAssertAiRateLimit.mockRejectedValueOnce(new AiRateLimitExceededError("profile_accept_suggestion", 50));
      const res429 = await profileAcceptSuggestionPOST(
        makeJsonRequest("http://localhost/api/profile/ai/accept-suggestion", {
          action: "generate",
          entityType: "experience",
          entityId: VALID_CUID,
          text: "Improved bullet",
        }),
      );
      expect(res429.status).toBe(429);
      expect(mockTransaction).not.toHaveBeenCalled();

      mockExperienceBulletCreate.mockRejectedValueOnce(new AIServiceUnavailableError());
      const res503 = await profileAcceptSuggestionPOST(
        makeJsonRequest("http://localhost/api/profile/ai/accept-suggestion", {
          action: "generate",
          entityType: "experience",
          entityId: VALID_CUID,
          text: "Improved bullet",
        }),
      );
      const raw503 = await res503.text();
      assertSanitized503(res503, raw503, JSON.parse(raw503));
    });
  });

  describe("CV AI routes (assertAiRateLimit + AIServiceUnavailableError)", () => {
    const cvParams = { params: Promise.resolve({ cvId: VALID_CUID }) };

    it("POST /api/cv/[cvId]/ai/generate-bullet returns 429 on rate limit and 503 sanitized on gateway outage", async () => {
      mockAssertAiRateLimit.mockRejectedValueOnce(new AiRateLimitExceededError("cv_generate_bullet", 50));
      const res429 = await cvGenerateBulletPOST(
        makeJsonRequest("http://localhost/api/cv/1/ai/generate-bullet", {
          entityType: "experience",
          entityId: "exp-1",
        }),
        cvParams,
      );
      expect(res429.status).toBe(429);
      expect(mockRunGenerateBullet).not.toHaveBeenCalled();

      mockRunGenerateBullet.mockRejectedValueOnce(new AIServiceUnavailableError());
      const res503 = await cvGenerateBulletPOST(
        makeJsonRequest("http://localhost/api/cv/1/ai/generate-bullet", {
          entityType: "experience",
          entityId: "exp-1",
        }),
        cvParams,
      );
      const raw503 = await res503.text();
      assertSanitized503(res503, raw503, JSON.parse(raw503));
    });

    it("POST /api/cv/[cvId]/ai/review-all returns 429 on rate limit and 503 sanitized on gateway outage", async () => {
      mockAssertAiRateLimit.mockRejectedValueOnce(new AiRateLimitExceededError("cv_review_all", 20));
      const res429 = await cvReviewAllPOST(
        makeJsonRequest("http://localhost/api/cv/1/ai/review-all", {
          entityType: "experience",
          entityId: "exp-1",
        }),
        cvParams,
      );
      expect(res429.status).toBe(429);
      expect(mockRunReviewAll).not.toHaveBeenCalled();

      mockRunReviewAll.mockRejectedValueOnce(new AIServiceUnavailableError());
      const res503 = await cvReviewAllPOST(
        makeJsonRequest("http://localhost/api/cv/1/ai/review-all", {
          entityType: "experience",
          entityId: "exp-1",
        }),
        cvParams,
      );
      const raw503 = await res503.text();
      assertSanitized503(res503, raw503, JSON.parse(raw503));
    });

    it("POST /api/cv/[cvId]/ai/review-bullet returns 429 on rate limit and 503 sanitized on gateway outage", async () => {
      mockAssertAiRateLimit.mockRejectedValueOnce(new AiRateLimitExceededError("cv_review_bullet", 50));
      const res429 = await cvReviewBulletPOST(
        makeJsonRequest("http://localhost/api/cv/1/ai/review-bullet", {
          entityType: "experience",
          entityId: "exp-1",
          bulletId: "b-1",
        }),
        cvParams,
      );
      expect(res429.status).toBe(429);
      expect(mockRunReviewBullet).not.toHaveBeenCalled();

      mockRunReviewBullet.mockRejectedValueOnce(new AIServiceUnavailableError());
      const res503 = await cvReviewBulletPOST(
        makeJsonRequest("http://localhost/api/cv/1/ai/review-bullet", {
          entityType: "experience",
          entityId: "exp-1",
          bulletId: "b-1",
        }),
        cvParams,
      );
      const raw503 = await res503.text();
      assertSanitized503(res503, raw503, JSON.parse(raw503));
    });

    it("POST /api/cv/[cvId]/ai/generate-summary returns 429 on rate limit and 503 sanitized on gateway outage", async () => {
      mockAssertAiRateLimit.mockRejectedValueOnce(new AiRateLimitExceededError("cv_generate_summary", 20));
      const res429 = await cvGenerateSummaryPOST(
        makeJsonRequest("http://localhost/api/cv/1/ai/generate-summary", {}),
        cvParams,
      );
      expect(res429.status).toBe(429);
      expect(mockRunGenerateSummary).not.toHaveBeenCalled();

      mockRunGenerateSummary.mockRejectedValueOnce(new AIServiceUnavailableError());
      const res503 = await cvGenerateSummaryPOST(
        makeJsonRequest("http://localhost/api/cv/1/ai/generate-summary", {}),
        cvParams,
      );
      const raw503 = await res503.text();
      assertSanitized503(res503, raw503, JSON.parse(raw503));
    });
  });

  describe("Profile generateJSON routes (429 precedence + 503 sanitization)", () => {
    it("POST /api/profile/projects/suggest returns 429 before generateJSON and 503 sanitized on AIServiceUnavailableError", async () => {
      mockUsageCount.mockResolvedValueOnce(10);
      const res429 = await profileProjectsSuggestPOST(
        makeJsonRequest("http://localhost/api/profile/projects/suggest", {}),
      );
      expect(res429.status).toBe(429);
      expect(mockGenerateJSON).not.toHaveBeenCalled();

      mockUsageCount.mockResolvedValueOnce(0);
      mockGenerateJSON.mockRejectedValueOnce(new AIServiceUnavailableError());
      const res503 = await profileProjectsSuggestPOST(
        makeJsonRequest("http://localhost/api/profile/projects/suggest", {}),
      );
      const raw503 = await res503.text();
      assertSanitized503(res503, raw503, JSON.parse(raw503));
    });

    it("POST /api/profile/summaries/generate returns 429 before generateJSON and 503 sanitized on AIServiceUnavailableError", async () => {
      mockUsageCount.mockResolvedValueOnce(10);
      const res429 = await profileSummariesGeneratePOST(
        makeJsonRequest("http://localhost/api/profile/summaries/generate", {
          tone: "professional",
        }),
      );
      expect(res429.status).toBe(429);
      expect(mockGenerateJSON).not.toHaveBeenCalled();

      mockUsageCount.mockResolvedValueOnce(0);
      mockGenerateJSON.mockRejectedValueOnce(new AIServiceUnavailableError());
      const res503 = await profileSummariesGeneratePOST(
        makeJsonRequest("http://localhost/api/profile/summaries/generate", {
          tone: "professional",
        }),
      );
      const raw503 = await res503.text();
      assertSanitized503(res503, raw503, JSON.parse(raw503));
    });

    it("POST /api/profile/skills/suggest returns 429 before generateJSON and 503 sanitized on AIServiceUnavailableError", async () => {
      mockUsageCount.mockResolvedValueOnce(10);
      const res429 = await profileSkillsSuggestPOST(
        makeJsonRequest("http://localhost/api/profile/skills/suggest", {}),
      );
      expect(res429.status).toBe(429);
      expect(mockGenerateJSON).not.toHaveBeenCalled();

      mockUsageCount.mockResolvedValueOnce(0);
      mockGenerateJSON.mockRejectedValueOnce(new AIServiceUnavailableError());
      const res503 = await profileSkillsSuggestPOST(
        makeJsonRequest("http://localhost/api/profile/skills/suggest", {}),
      );
      const raw503 = await res503.text();
      assertSanitized503(res503, raw503, JSON.parse(raw503));
    });

    it("POST /api/profile/parse returns 429 on daily quota limit and 503 sanitized if AIServiceUnavailableError is thrown pre-stream", async () => {
      mockUsageCount.mockResolvedValueOnce(50);
      const res429 = await profileParsePOST(
        makeJsonRequest("http://localhost/api/profile/parse", {}),
      );
      expect(res429.status).toBe(429);
      expect(mockGenerateJSON).not.toHaveBeenCalled();

      mockUsageCount.mockRejectedValueOnce(new AIServiceUnavailableError());
      const res503 = await profileParsePOST(
        makeJsonRequest("http://localhost/api/profile/parse", {}),
      );
      const raw503 = await res503.text();
      assertSanitized503(res503, raw503, JSON.parse(raw503));
    });
  });
});
