/**
 * @jest-environment node
 */

import { runClassificationWorker } from "@/lib/workers/classification-worker";

// Mock Prisma
jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    jobListing: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    $executeRaw: jest.fn(),
  },
}));

// Mock Circuit Breaker
jest.mock("@/lib/ai/circuit-breaker", () => ({
  isProviderBlocked: jest.fn(),
  withCircuitBreaker: jest.fn(),
}));

// Mock Classification Service
jest.mock("@/services/jobClassificationService", () => ({
  classifyJobListing: jest.fn(),
}));

// Mock Vector Service
jest.mock("@/lib/ai/vector-service", () => ({
  generateEmbedding: jest.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { isProviderBlocked, withCircuitBreaker } from "@/lib/ai/circuit-breaker";
import { classifyJobListing } from "@/services/jobClassificationService";
import { generateEmbedding } from "@/lib/ai/vector-service";

const mockFindMany = prisma.jobListing.findMany as jest.Mock;
const mockUpdate = prisma.jobListing.update as jest.Mock;
const mockExecuteRaw = prisma.$executeRaw as unknown as jest.Mock;
const mockIsProviderBlocked = isProviderBlocked as jest.Mock;
const mockWithCircuitBreaker = withCircuitBreaker as jest.Mock;
const mockClassifyJobListing = classifyJobListing as jest.Mock;
const mockGenerateEmbedding = generateEmbedding as jest.Mock;

// A reusable factory for mock job listings
function makeMockJob(overrides: Partial<{
  id: string;
  title: string;
  company: string;
  fullDescription: string;
  classificationAttempts: number;
}> = {}) {
  return {
    id: "job-001",
    title: "Senior React Developer",
    company: "Tech Corp",
    fullDescription: "We are looking for a Senior React Developer with 5+ years experience...",
    classificationAttempts: 0,
    ...overrides,
  };
}

describe("Classification Worker — runClassificationWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: provider is healthy
    mockIsProviderBlocked.mockResolvedValue(false);

    // Default: withCircuitBreaker passes through to the wrapped fn
    mockWithCircuitBreaker.mockImplementation((_key: string, fn: () => Promise<unknown>) => fn());

    // Default: classification returns cleaned summary
    mockClassifyJobListing.mockResolvedValue({
      cleanedSummary: "Senior React Developer | 5 years React | Next.js | TypeScript | Remote-friendly",
    });

    // Default: embedding generation returns a 512-dim vector
    mockGenerateEmbedding.mockResolvedValue(new Array(512).fill(0.5));

    // Default DB operations succeed
    mockUpdate.mockResolvedValue({});
    mockExecuteRaw.mockResolvedValue(1);
  });

  // ──────────────────────────────────────────────────
  // Scenario: Provider is BLOCKED
  // ──────────────────────────────────────────────────

  it("skips processing and returns skippedBlocked=true when provider is BLOCKED", async () => {
    mockIsProviderBlocked.mockResolvedValue(true);

    const result = await runClassificationWorker();

    expect(result).toEqual({ processed: 0, failed: 0, skippedBlocked: true });
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockClassifyJobListing).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────
  // Scenario: No pending jobs
  // ──────────────────────────────────────────────────

  it("returns zeros when there are no pending jobs", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await runClassificationWorker();

    expect(result).toEqual({ processed: 0, failed: 0, skippedBlocked: false });
    expect(mockClassifyJobListing).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────
  // Scenario: Successful classification
  // ──────────────────────────────────────────────────

  it("classifies a pending job successfully: marks RUNNING, calls LLM + embedding, persists COMPLETED", async () => {
    const job = makeMockJob();
    mockFindMany.mockResolvedValue([job]);

    const result = await runClassificationWorker();

    // Should have found jobs
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isFullDescriptionFetched: true,
          classificationStatus: "PENDING",
        }),
      })
    );

    // Should mark job as RUNNING first
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: job.id },
      data: { classificationStatus: "RUNNING" },
    });

    // Should call the classification service
    expect(mockClassifyJobListing).toHaveBeenCalledWith({
      id: job.id,
      title: job.title,
      company: job.company,
      fullDescription: job.fullDescription,
    });

    // Should generate vector embedding
    expect(mockGenerateEmbedding).toHaveBeenCalledWith(
      "Senior React Developer | 5 years React | Next.js | TypeScript | Remote-friendly"
    );

    // Should persist results via raw SQL
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);

    expect(result).toEqual({ processed: 1, failed: 0, skippedBlocked: false });
  });

  it("processes multiple pending jobs sequentially", async () => {
    const jobs = [
      makeMockJob({ id: "job-001", title: "Senior React Developer" }),
      makeMockJob({ id: "job-002", title: "Backend Node.js Engineer" }),
      makeMockJob({ id: "job-003", title: "DevOps Engineer" }),
    ];
    mockFindMany.mockResolvedValue(jobs);

    const result = await runClassificationWorker();

    expect(mockUpdate).toHaveBeenCalledTimes(3); // 3 × RUNNING marks
    expect(mockClassifyJobListing).toHaveBeenCalledTimes(3);
    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(3);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(3);
    expect(result.processed).toBe(3);
    expect(result.failed).toBe(0);
  });

  // ──────────────────────────────────────────────────
  // Scenario: Transient error (non-blocking HTTP code)
  // ──────────────────────────────────────────────────

  it("resets job to PENDING and increments attempts on transient error (first attempt)", async () => {
    const job = makeMockJob({ classificationAttempts: 0 });
    mockFindMany.mockResolvedValue([job]);
    mockWithCircuitBreaker.mockRejectedValue(new Error("Gateway Timeout"));

    const result = await runClassificationWorker();

    // Should reset to PENDING, not FAILED (only 1 attempt used)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          classificationStatus: "PENDING",
          classificationAttempts: 1,
        }),
      })
    );

    // Should not count as "failed" — still PENDING, will retry
    expect(result).toEqual({ processed: 0, failed: 0, skippedBlocked: false });
  });

  it("resets job to PENDING on second attempt failure (attempts=1)", async () => {
    const job = makeMockJob({ classificationAttempts: 1 });
    mockFindMany.mockResolvedValue([job]);
    mockWithCircuitBreaker.mockRejectedValue(new Error("Timeout"));

    const result = await runClassificationWorker();

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          classificationStatus: "PENDING",
          classificationAttempts: 2,
        }),
      })
    );

    expect(result.failed).toBe(0);
  });

  it("marks job as FAILED after MAX_CLASSIFICATION_ATTEMPTS (3rd attempt)", async () => {
    const job = makeMockJob({ classificationAttempts: 2 }); // 3rd attempt will fail
    mockFindMany.mockResolvedValue([job]);
    mockWithCircuitBreaker.mockRejectedValue(new Error("Repeated failure"));

    const result = await runClassificationWorker();

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          classificationStatus: "FAILED",
          classificationAttempts: 3,
        }),
      })
    );

    expect(result.failed).toBe(1);
    expect(result.processed).toBe(0);
  });

  // ──────────────────────────────────────────────────
  // Scenario: Jobs without fullDescription (edge case)
  // ──────────────────────────────────────────────────

  it("skips jobs with null fullDescription without calling LLM", async () => {
    const jobWithNoDescription = { ...makeMockJob(), fullDescription: null };
    mockFindMany.mockResolvedValue([jobWithNoDescription]);

    const result = await runClassificationWorker();

    // Should not mark as RUNNING or call LLM
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockClassifyJobListing).not.toHaveBeenCalled();
    expect(result.processed).toBe(0);
  });

  // ──────────────────────────────────────────────────
  // Scenario: Mixed results (some succeed, some fail)
  // ──────────────────────────────────────────────────

  it("correctly tallies processed and failed across mixed results", async () => {
    const goodJob = makeMockJob({ id: "job-001" });
    const badJob = makeMockJob({ id: "job-002", classificationAttempts: 2 }); // Will be FAILED after this attempt
    mockFindMany.mockResolvedValue([goodJob, badJob]);

    // First call succeeds, second fails
    mockWithCircuitBreaker
      .mockImplementationOnce((_key: string, fn: () => Promise<unknown>) => fn()) // job-001 succeeds
      .mockRejectedValueOnce(new Error("LLM error")); // job-002 fails

    const result = await runClassificationWorker();

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.skippedBlocked).toBe(false);
  });

  // ──────────────────────────────────────────────────
  // Scenario: Query filters are correct
  // ──────────────────────────────────────────────────

  it("queries only jobs under the attempt limit", async () => {
    mockFindMany.mockResolvedValue([]);

    await runClassificationWorker();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          classificationAttempts: { lt: 3 },
        }),
      })
    );
  });
});
