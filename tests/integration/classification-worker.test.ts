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
  canonicalizeJobFacts: jest.fn(),
}));

// Mock Vector Service
jest.mock("@/lib/ai/vector-service", () => ({
  generateEmbedding: jest.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import {
  isProviderBlocked,
  withCircuitBreaker,
} from "@/lib/ai/circuit-breaker";
import {
  classifyJobListing,
  canonicalizeJobFacts,
} from "@/services/jobClassificationService";
import { generateEmbedding } from "@/lib/ai/vector-service";

const mockFindMany = prisma.jobListing.findMany as jest.Mock;
const mockUpdate = prisma.jobListing.update as jest.Mock;
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

    // Default: provider is healthy
    mockIsProviderBlocked.mockResolvedValue(false);

    // Default: withCircuitBreaker passes through to the wrapped fn, regardless of key
    mockWithCircuitBreaker.mockImplementation(
      (_key: string, fn: () => Promise<unknown>) => fn(),
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
      expect.any(Function),
      expect.any(Number),
    );
    expect(mockGenerateEmbedding).toHaveBeenCalledWith("React TypeScript");

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
  // Scenario: Zod-invalid jobFacts — immediate FAILED, no attempts increment
  // ──────────────────────────────────────────────────

  it("marks job FAILED immediately (no attempts-loop retry) when jobFacts fails Zod validation", async () => {
    const job = makeMockJob({ classificationAttempts: 0 });
    mockFindMany.mockResolvedValue([job]);

    // Schema-invalid: seniority is not one of the allowed enum values
    mockClassifyJobListing.mockResolvedValue({
      jobFacts: makeValidJobFacts({ seniority: "not-a-real-level" }),
    });

    const result = await runClassificationWorker();

    // Should mark FAILED immediately, with no classificationAttempts increment
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: job.id },
      data: {
        classificationStatus: "FAILED",
        classificationError: expect.any(String),
      },
    });
    // The FAILED update must NOT include classificationAttempts (no retry-loop bump)
    const failedCall = mockUpdate.mock.calls.find(
      (call) => call[0]?.data?.classificationStatus === "FAILED",
    );
    expect(failedCall?.[0]?.data).not.toHaveProperty("classificationAttempts");

    // Should never call the embedding provider for an invalid-shape job
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();

    expect(result).toEqual({ processed: 0, failed: 1, skippedBlocked: false });
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
  // Scenario: Embedding-provider failure (separate circuit breaker, FR-23)
  // ──────────────────────────────────────────────────

  it("stays PENDING and increments classificationAttempts when the embedding provider fails transiently (parsing succeeded)", async () => {
    const job = makeMockJob({ classificationAttempts: 0 });
    mockFindMany.mockResolvedValue([job]);

    mockWithCircuitBreaker.mockImplementation(
      (key: string, fn: () => Promise<unknown>) => {
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

  it("marks job FAILED after max attempts when the embedding provider is BLOCKED on the final attempt", async () => {
    const job = makeMockJob({ classificationAttempts: 2 }); // 3rd attempt
    mockFindMany.mockResolvedValue([job]);

    mockWithCircuitBreaker.mockImplementation(
      (key: string, fn: () => Promise<unknown>) => {
        if (key === EMBEDDING_PROVIDER_KEY) {
          return Promise.reject(new Error("Embedding provider BLOCKED (429)"));
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
      (key: string, fn: () => Promise<unknown>) => {
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
  // T008/T011: canonicalization write-path wiring (FR-08)
  //
  // The 4-step canonicalization state machine itself (exact hit / alias-confirm / new-row /
  // kind isolation) is unit-tested directly against `skillCanonicalizationService` in
  // tests/unit/skillCanonicalizationService.test.ts (T009) — `jobClassificationService` is
  // mocked at the module boundary here (matching this file's existing convention), so these
  // tests assert only that the worker (a) calls `canonicalizeJobFacts` with the raw extraction
  // before `JobFactsSchema` validation/persistence, and (b) persists whatever canonical result
  // it returns — the wiring contract, not the resolution algorithm.
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

    // Simulates `resolveCanonicalSkills` converging both spellings on the same canonical
    // displayName (the alias-confirm mechanism itself is covered by T009's exact-alias-hit
    // and above-threshold-confirmed unit tests).
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
});
