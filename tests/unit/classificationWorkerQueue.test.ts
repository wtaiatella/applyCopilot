/**
 * @jest-environment node
 */

jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemConfig: {
      findUnique: jest.fn(),
    },
    jobListing: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $executeRaw: jest.fn(),
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

jest.mock("@/lib/ai/circuit-breaker", () => {
  const actual = jest.requireActual("@/lib/ai/circuit-breaker");
  return {
    ...actual,
    isProviderBlocked: jest.fn().mockResolvedValue(false),
    withCircuitBreaker: jest.fn((_key, _provider, fn) => fn()),
  };
});

jest.mock("@/lib/ai/aiClient", () => {
  const actual = jest.requireActual("@/lib/ai/aiClient");
  return {
    ...actual,
    resolveAIConfig: jest.fn().mockResolvedValue({ provider: "gemini" }),
  };
});

jest.mock("@/services/jobClassificationService", () => ({
  classifyJobListing: jest.fn().mockResolvedValue({
    jobFacts: {
      mustHave: ["React"],
      niceToHave: [],
      softSkills: [],
      seniority: "senior",
      yearsExperienceMin: 3,
      employmentType: "permanent",
      workMode: "remote",
      isWorldwide: null,
      requiresUsWorkAuth: null,
      providesRelocationVisa: null,
      location: null,
      salaryMin: null,
      salaryMax: null,
      currency: null,
    },
  }),
  canonicalizeJobFacts: jest.fn((facts) => Promise.resolve(facts)),
}));

jest.mock("@/lib/ai/vector-service", () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

import { prisma } from "@/lib/db/prisma";
import { runClassificationWorker } from "@/lib/workers/classification-worker";

const mockFindMany = prisma.jobListing.findMany as jest.Mock;
const mockSystemConfigFindUnique = prisma.systemConfig.findUnique as jest.Mock;

describe("ClassificationWorker Queue Priority & Continuous Drain (APC-24 / APC-39 US-1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSystemConfigFindUnique.mockResolvedValue(null);
  });

  it("fetches pending jobs ordered by recency descending (createdAt: 'desc')", async () => {
    mockFindMany.mockResolvedValue([]);

    await runClassificationWorker();

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isFullDescriptionFetched: true,
          classificationStatus: "PENDING",
        }),
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("prioritizes newly created jobs before older jobs across multiple continuous drain batches", async () => {
    const jobNew = {
      id: "job-new",
      title: "New Job",
      company: "Beta",
      fullDescription: "New job description",
      classificationAttempts: 0,
      createdAt: new Date("2026-10-27T10:00:00Z"),
    };
    const jobOld = {
      id: "job-old",
      title: "Old Job",
      company: "Acme",
      fullDescription: "Old job description",
      classificationAttempts: 0,
      createdAt: new Date("2026-10-01T10:00:00Z"),
    };

    mockFindMany
      .mockResolvedValueOnce([jobNew])
      .mockResolvedValueOnce([jobOld])
      .mockResolvedValueOnce([]);

    const result = await runClassificationWorker();

    expect(mockFindMany).toHaveBeenCalledTimes(3);
    expect(mockFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(mockFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(result.processed).toBe(2);
    expect(result.skippedBlocked).toBe(false);
  });
});
