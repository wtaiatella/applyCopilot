/**
 * @jest-environment node
 */

import {
  isModelBlocked,
  blockModel,
  resetModelBlock,
  withCircuitBreaker,
  isBlockingHttpStatus,
  BLOCKING_HTTP_STATUSES,
} from "@/lib/ai/circuit-breaker";

// Mock the Prisma client
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

describe("Circuit Breaker — Model Block Management", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns false if model is not blocked", async () => {
    mockModelFindUnique.mockResolvedValue({ blockedUntil: null });
    const blocked = await isModelBlocked("model-123");
    expect(blocked).toBe(false);
  });

  it("returns true if model is currently blocked", async () => {
    mockModelFindUnique.mockResolvedValue({
      blockedUntil: new Date(Date.now() + 60000),
    });
    const blocked = await isModelBlocked("model-123");
    expect(blocked).toBe(true);
  });

  it("automatically clears expired block and returns false", async () => {
    mockModelFindUnique.mockResolvedValue({
      blockedUntil: new Date(Date.now() - 60000),
    });
    mockModelUpdate.mockResolvedValue({});

    const blocked = await isModelBlocked("model-123");
    expect(blocked).toBe(false);
    expect(mockModelUpdate).toHaveBeenCalledWith({
      where: { id: "model-123" },
      data: { blockedUntil: null },
    });
  });

  it("blocks model on blocking HTTP status error in withCircuitBreaker", async () => {
    mockModelUpdate.mockResolvedValue({});

    const err = new Error("429 Too Many Requests");
    (err as Error & { status: number }).status = 429;

    await expect(
      withCircuitBreaker("model-123", "Google AI", async () => {
        throw err;
      }),
    ).rejects.toThrow();

    expect(mockModelUpdate).toHaveBeenCalled();
  });

  it("resets model block manually", async () => {
    mockModelUpdate.mockResolvedValue({});
    await resetModelBlock("model-123");
    expect(mockModelUpdate).toHaveBeenCalledWith({
      where: { id: "model-123" },
      data: { blockedUntil: null },
    });
  });
});
