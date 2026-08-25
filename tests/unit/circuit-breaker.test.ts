/**
 * @jest-environment node
 */

import {
  isProviderBlocked,
  blockProvider,
  resetProviderBlock,
  withCircuitBreaker,
  isBlockingHttpStatus,
  getBlockedUntilKey,
  BLOCKING_HTTP_STATUSES,
} from "@/lib/ai/circuit-breaker";

// Mock the Prisma client
jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/db/prisma";

const mockFindUnique = prisma.systemConfig.findUnique as jest.Mock;
const mockUpsert = prisma.systemConfig.upsert as jest.Mock;
const mockDelete = prisma.systemConfig.delete as jest.Mock;

describe("Circuit Breaker — isBlockingHttpStatus", () => {
  it("returns true for 429, 401, and 402", () => {
    expect(isBlockingHttpStatus(429)).toBe(true);
    expect(isBlockingHttpStatus(401)).toBe(true);
    expect(isBlockingHttpStatus(402)).toBe(true);
  });

  it("returns false for non-blocking status codes", () => {
    expect(isBlockingHttpStatus(200)).toBe(false);
    expect(isBlockingHttpStatus(500)).toBe(false);
    expect(isBlockingHttpStatus(404)).toBe(false);
    expect(isBlockingHttpStatus(503)).toBe(false);
  });

  it("covers the full BLOCKING_HTTP_STATUSES set", () => {
    BLOCKING_HTTP_STATUSES.forEach((code) => {
      expect(isBlockingHttpStatus(code)).toBe(true);
    });
  });
});

describe("Circuit Breaker — getBlockedUntilKey", () => {
  it("scopes the key by BOTH capability and provider (uppercased)", () => {
    expect(getBlockedUntilKey("AI_PROVIDER_PARSING", "gemini")).toBe(
      "AI_PROVIDER_PARSING_GEMINI_BLOCKED_UNTIL",
    );
    expect(getBlockedUntilKey("AI_PROVIDER_SUMMARIES", "claude")).toBe(
      "AI_PROVIDER_SUMMARIES_CLAUDE_BLOCKED_UNTIL",
    );
  });

  it("produces a different key for a different provider on the same capability", () => {
    const geminiKey = getBlockedUntilKey("AI_PROVIDER_PARSING", "gemini");
    const gemmaKey = getBlockedUntilKey("AI_PROVIDER_PARSING", "gemma-26b");
    expect(geminiKey).not.toBe(gemmaKey);
    expect(gemmaKey).toBe("AI_PROVIDER_PARSING_GEMMA-26B_BLOCKED_UNTIL");
  });
});

