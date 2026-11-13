/**
 * @jest-environment node
 */

import {
  DEFAULT_COOLDOWN_MS,
  BLOCKING_HTTP_STATUSES,
  isBlockingHttpStatus,
  getBlockedUntilKey,
  blockProvider,
  resetProviderBlock,
  isProviderBlocked,
  withCircuitBreaker,
} from "@/lib/ai/circuit-breaker";

// Mock the Prisma client (include aIModel spies to assert zero calls)
jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    aIModel: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    systemConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import { prisma } from "@/lib/db/prisma";

const mockConfigFindUnique = prisma.systemConfig.findUnique as jest.Mock;
const mockConfigUpsert = prisma.systemConfig.upsert as jest.Mock;
const mockConfigDelete = prisma.systemConfig.delete as jest.Mock;
const mockModelFindUnique = prisma.aIModel.findUnique as jest.Mock;
const mockModelUpdate = prisma.aIModel.update as jest.Mock;

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

describe("Circuit Breaker — SystemConfig Provider Block Management", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    expect(mockModelFindUnique).not.toHaveBeenCalled();
    expect(mockModelUpdate).not.toHaveBeenCalled();
  });

  describe("getBlockedUntilKey", () => {
    it("formats the SystemConfig key with uppercased provider", () => {
      expect(getBlockedUntilKey("AI_PARSING_MODEL", "google")).toBe(
        "AI_PARSING_MODEL_GOOGLE_BLOCKED_UNTIL",
      );
      expect(getBlockedUntilKey("AI_SUMMARIES_MODEL", "LiteLLM")).toBe(
        "AI_SUMMARIES_MODEL_LITELLM_BLOCKED_UNTIL",
      );
    });
  });

  describe("blockProvider", () => {
    it("upserts *_BLOCKED_UNTIL in SystemConfig with default cooldown", async () => {
      mockConfigUpsert.mockResolvedValue({});
      const before = Date.now();

      await blockProvider("AI_PARSING_MODEL", "google");

      const after = Date.now();
      expect(mockConfigUpsert).toHaveBeenCalledTimes(1);
      const callArg = mockConfigUpsert.mock.calls[0][0];
      expect(callArg.where).toEqual({
        key: "AI_PARSING_MODEL_GOOGLE_BLOCKED_UNTIL",
      });
      expect(callArg.create.key).toBe("AI_PARSING_MODEL_GOOGLE_BLOCKED_UNTIL");
      expect(callArg.update.value).toBe(callArg.create.value);

      const persistedMs = new Date(callArg.create.value).getTime();
      expect(persistedMs).toBeGreaterThanOrEqual(before + DEFAULT_COOLDOWN_MS);
      expect(persistedMs).toBeLessThanOrEqual(after + DEFAULT_COOLDOWN_MS);
    });

    it("uses custom cooldownMs when provided", async () => {
      mockConfigUpsert.mockResolvedValue({});
      const customCooldown = 30_000;
      const before = Date.now();

      await blockProvider("AI_PROFILE_MODEL", "openai", customCooldown);

      const after = Date.now();
      const callArg = mockConfigUpsert.mock.calls[0][0];
      const persistedMs = new Date(callArg.create.value).getTime();
      expect(persistedMs).toBeGreaterThanOrEqual(before + customCooldown);
      expect(persistedMs).toBeLessThanOrEqual(after + customCooldown);
    });
  });

  describe("isProviderBlocked (key symmetry)", () => {
    it("queries the same key written by blockProvider when provider is passed", async () => {
      mockConfigFindUnique.mockResolvedValue({
        key: "AI_PARSING_MODEL_GOOGLE_BLOCKED_UNTIL",
        value: new Date(Date.now() + 60_000).toISOString(),
      });

      const blocked = await isProviderBlocked("AI_PARSING_MODEL", "google");

      expect(blocked).toBe(true);
      expect(mockConfigFindUnique).toHaveBeenCalledWith({
        where: { key: "AI_PARSING_MODEL_GOOGLE_BLOCKED_UNTIL" },
      });
    });

    it("queries <providerConfigKey>_BLOCKED_UNTIL when provider is omitted", async () => {
      mockConfigFindUnique.mockResolvedValue({
        key: "AI_PARSING_MODEL_BLOCKED_UNTIL",
        value: new Date(Date.now() + 60_000).toISOString(),
      });

      const blocked = await isProviderBlocked("AI_PARSING_MODEL");

      expect(blocked).toBe(true);
      expect(mockConfigFindUnique).toHaveBeenCalledWith({
        where: { key: "AI_PARSING_MODEL_BLOCKED_UNTIL" },
      });
    });

    it("returns false when no SystemConfig record exists", async () => {
      mockConfigFindUnique.mockResolvedValue(null);

      const blocked = await isProviderBlocked("AI_PARSING_MODEL", "google");

      expect(blocked).toBe(false);
    });

    it("returns false when the stored blockedUntil timestamp is in the past", async () => {
      mockConfigFindUnique.mockResolvedValue({
        key: "AI_PARSING_MODEL_GOOGLE_BLOCKED_UNTIL",
        value: new Date(Date.now() - 60_000).toISOString(),
      });

      const blocked = await isProviderBlocked("AI_PARSING_MODEL", "google");

      expect(blocked).toBe(false);
    });

    it("returns false if SystemConfig lookup throws", async () => {
      mockConfigFindUnique.mockRejectedValue(new Error("DB unavailable"));

      const blocked = await isProviderBlocked("AI_PARSING_MODEL", "google");

      expect(blocked).toBe(false);
    });
  });

  describe("resetProviderBlock", () => {
    it("deletes the *_BLOCKED_UNTIL key from SystemConfig", async () => {
      mockConfigDelete.mockResolvedValue({});

      await resetProviderBlock("AI_PARSING_MODEL", "google");

      expect(mockConfigDelete).toHaveBeenCalledWith({
        where: { key: "AI_PARSING_MODEL_GOOGLE_BLOCKED_UNTIL" },
      });
    });

    it("ignores errors when the SystemConfig record does not exist", async () => {
      mockConfigDelete.mockRejectedValue(new Error("Record to delete not found"));

      await expect(
        resetProviderBlock("AI_PARSING_MODEL", "google"),
      ).resolves.toBeUndefined();
    });
  });

  describe("withCircuitBreaker", () => {
    it("returns fn result without persisting a block on success", async () => {
      const result = await withCircuitBreaker(
        "AI_PARSING_MODEL",
        "google",
        async () => "ok",
      );

      expect(result).toBe("ok");
      expect(mockConfigUpsert).not.toHaveBeenCalled();
    });

    it.each([429, 401, 402])(
      "blocks provider in SystemConfig and rethrows on HTTP %i",
      async (statusCode) => {
        mockConfigUpsert.mockResolvedValue({});
        const err = Object.assign(new Error(`HTTP ${statusCode}`), {
          status: statusCode,
        });

        await expect(
          withCircuitBreaker("AI_PARSING_MODEL", "google", async () => {
            throw err;
          }),
        ).rejects.toThrow(`HTTP ${statusCode}`);

        expect(mockConfigUpsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { key: "AI_PARSING_MODEL_GOOGLE_BLOCKED_UNTIL" },
          }),
        );
      },
    );

    it("extracts status from statusCode, response.status, and message", async () => {
      mockConfigUpsert.mockResolvedValue({});

      const errStatusCode = Object.assign(new Error("Unauthorized"), {
        statusCode: 401,
      });
      await expect(
        withCircuitBreaker("AI_PARSING_MODEL", "openai", async () => {
          throw errStatusCode;
        }),
      ).rejects.toThrow("Unauthorized");

      const errResponse = Object.assign(new Error("Quota exceeded"), {
        response: { status: 402 },
      });
      await expect(
        withCircuitBreaker("AI_PARSING_MODEL", "openai", async () => {
          throw errResponse;
        }),
      ).rejects.toThrow("Quota exceeded");

      const errMessage = new Error("Upstream returned 429 Too Many Requests");
      await expect(
        withCircuitBreaker("AI_PARSING_MODEL", "openai", async () => {
          throw errMessage;
        }),
      ).rejects.toThrow("429");

      expect(mockConfigUpsert).toHaveBeenCalledTimes(3);
    });

    it("does not block provider on non-blocking HTTP status errors", async () => {
      const err = Object.assign(new Error("Internal Server Error"), {
        status: 500,
      });

      await expect(
        withCircuitBreaker("AI_PARSING_MODEL", "google", async () => {
          throw err;
        }),
      ).rejects.toThrow("Internal Server Error");

      expect(mockConfigUpsert).not.toHaveBeenCalled();
    });

    it("does not block provider on AIWorkerBackoffError", async () => {
      const err = Object.assign(new Error("Worker backoff 429"), {
        name: "AIWorkerBackoffError",
      });

      await expect(
        withCircuitBreaker("AI_PARSING_MODEL", "google", async () => {
          throw err;
        }),
      ).rejects.toThrow("Worker backoff 429");

      expect(mockConfigUpsert).not.toHaveBeenCalled();
    });
  });
});
