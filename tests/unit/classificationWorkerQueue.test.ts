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

jest.mock("@/lib/ai/circuit-breaker", () => ({
  isProviderBlocked: jest.fn().mockResolvedValue(false),
  withCircuitBreaker: jest.fn((_key, _provider, fn) => fn()),
}));

jest.mock("@/lib/ai/aiClient", () => ({
  resolveAIConfig: jest.fn().mockResolvedValue({ provider: "gemini" }),
}));

jest.mock("@/services/jobClassificationService", () => ({
  classifyJobListing: jest.fn(),
  canonicalizeJobFacts: jest.fn(),
}));

jest.mock("@/lib/ai/vector-service", () => ({
  generateEmbedding: jest.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { runClassificationWorker } from "@/lib/workers/classification-worker";

const mockFindMany = prisma.jobListing.findMany as jest.Mock;
const mockSystemConfigFindUnique = prisma.systemConfig.findUnique as jest.Mock;

describe("ClassificationWorker Queue Priority (APC-24 / US-1)", () => {
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

  it("prioritizes newly created jobs before older jobs", async () => {
    const jobOld = {
      id: "job-old",
      title: "Old Job",
      company: "Acme",
      fullDescription: "Old job description",
      classificationAttempts: 0,
      createdAt: new Date("2026-10-01T10:00:00Z"),
    };
    const jobNew = {
      id: "job-new",
      title: "New Job",
      company: "Beta",
      fullDescription: "New job description",
      classificationAttempts: 0,
      createdAt: new Date("2026-10-27T10:00:00Z"),
    };

    // When Prisma returns them in descending order (newest first)
    mockFindMany.mockResolvedValue([jobNew, jobOld]);

    const result = await runClassificationWorker();

    // Verify worker processed them
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(result.skippedBlocked).toBe(false);
  });
});
