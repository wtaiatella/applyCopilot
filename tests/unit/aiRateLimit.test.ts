/**
 * @jest-environment node
 */

jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
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

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import {
  AiRateLimitExceededError,
  assertAiRateLimit,
} from "@/lib/ai/aiRateLimit";

const mockTransaction = prisma.$transaction as jest.Mock;
const mockLoggerWarn = logger.warn as jest.Mock;

describe("assertAiRateLimit", () => {
  let mockTx: {
    aIUsageLog: {
      count: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockTx = {
      aIUsageLog: {
        count: jest.fn(),
        create: jest.fn(),
      },
    };
    mockTransaction.mockImplementation(
      async (cb: (tx: typeof mockTx) => Promise<void>) => cb(mockTx),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("allows the request and records an AIUsageLog row when count is below dailyLimit", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-11-13T12:00:00.000Z"));
    mockTx.aIUsageLog.count.mockResolvedValue(4);
    mockTx.aIUsageLog.create.mockResolvedValue({ id: "log-1" });

    await expect(
      assertAiRateLimit("user-1", "parse a CV", 5),
    ).resolves.toBeUndefined();

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTransaction.mock.calls[0][1]).toEqual({
      isolationLevel: "Serializable",
    });

    const expectedOneDayAgo = new Date("2026-11-12T12:00:00.000Z");
    expect(mockTx.aIUsageLog.count).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        action: "parse a CV",
        createdAt: { gte: expectedOneDayAgo },
      },
    });
    expect(mockTx.aIUsageLog.create).toHaveBeenCalledWith({
      data: { userId: "user-1", action: "parse a CV" },
    });
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("throws AiRateLimitExceededError and does not record usage when count equals dailyLimit", async () => {
    mockTx.aIUsageLog.count.mockResolvedValue(50);

    let caught: unknown;
    try {
      await assertAiRateLimit("user-1", "parse a CV", 50);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AiRateLimitExceededError);
    expect(caught).toMatchObject({
      name: "AiRateLimitExceededError",
      action: "parse a CV",
      dailyLimit: 50,
      message: "Rate limit reached. You can only parse a CV 50 times per day.",
    });
    expect(mockTx.aIUsageLog.create).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith("ai_rate_limit_exceeded", {
      userId: "user-1",
      action: "parse a CV",
      count: 50,
      dailyLimit: 50,
    });
  });

  it("throws AiRateLimitExceededError when count exceeds dailyLimit", async () => {
    mockTx.aIUsageLog.count.mockResolvedValue(55);

    await expect(
      assertAiRateLimit("user-2", "generate a summary", 50),
    ).rejects.toThrow(AiRateLimitExceededError);

    expect(mockTx.aIUsageLog.create).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith("ai_rate_limit_exceeded", {
      userId: "user-2",
      action: "generate a summary",
      count: 55,
      dailyLimit: 50,
    });
  });

  it("fails closed by throwing AiRateLimitExceededError on Prisma P2034 serialization conflict", async () => {
    const p2034Error = Object.create(
      Prisma.PrismaClientKnownRequestError.prototype,
    ) as Prisma.PrismaClientKnownRequestError & { code: string };
    p2034Error.code = "P2034";

    mockTransaction.mockRejectedValue(p2034Error);

    let caught: unknown;
    try {
      await assertAiRateLimit("user-3", "review bullets", 30);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AiRateLimitExceededError);
    expect(caught).toMatchObject({
      name: "AiRateLimitExceededError",
      action: "review bullets",
      dailyLimit: 30,
      message:
        "Rate limit reached. You can only review bullets 30 times per day.",
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "ai_rate_limit_serialization_conflict",
      {
        userId: "user-3",
        action: "review bullets",
      },
    );
  });

  it("rethrows non-P2034 Prisma errors without converting to AiRateLimitExceededError", async () => {
    const p2002Error = Object.create(
      Prisma.PrismaClientKnownRequestError.prototype,
    ) as Prisma.PrismaClientKnownRequestError & { code: string };
    p2002Error.code = "P2002";

    mockTransaction.mockRejectedValue(p2002Error);

    await expect(
      assertAiRateLimit("user-4", "parse a CV", 50),
    ).rejects.toBe(p2002Error);

    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("rethrows unexpected generic errors unchanged", async () => {
    const dbError = new Error("Connection terminated unexpectedly");
    mockTransaction.mockRejectedValue(dbError);

    await expect(
      assertAiRateLimit("user-5", "parse a CV", 50),
    ).rejects.toBe(dbError);

    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });
});
