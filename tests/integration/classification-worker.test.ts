/**
 * @jest-environment node
 */

import {
  runClassificationWorker,
  recoverRunningClassifications,
  gracefulShutdownClassificationWorker,
  isCapacityUnavailabilityError,
} from "@/lib/workers/classification-worker";

// Mock Prisma
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

// Mock Circuit Breaker
jest.mock("@/lib/ai/circuit-breaker", () => {
  const actual = jest.requireActual("@/lib/ai/circuit-breaker");
  return {
    ...actual,
    isProviderBlocked: jest.fn(),
    withCircuitBreaker: jest.fn(),
  };
});

// Mock aiClient — resolveAIConfig is used to determine the provider passed into the
// circuit breaker (per-capability-and-provider block scoping); a fixed "gemini" here keeps
// the existing key-based mockImplementation assertions below stable.
jest.mock("@/lib/ai/aiClient", () => {
  const actual = jest.requireActual("@/lib/ai/aiClient");
  return {
    ...actual,
    resolveAIConfig: jest
      .fn()
      .mockResolvedValue({ provider: "gemini", model: "test-model" }),
  };
});

// Mock Classification Service
jest.mock("@/services/jobClassificationService", () => ({
  classifyJobListing: jest.fn(),
  canonicalizeJobFacts: jest.fn(),
}));