describe("Circuit Breaker — isProviderBlocked", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns false when no block entry exists in SystemConfig", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await isProviderBlocked("AI_PROVIDER_PARSING", "gemini");

    expect(result).toBe(false);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { key: "AI_PROVIDER_PARSING_GEMINI_BLOCKED_UNTIL" },
    });
  });

  it("returns true when block timestamp is in the future", async () => {
    const futureTimestamp = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min from now
    mockFindUnique.mockResolvedValue({
      key: "AI_PROVIDER_PARSING_GEMINI_BLOCKED_UNTIL",
      value: futureTimestamp,
    });

    const result = await isProviderBlocked("AI_PROVIDER_PARSING", "gemini");

    expect(result).toBe(true);
  });

  it("returns false for a DIFFERENT provider on the same capability even while gemini is blocked", async () => {
    // Simulates the bug this suite guards against: switching a capability's provider must not
    // inherit a block that was recorded against the previous provider.
    mockFindUnique.mockImplementation(({ where: { key } }) => {
      if (key === "AI_PROVIDER_PARSING_GEMINI_BLOCKED_UNTIL") {
        return Promise.resolve({
          key,
          value: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        });
      }
      return Promise.resolve(null);
    });

    const geminiBlocked = await isProviderBlocked(
      "AI_PROVIDER_PARSING",
      "gemini",
    );
    const gemmaBlocked = await isProviderBlocked(
      "AI_PROVIDER_PARSING",
      "gemma-26b",
    );

    expect(geminiBlocked).toBe(true);
    expect(gemmaBlocked).toBe(false);
  });

  it("returns false and cleans up when block timestamp has expired", async () => {
    const pastTimestamp = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute ago
    mockFindUnique.mockResolvedValue({
      key: "AI_PROVIDER_PARSING_GEMINI_BLOCKED_UNTIL",
      value: pastTimestamp,
    });
    mockDelete.mockResolvedValue({});

    const result = await isProviderBlocked("AI_PROVIDER_PARSING", "gemini");

    expect(result).toBe(false);
    expect(mockDelete).toHaveBeenCalledWith({
      where: { key: "AI_PROVIDER_PARSING_GEMINI_BLOCKED_UNTIL" },
    });
  });

  it("returns false and resets when stored value is an invalid date string", async () => {
    mockFindUnique.mockResolvedValue({
      key: "AI_PROVIDER_PARSING_GEMINI_BLOCKED_UNTIL",
      value: "not-a-date",
    });
    mockDelete.mockResolvedValue({});

    const result = await isProviderBlocked("AI_PROVIDER_PARSING", "gemini");

    expect(result).toBe(false);
    expect(mockDelete).toHaveBeenCalled();
  });

  it("fails open (returns false) when DB check throws an error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB connection lost"));

    // Should not throw, should return false (fail open)
    const result = await isProviderBlocked("AI_PROVIDER_PARSING", "gemini");

    expect(result).toBe(false);
  });
});

describe("Circuit Breaker — blockProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("upserts the BLOCKED_UNTIL key (scoped to capability+provider) with a future timestamp", async () => {
    mockUpsert.mockResolvedValue({});

    const before = Date.now();
    await blockProvider("AI_PROVIDER_PARSING", "gemini", 60 * 60 * 1000);
    const after = Date.now();

    expect(mockUpsert).toHaveBeenCalledTimes(1);

    const call = mockUpsert.mock.calls[0][0];
    expect(call.where).toEqual({
      key: "AI_PROVIDER_PARSING_GEMINI_BLOCKED_UNTIL",
    });

    // Verify the stored timestamp is between before + 1hr and after + 1hr
    const storedTimestamp = new Date(call.create.value).getTime();
    expect(storedTimestamp).toBeGreaterThanOrEqual(before + 60 * 60 * 1000);
    expect(storedTimestamp).toBeLessThanOrEqual(after + 60 * 60 * 1000);
  });

  it("uses the default 1-hour cooldown when no cooldownMs is provided", async () => {
    mockUpsert.mockResolvedValue({});

    const before = Date.now();
    await blockProvider("AI_PROVIDER_SUMMARIES", "claude");

    const call = mockUpsert.mock.calls[0][0];
    const storedTime = new Date(call.create.value).getTime();

    // Should be approximately 1 hour in the future (within 5 seconds of test execution)
    expect(storedTime).toBeGreaterThan(before + 59 * 60 * 1000);
    expect(storedTime).toBeLessThan(before + 61 * 60 * 1000);
  });

  it("does not throw if the DB upsert fails", async () => {
    mockUpsert.mockRejectedValue(new Error("DB write error"));

    // Should not propagate the error
    await expect(
      blockProvider("AI_PROVIDER_PARSING", "gemini"),
    ).resolves.not.toThrow();
  });
});

