/**
 * @jest-environment node
 */

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    $executeRaw: jest.fn(),
    cV: {
      findUnique: jest.fn(),
    },
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

jest.mock("@/services/profileSyncService", () => ({
  fetchUserProfileData: jest.fn(),
  isProfileEmpty: jest.fn(),
  consolidateProfileToText: jest.fn(),
  extractProfileFacts: jest.fn(),
  canonicalizeProfileFacts: jest.fn(),
}));

jest.mock("@/lib/ai/vector-service", () => ({
  generateEmbedding: jest.fn(),
}));

jest.mock("@/services/cvMatchScoreService", () => ({
  calculateCVMatchScore: jest.fn(),
}));

jest.mock("@/lib/ai/aiRateLimit", () => {
  const actual = jest.requireActual("@/lib/ai/aiRateLimit");
  return {
    ...actual,
    assertAiRateLimit: jest.fn().mockResolvedValue(undefined),
  };
});

import { POST as profileSyncPOST } from "@/app/api/profile/sync/route";
import { POST as matchScorePOST } from "@/app/api/cv/[cvId]/match-score/route";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import {
  fetchUserProfileData,
  isProfileEmpty,
  consolidateProfileToText,
  extractProfileFacts,
  canonicalizeProfileFacts,
} from "@/services/profileSyncService";
import { generateEmbedding } from "@/lib/ai/vector-service";
import { calculateCVMatchScore } from "@/services/cvMatchScoreService";
import { AIServiceUnavailableError } from "@/lib/ai/aiClient";

const mockAuth = auth as jest.Mock;
const mockExecuteRaw = prisma.$executeRaw as unknown as jest.Mock;
const mockCvFindUnique = prisma.cV.findUnique as jest.Mock;
const mockFetchUserProfileData = fetchUserProfileData as jest.Mock;
const mockIsProfileEmpty = isProfileEmpty as jest.Mock;
const mockConsolidateProfileToText = consolidateProfileToText as jest.Mock;
const mockExtractProfileFacts = extractProfileFacts as jest.Mock;
const mockCanonicalizeProfileFacts = canonicalizeProfileFacts as jest.Mock;
const mockGenerateEmbedding = generateEmbedding as jest.Mock;
const mockCalculateCVMatchScore = calculateCVMatchScore as jest.Mock;

const VALID_PROFILE_FACTS = {
  skills: ["TypeScript", "React"],
  softSkills: ["Communication"],
  seniority: "senior",
  totalYearsExperience: 5,
  domains: ["FinTech"],
};

describe("Interactive AI 503 unavailability handling (APC-45)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockFetchUserProfileData.mockResolvedValue({ id: "profile-1", userId: "user-1" });
    mockIsProfileEmpty.mockReturnValue(false);
    mockConsolidateProfileToText.mockReturnValue("TypeScript React 5 years");
    mockExtractProfileFacts.mockResolvedValue(VALID_PROFILE_FACTS);
    mockCanonicalizeProfileFacts.mockResolvedValue(VALID_PROFILE_FACTS);
    mockCvFindUnique.mockResolvedValue({
      id: "cv-1",
      jobListingId: "job-1",
      snapshotData: { skills: ["TypeScript"] },
      profile: { userId: "user-1" },
    });
  });

  it("POST /api/profile/sync returns sanitized HTTP 503 and persists no vector when canonicalizeProfileFacts throws AIServiceUnavailableError", async () => {
    mockCanonicalizeProfileFacts.mockRejectedValueOnce(
      new AIServiceUnavailableError(),
    );

    const response = await profileSyncPOST(
      new Request("http://localhost:3000/api/profile/sync", { method: "POST" }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(503);
    expect(body.error).toBe(
      "AI service temporarily unavailable. Please try again later.",
    );
    expect(body.error).not.toMatch(/http|localhost|127\.0\.0\.1|sk-|stack/i);
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it("POST /api/profile/sync returns sanitized HTTP 503 and persists no partial vector when generateEmbedding throws AIServiceUnavailableError", async () => {
    mockGenerateEmbedding.mockRejectedValueOnce(
      new AIServiceUnavailableError(),
    );

    const response = await profileSyncPOST(
      new Request("http://localhost:3000/api/profile/sync", { method: "POST" }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(503);
    expect(body.error).toBe(
      "AI service temporarily unavailable. Please try again later.",
    );
    expect(body.error).not.toMatch(/http|localhost|127\.0\.0\.1|sk-|stack/i);
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it("POST /api/cv/[cvId]/match-score returns sanitized HTTP 503 and persists no partial vector when calculateCVMatchScore throws AIServiceUnavailableError", async () => {
    mockCalculateCVMatchScore.mockRejectedValueOnce(
      new AIServiceUnavailableError(),
    );

    const response = await matchScorePOST(
      new Request("http://localhost:3000/api/cv/cv-1/match-score", {
        method: "POST",
      }),
      { params: Promise.resolve({ cvId: "cv-1" }) },
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(503);
    expect(body.error).toBe(
      "AI service temporarily unavailable. Please try again later.",
    );
    expect(body.error).not.toMatch(/http|localhost|127\.0\.0\.1|sk-|stack/i);
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });
});