// Mock Logger (assert salary-period log events)
jest.mock("@/lib/logging/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock Vector Service
jest.mock("@/lib/ai/vector-service", () => ({
  generateEmbedding: jest.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import {
  isProviderBlocked,
  withCircuitBreaker,
} from "@/lib/ai/circuit-breaker";
import { AIWorkerBackoffError } from "@/lib/ai/aiClient";
import {
  classifyJobListing,
  canonicalizeJobFacts,
} from "@/services/jobClassificationService";
import { generateEmbedding } from "@/lib/ai/vector-service";

const mockSystemConfigFindUnique = prisma.systemConfig.findUnique as jest.Mock;
const mockFindMany = prisma.jobListing.findMany as jest.Mock;
const mockUpdate = prisma.jobListing.update as jest.Mock;
const mockUpdateMany = prisma.jobListing.updateMany as jest.Mock;
const mockExecuteRaw = prisma.$executeRaw as unknown as jest.Mock;
const mockIsProviderBlocked = isProviderBlocked as jest.Mock;
const mockWithCircuitBreaker = withCircuitBreaker as jest.Mock;
const mockClassifyJobListing = classifyJobListing as jest.Mock;
const mockCanonicalizeJobFacts = canonicalizeJobFacts as jest.Mock;
const mockGenerateEmbedding = generateEmbedding as jest.Mock;

const PARSING_PROVIDER_KEY = "AI_PROVIDER_PARSING";
const EMBEDDING_PROVIDER_KEY = "AI_PROVIDER_EMBEDDING";

// A reusable factory for mock job listings
function makeMockJob(
  overrides: Partial<{
    id: string;
    title: string;
    company: string;
    fullDescription: string;
    classificationAttempts: number;
  }> = {},
) {
  return {
    id: "job-001",
    title: "Senior React Developer",
    company: "Tech Corp",
    fullDescription:
      "We are looking for a Senior React Developer with 5+ years experience...",
    classificationAttempts: 0,
    ...overrides,
  };
}

// A valid JobFacts fixture matching JobFactsSchema
function makeValidJobFacts(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    mustHave: ["React", "TypeScript"],
    niceToHave: ["Next.js"],
    softSkills: ["Communication"],
    seniority: "senior",
    yearsExperienceMin: 5,
    employmentType: "permanent",
    workMode: "remote",
    isWorldwide: null,
    requiresUsWorkAuth: null,
    providesRelocationVisa: null,
    location: null,
    salaryMin: null,
    salaryMax: null,
    currency: null,
    ...overrides,
  };
}

describe("Classification Worker — runClassificationWorker", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: no custom SystemConfig overrides
    mockSystemConfigFindUnique.mockResolvedValue(null);

    // Default: provider is healthy
    mockIsProviderBlocked.mockResolvedValue(false);

    // Default: withCircuitBreaker passes through to the wrapped fn, regardless of key/provider
    mockWithCircuitBreaker.mockImplementation(
      (_key: string, _provider: string, fn: () => Promise<unknown>) => fn(),
    );

    // Default: classification returns a valid jobFacts payload
    mockClassifyJobListing.mockResolvedValue({ jobFacts: makeValidJobFacts() });

    // Default: canonicalization (T008) is an identity pass-through — its own state-machine
    // branches are covered by skillCanonicalizationService.test.ts (T009); here we only assert
    // it is wired into the write path at the right point (before JobFactsSchema validation).
    mockCanonicalizeJobFacts.mockImplementation((jobFacts: unknown) =>
      Promise.resolve(jobFacts),
    );

    // Default: embedding generation returns a vector
    mockGenerateEmbedding.mockResolvedValue(new Array(768).fill(0.5));

    // Default DB operations succeed
    mockUpdate.mockResolvedValue({});
    mockUpdateMany.mockResolvedValue({ count: 0 });
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
  // Scenario: Successful classification — jobFacts happy path
  // ──────────────────────────────────────────────────

  it("classifies a pending job successfully: marks RUNNING, calls LLM + embedding, persists jobFacts as COMPLETED", async () => {
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
      }),
    );

    // Should mark job as RUNNING first
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: job.id },
      data: { classificationStatus: "RUNNING" },
    });

    // Should call the classification service under the PARSING_PROVIDER_KEY breaker
    expect(mockWithCircuitBreaker).toHaveBeenCalledWith(
      PARSING_PROVIDER_KEY,
      "gemini",
      expect.any(Function),
      expect.any(Number),
    );
    expect(mockClassifyJobListing).toHaveBeenCalledWith({
      id: job.id,
      title: job.title,
      company: job.company,
      fullDescription: job.fullDescription,
    });

    // Should generate the mustHave-skill-list embedding under the EMBEDDING_PROVIDER_KEY breaker
    expect(mockWithCircuitBreaker).toHaveBeenCalledWith(
      EMBEDDING_PROVIDER_KEY,
      "gemini",
      expect.any(Function),
      expect.any(Number),
    );
    expect(mockGenerateEmbedding).toHaveBeenCalledWith("React TypeScript");

    // Should persist results via raw SQL
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);

    expect(result).toEqual({ processed: 1, failed: 0, skippedBlocked: false });
  });

  it("processes multiple pending jobs in a batch", async () => {
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
  // Scenario: Continuous multi-batch drain (US-1, AC.1, AC.2)
  // ──────────────────────────────────────────────────

  it("continuously drains multiple batches ordered by createdAt desc until zero pending jobs remain", async () => {
    const batch1 = [
      makeMockJob({ id: "job-newest-1", title: "Newest Job 1" }),
      makeMockJob({ id: "job-newest-2", title: "Newest Job 2" }),
    ];
    const batch2 = [
      makeMockJob({ id: "job-older-3", title: "Older Job 3" }),
      makeMockJob({ id: "job-oldest-4", title: "Oldest Job 4" }),
    ];

    mockFindMany
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce(batch2)
      .mockResolvedValueOnce([]);

    const sleepFn = jest.fn().mockResolvedValue(undefined);
    const result = await runClassificationWorker({ sleepFn });

    expect(mockFindMany).toHaveBeenCalledTimes(3);
    for (const call of mockFindMany.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          orderBy: { createdAt: "desc" },
        }),
      );
    }
    expect(sleepFn).not.toHaveBeenCalled();
    expect(result.processed).toBe(4);
    expect(result.failed).toBe(0);
    expect(result.skippedBlocked).toBe(false);
    expect(result.batchesProcessed).toBe(2);
  });

  // ──────────────────────────────────────────────────
  // Scenario: Bounded concurrent processing & runtime config reload (US-2, AC.1, AC.3)
  // ──────────────────────────────────────────────────

  it("classifies up to 3 jobs concurrently by default within a batch", async () => {
    const jobs = Array.from({ length: 6 }, (_, idx) =>
      makeMockJob({ id: `job-${idx + 1}` }),
    );
    mockFindMany.mockResolvedValueOnce(jobs).mockResolvedValueOnce([]);

    let inFlight = 0;
    let maxInFlight = 0;

    mockClassifyJobListing.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 15));
      inFlight--;
      return { jobFacts: makeValidJobFacts() };
    });

    const result = await runClassificationWorker();

    expect(maxInFlight).toBe(3);
    expect(result.processed).toBe(6);
    expect(result.failed).toBe(0);
  });

  it("applies updated CLASSIFIER_CONCURRENCY from SystemConfig on subsequent runs without restart", async () => {
    mockSystemConfigFindUnique.mockImplementation(
      async ({ where }: { where: { key: string } }) => {
        if (where.key === "CLASSIFIER_CONCURRENCY") {
          return { key: "CLASSIFIER_CONCURRENCY", value: "5" };
        }
        return null;
      },
    );

    const jobs = Array.from({ length: 6 }, (_, idx) =>
      makeMockJob({ id: `job-c5-${idx + 1}` }),
    );
    mockFindMany.mockResolvedValueOnce(jobs).mockResolvedValueOnce([]);

    let inFlight = 0;
    let maxInFlight = 0;

    mockClassifyJobListing.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 15));
      inFlight--;
      return { jobFacts: makeValidJobFacts() };
    });

    const result = await runClassificationWorker();

    expect(maxInFlight).toBe(5);
    expect(result.processed).toBe(6);
  });

  // ──────────────────────────────────────────────────
  // Scenario: Reactive waiting on per-minute vs daily quota exhaustion (US-3, US-4, AC.4, AC.5)
  // ──────────────────────────────────────────────────

  it("pauses for retryAfterSeconds on MINUTE_QUOTA exhaustion, resets job to PENDING with 0 attempt penalty, and resumes draining", async () => {
    const job = makeMockJob({ id: "job-min-quota", classificationAttempts: 0 });
    mockFindMany
      .mockResolvedValueOnce([job])
      .mockResolvedValueOnce([job])
      .mockResolvedValueOnce([]);

    mockClassifyJobListing
      .mockRejectedValueOnce(
        new AIWorkerBackoffError(
          "Minute quota exhausted across free models",
          "MINUTE_QUOTA",
          12,
        ),
      )
      .mockResolvedValueOnce({ jobFacts: makeValidJobFacts() });

    const sleepFn = jest.fn().mockResolvedValue(undefined);
    const result = await runClassificationWorker({ sleepFn });

    // Must pause for 12s (12000ms)
    expect(sleepFn).toHaveBeenCalledTimes(1);
    expect(sleepFn).toHaveBeenCalledWith(12000);

    // First attempt reverted to PENDING without touching classificationAttempts
    const pendingRevertCall = mockUpdate.mock.calls.find(
      (call) => call[0]?.data?.classificationStatus === "PENDING",
    );
    expect(pendingRevertCall).toBeDefined();
    expect(pendingRevertCall?.[0]?.data).not.toHaveProperty(
      "classificationAttempts",
    );

    // Resumed after sleep and completed the job
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skippedBlocked).toBe(false);
    expect(result.pausedForMinuteQuotaCount).toBe(1);
  });

  it("stops draining immediately without sleeping on DAILY_QUOTA exhaustion and keeps job PENDING with unchanged attempts", async () => {
    const job = makeMockJob({
      id: "job-daily-quota",
      classificationAttempts: 2,
    });
    mockFindMany.mockResolvedValueOnce([job]);

    mockClassifyJobListing.mockRejectedValueOnce(
      new AIWorkerBackoffError(
        "Daily quota exhausted across all free models",
        "DAILY_QUOTA",
        null,
      ),
    );

    const sleepFn = jest.fn().mockResolvedValue(undefined);
    const result = await runClassificationWorker({ sleepFn });

    expect(sleepFn).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: job.id },
      data: { classificationStatus: "PENDING" },
    });
    expect(
      mockUpdate.mock.calls.some(
        (call) => call[0]?.data?.classificationStatus === "FAILED",
      ),
    ).toBe(false);
    expect(result).toEqual({ processed: 0, failed: 0, skippedBlocked: true });
  });

  it("stops draining immediately without sleeping on ALL_MODELS_BLOCKED and keeps job PENDING with unchanged attempts", async () => {
    const job = makeMockJob({ id: "job-blocked", classificationAttempts: 1 });
    mockFindMany.mockResolvedValueOnce([job]);

    mockClassifyJobListing.mockRejectedValueOnce(
      new AIWorkerBackoffError(
        "All models blocked by circuit breaker",
        "ALL_MODELS_BLOCKED",
        null,
      ),
    );

    const sleepFn = jest.fn().mockResolvedValue(undefined);
    const result = await runClassificationWorker({ sleepFn });

    expect(sleepFn).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: job.id },
      data: { classificationStatus: "PENDING" },
    });
    expect(result).toEqual({ processed: 0, failed: 0, skippedBlocked: true });
  });

  // ──────────────────────────────────────────────────
  // Scenario: Zod-invalid jobFacts — unified 3-attempt listing-specific failure rule (US-4, AC.6)
  // ──────────────────────────────────────────────────

  it("increments classificationAttempts and returns to PENDING on 1st and 2nd Zod validation failures, marking FAILED on 3rd attempt", async () => {
    //Schema-invalid: seniority is not one of the allowed enum values
    mockClassifyJobListing.mockResolvedValue({
      jobFacts: makeValidJobFacts({ seniority: "not-a-real-level" }),
    });

    // Attempt 1 (0 -> 1): stays PENDING
    mockFindMany.mockResolvedValueOnce([
      makeMockJob({ id: "job-zod", classificationAttempts: 0 }),
    ]);
    const res1 = await runClassificationWorker();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "job-zod" },
      data: {
        classificationStatus: "PENDING",
        classificationAttempts: 1,
        classificationError: expect.any(String),
      },
    });
    expect(res1).toEqual({ processed: 0, failed: 0, skippedBlocked: false });

    // Attempt 2 (1 -> 2): stays PENDING
    mockUpdate.mockClear();
    mockFindMany.mockResolvedValueOnce([
      makeMockJob({ id: "job-zod", classificationAttempts: 1 }),
    ]);
    const res2 = await runClassificationWorker();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "job-zod" },
      data: {
        classificationStatus: "PENDING",
        classificationAttempts: 2,
        classificationError: expect.any(String),
      },
    });
    expect(res2).toEqual({ processed: 0, failed: 0, skippedBlocked: false });

    // Attempt 3 (2 -> 3): marked FAILED
    mockUpdate.mockClear();
    mockFindMany.mockResolvedValueOnce([
      makeMockJob({ id: "job-zod", classificationAttempts: 2 }),
    ]);
    const res3 = await runClassificationWorker();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "job-zod" },
      data: {
        classificationStatus: "FAILED",
        classificationAttempts: 3,
        classificationError: expect.any(String),
      },
    });
    expect(res3).toEqual({ processed: 0, failed: 1, skippedBlocked: false });
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────
  // Scenario: Transient parsing error (non-blocking HTTP code)
  // ──────────────────────────────────────────────────

  it("resets job to PENDING and increments attempts on transient error (first attempt)", async () => {
    const job = makeMockJob({ classificationAttempts: 0 });
    mockFindMany.mockResolvedValue([job]);
    mockWithCircuitBreaker.mockImplementation((key: string) => {
      if (key === PARSING_PROVIDER_KEY) {
        return Promise.reject(new Error("Gateway Timeout"));
      }
      return Promise.resolve(new Array(768).fill(0.5));
    });

    const result = await runClassificationWorker();

    // Should reset to PENDING, not FAILED (only 1 attempt used)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          classificationStatus: "PENDING",
          classificationAttempts: 1,
        }),
      }),
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
      }),
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
      }),
    );

    expect(result.failed).toBe(1);
    expect(result.processed).toBe(0);
  });

  // ──────────────────────────────────────────────────
  // Scenario: Embedding-provider failure (separate circuit breaker, FR-23 & FR-9)
  // ──────────────────────────────────────────────────

  it("stays PENDING and increments classificationAttempts when the embedding provider fails transiently (parsing succeeded)", async () => {
    const job = makeMockJob({ classificationAttempts: 0 });
    mockFindMany.mockResolvedValue([job]);

    mockWithCircuitBreaker.mockImplementation(
      (key: string, _provider: string, fn: () => Promise<unknown>) => {
        if (key === EMBEDDING_PROVIDER_KEY) {
          return Promise.reject(new Error("Embedding provider unavailable"));
        }
        return fn();
      },
    );

    const result = await runClassificationWorker();

    // classifyJobListing must have succeeded (parsing breaker passed through)
    expect(mockClassifyJobListing).toHaveBeenCalledTimes(1);

    // The failure happened at the embedding step — job stays PENDING, attempts incremented
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          classificationStatus: "PENDING",
          classificationAttempts: 1,
        }),
      }),
    );

    // No jobFacts/embedding persistence happened
    expect(mockExecuteRaw).not.toHaveBeenCalled();

    expect(result).toEqual({ processed: 0, failed: 0, skippedBlocked: false });
  });

  it("reverts job to PENDING without incrementing attempts and returns skippedBlocked=true when embedding provider hits HTTP 429 block", async () => {
    const job = makeMockJob({ classificationAttempts: 2 }); // Even on 3rd attempt, capacity 429 must NOT mark FAILED
    mockFindMany.mockResolvedValueOnce([job]);

    mockWithCircuitBreaker.mockImplementation(
      (key: string, _provider: string, fn: () => Promise<unknown>) => {
        if (key === EMBEDDING_PROVIDER_KEY) {
          return Promise.reject(new Error("Embedding provider BLOCKED (429)"));
        }
        return fn();
      },
    );

    const sleepFn = jest.fn().mockResolvedValue(undefined);
    const result = await runClassificationWorker({ sleepFn });

    expect(sleepFn).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: job.id },
      data: { classificationStatus: "PENDING" },
    });
    expect(result).toEqual({ processed: 0, failed: 0, skippedBlocked: true });
  });

  it("marks job FAILED after max attempts when the embedding provider fails with a non-capacity error on the 3rd attempt", async () => {
    const job = makeMockJob({ classificationAttempts: 2 }); // 3rd attempt
    mockFindMany.mockResolvedValue([job]);

    mockWithCircuitBreaker.mockImplementation(
      (key: string, _provider: string, fn: () => Promise<unknown>) => {
        if (key === EMBEDDING_PROVIDER_KEY) {
          return Promise.reject(
            new Error("Embedding vector dimension mismatch"),
          );
        }
        return fn();
      },
    );

    const result = await runClassificationWorker();

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          classificationStatus: "FAILED",
          classificationAttempts: 3,
        }),
      }),
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

    // First job succeeds end-to-end, second job's parsing breaker rejects
    let callCount = 0;
    mockWithCircuitBreaker.mockImplementation(
      (key: string, _provider: string, fn: () => Promise<unknown>) => {
        if (key === PARSING_PROVIDER_KEY) {
          callCount++;
          if (callCount === 2) {
            return Promise.reject(new Error("LLM error"));
          }
        }
        return fn();
      },
    );

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
      }),
    );
  });

  // ──────────────────────────────────────────────────
  // Scenario: Graceful shutdown and crash recovery lifecycle (US-6, AC.8)
  // ──────────────────────────────────────────────────

  it("recoverRunningClassifications resets RUNNING listings to PENDING without modifying classificationAttempts", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 3 });

    const recovered = await recoverRunningClassifications("startup");

    expect(recovered).toBe(3);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { classificationStatus: "RUNNING" },
      data: { classificationStatus: "PENDING" },
    });
  });

  it("gracefulShutdownClassificationWorker resets RUNNING listings to PENDING on shutdown signal", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 2 });

    await gracefulShutdownClassificationWorker("SIGTERM");

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { classificationStatus: "RUNNING" },
      data: { classificationStatus: "PENDING" },
    });
  });

  it("isCapacityUnavailabilityError identifies AIWorkerBackoffError and HTTP 429/401/402 while excluding listing errors", () => {
    expect(
      isCapacityUnavailabilityError(
        new AIWorkerBackoffError("exhausted", "MINUTE_QUOTA", 30),
      ),
    ).toBe(true);
    expect(
      isCapacityUnavailabilityError(new Error("Provider rate limit 429")),
    ).toBe(true);
    expect(
      isCapacityUnavailabilityError({ status: 402, message: "Quota exceeded" }),
    ).toBe(true);
    expect(
      isCapacityUnavailabilityError(new Error("JobFacts validation failed")),
    ).toBe(false);
  });

  // ──────────────────────────────────────────────────
  // T008/T011: canonicalization write-path wiring (FR-08)
  // ──────────────────────────────────────────────────

  it("canonicalizes jobFacts before JobFactsSchema validation, and persists the canonicalized result", async () => {
    const job = makeMockJob();
    mockFindMany.mockResolvedValue([job]);
    mockClassifyJobListing.mockResolvedValue({
      jobFacts: makeValidJobFacts({ mustHave: ["Postgres", "TypeScript"] }),
    });
    mockCanonicalizeJobFacts.mockResolvedValue(
      makeValidJobFacts({ mustHave: ["PostgreSQL", "TypeScript"] }),
    );

    const result = await runClassificationWorker();

    // Canonicalization is called with the raw (pre-validation) extraction.
    expect(mockCanonicalizeJobFacts).toHaveBeenCalledWith(
      expect.objectContaining({ mustHave: ["Postgres", "TypeScript"] }),
    );

    // The persisted jobFacts reflect the canonicalized result, not the raw extraction.
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    const persistedJson = (mockExecuteRaw.mock.calls[0] as unknown[])
      .flat()
      .find(
        (part): part is string =>
          typeof part === "string" && part.includes("mustHave"),
      );
    expect(persistedJson).toContain("PostgreSQL");
    expect(persistedJson).not.toContain("Postgres,");

    expect(result.processed).toBe(1);
  });

  it("double-call dedup: two spellings of the same technology across two jobs both persist the same canonical mustHave value", async () => {
    const jobA = makeMockJob({ id: "job-A" });
    const jobB = makeMockJob({ id: "job-B" });
    mockFindMany.mockResolvedValue([jobA, jobB]);

    mockClassifyJobListing
      .mockResolvedValueOnce({
        jobFacts: makeValidJobFacts({ mustHave: ["Postgres"] }),
      })
      .mockResolvedValueOnce({
        jobFacts: makeValidJobFacts({ mustHave: ["PostgreSQL"] }),
      });

    mockCanonicalizeJobFacts.mockImplementation(
      (jobFacts: { mustHave: string[] }) =>
        Promise.resolve({
          ...jobFacts,
          mustHave: jobFacts.mustHave.map(() => "PostgreSQL"),
        }),
    );

    await runClassificationWorker();

    expect(mockCanonicalizeJobFacts).toHaveBeenCalledTimes(2);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);

    const persistedPayloads = mockExecuteRaw.mock.calls.map((call) =>
      (call as unknown[])
        .flat()
        .find(
          (part): part is string =>
            typeof part === "string" && part.includes("mustHave"),
        ),
    );
    expect(persistedPayloads[0]).toContain("PostgreSQL");
    expect(persistedPayloads[1]).toContain("PostgreSQL");
  });

  // ──────────────────────────────────────────────────
  // Scenario: salaryPeriod tri-state persistence (APC-44, spectech D10)
  // ──────────────────────────────────────────────────

  function persistedFacts(): Record<string, unknown> {
    const json = (mockExecuteRaw.mock.calls[0] as unknown[])
      .flat()
      .find(
        (part): part is string =>
          typeof part === "string" && part.includes("mustHave"),
      );
    return JSON.parse(json as string);
  }

  it("persists an explicit salaryPeriod: null when the AI omitted the key, and logs unknown period when an amount exists", async () => {
    mockFindMany.mockResolvedValue([makeMockJob()]);
    mockClassifyJobListing.mockResolvedValue({
      jobFacts: makeValidJobFacts({ salaryMin: 50, currency: "USD" }),
    });

    await runClassificationWorker();

    const facts = persistedFacts();
    expect("salaryPeriod" in facts).toBe(true);
    expect(facts.salaryPeriod).toBeNull();
    expect(logger.info).toHaveBeenCalledWith("Job salary period unknown", {
      jobId: "job-001",
      hasMin: true,
      hasMax: false,
      currency: "USD",
    });
    expect(logger.warn).not.toHaveBeenCalledWith(
      "Unrecognised salary period dropped",
      expect.anything(),
    );
  });

  it("does not log unknown period when there is no salary amount", async () => {
    mockFindMany.mockResolvedValue([makeMockJob()]);

    await runClassificationWorker();

    expect(persistedFacts().salaryPeriod).toBeNull();
    expect(logger.info).not.toHaveBeenCalledWith(
      "Job salary period unknown",
      expect.anything(),
    );
  });

  it("persists a stated period normalised to upper case without warnings", async () => {
    mockFindMany.mockResolvedValue([makeMockJob()]);
    mockClassifyJobListing.mockResolvedValue({
      jobFacts: makeValidJobFacts({
        salaryMin: 50,
        salaryMax: 80,
        currency: "USD",
        salaryPeriod: "hourly",
      }),
    });

    await runClassificationWorker();

    expect(persistedFacts().salaryPeriod).toBe("HOURLY");
    expect(logger.warn).not.toHaveBeenCalledWith(
      "Unrecognised salary period dropped",
      expect.anything(),
    );
  });

  it("drops an unrecognised period to null, warns with the raw value, and still classifies the job", async () => {
    mockFindMany.mockResolvedValue([makeMockJob()]);
    mockClassifyJobListing.mockResolvedValue({
      jobFacts: makeValidJobFacts({ salaryMin: 900, salaryPeriod: "WEEKLY" }),
    });

    const result = await runClassificationWorker();

    expect(result.processed).toBe(1);
    expect(persistedFacts().salaryPeriod).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      "Unrecognised salary period dropped",
      { jobId: "job-001", rawType: "string", raw: "WEEKLY" },
    );
  });

  it("logs oversized, multi-line and object raw periods only in bounded form", async () => {
    const cases: unknown[] = [
      "X".repeat(5000),
      "line1\nline2\r\nline3\u0007",
      { nested: "x".repeat(5000) },
    ];
    for (const raw of cases) {
      jest.clearAllMocks();
      mockFindMany.mockResolvedValue([makeMockJob()]);
      mockClassifyJobListing.mockResolvedValue({
        jobFacts: makeValidJobFacts({ salaryMin: 900, salaryPeriod: raw }),
      });
      await runClassificationWorker();
      const call = (logger.warn as jest.Mock).mock.calls.find(
        (c) => c[0] === "Unrecognised salary period dropped",
      );
      expect(call).toBeDefined();
      const payload = call![1] as { raw: unknown; rawType: string };
      expect(typeof payload.raw).toBe("string");
      expect((payload.raw as string).length).toBeLessThanOrEqual(32);
      expect(payload.raw as string).not.toMatch(/[\u0000-\u001f]/);
      expect(payload.rawType).toBe(typeof raw);
    }
  });
});