describe("Circuit Breaker — resetProviderBlock", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deletes the BLOCKED_UNTIL key scoped to capability+provider", async () => {
    mockDelete.mockResolvedValue({});

    await resetProviderBlock("AI_PROVIDER_PARSING", "gemini");

    expect(mockDelete).toHaveBeenCalledWith({
      where: { key: "AI_PROVIDER_PARSING_GEMINI_BLOCKED_UNTIL" },
    });
  });

  it("does not throw if the record does not exist (P2025)", async () => {
    const notFoundError = new Error("Record to delete does not exist.");
    (notFoundError as Error & { code: string }).code = "P2025";
    mockDelete.mockRejectedValue(notFoundError);

    await expect(
      resetProviderBlock("AI_PROVIDER_PARSING", "gemini"),
    ).resolves.not.toThrow();
  });

  it("rethrows non-P2025 DB errors", async () => {
    const dbError = new Error("DB connection lost");
    (dbError as Error & { code: string }).code = "P5000";
    mockDelete.mockRejectedValue(dbError);

    // Should not throw — the error is logged but swallowed for resilience
    await expect(
      resetProviderBlock("AI_PROVIDER_PARSING", "gemini"),
    ).resolves.not.toThrow();
  });
});

describe("Circuit Breaker — withCircuitBreaker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsert.mockResolvedValue({});
  });

  it("returns the result of the wrapped function on success", async () => {
    const result = await withCircuitBreaker(
      "AI_PROVIDER_PARSING",
      "gemini",
      async () => "success-value",
    );

    expect(result).toBe("success-value");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("blocks the (capability, provider) pair and re-throws on HTTP 429 error (status property)", async () => {
    const rateLimitError = Object.assign(new Error("Rate limit exceeded"), {
      status: 429,
    });

    await expect(
      withCircuitBreaker("AI_PROVIDER_PARSING", "gemini", async () => {
        throw rateLimitError;
      }),
    ).rejects.toThrow("Rate limit exceeded");

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0][0].where).toEqual({
      key: "AI_PROVIDER_PARSING_GEMINI_BLOCKED_UNTIL",
    });
  });

  it("blocks the (capability, provider) pair on HTTP 401 error (statusCode property)", async () => {
    const authError = Object.assign(new Error("Unauthorized"), {
      statusCode: 401,
    });

    await expect(
      withCircuitBreaker("AI_PROVIDER_SUMMARIES", "claude", async () => {
        throw authError;
      }),
    ).rejects.toThrow("Unauthorized");

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0][0].where).toEqual({
      key: "AI_PROVIDER_SUMMARIES_CLAUDE_BLOCKED_UNTIL",
    });
  });

  it("blocks a gemma-26b failure under its own key, distinct from gemini", async () => {
    const rateLimitError = Object.assign(new Error("Rate limit exceeded"), {
      status: 429,
    });

    await expect(
      withCircuitBreaker("AI_PROVIDER_PARSING", "gemma-26b", async () => {
        throw rateLimitError;
      }),
    ).rejects.toThrow("Rate limit exceeded");

    expect(mockUpsert.mock.calls[0][0].where).toEqual({
      key: "AI_PROVIDER_PARSING_GEMMA-26B_BLOCKED_UNTIL",
    });
  });

  it("blocks the provider on HTTP 402 error detected in message string", async () => {
    const quotaError = new Error(
      "Request failed with status 402 Payment Required",
    );

    await expect(
      withCircuitBreaker("AI_PROVIDER_PARSING", "gemini", async () => {
        throw quotaError;
      }),
    ).rejects.toThrow("402");

    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("re-throws non-blocking errors WITHOUT blocking the provider", async () => {
    const serverError = Object.assign(new Error("Internal server error"), {
      status: 500,
    });

    await expect(
      withCircuitBreaker("AI_PROVIDER_PARSING", "gemini", async () => {
        throw serverError;
      }),
    ).rejects.toThrow("Internal server error");

    // Provider should NOT be blocked for a 500 error
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("re-throws generic errors (no status code) WITHOUT blocking", async () => {
    const genericError = new Error("Network connection refused");

    await expect(
      withCircuitBreaker("AI_PROVIDER_PARSING", "gemini", async () => {
        throw genericError;
      }),
    ).rejects.toThrow("Network connection refused");

    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
