/**
 * @jest-environment node
 */
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: jest.fn(),
    },
  })),
}));

jest.mock("ollama", () => ({
  Ollama: jest.fn().mockImplementation(() => ({
    chat: jest.fn(),
  })),
}));

import {
  generateText,
  generateJSON,
  getActiveUserRequestCount,
  AIServiceUnavailableError,
  AIWorkerBackoffError,
} from "../../src/lib/ai/aiClient";
import {
  evaluateAndLazyReset,
  floorToMinute,
  floorToUtcDay,
} from "../../src/lib/ai/quota-manager";
import { withCircuitBreaker } from "../../src/lib/ai/circuit-breaker";
import { prisma } from "../../src/lib/db/prisma";
import { GoogleGenAIAdapter } from "../../src/lib/ai/adapters/googleGenAIAdapter";
import { OllamaAdapter } from "../../src/lib/ai/adapters/ollamaAdapter";

describe("AI Dispatcher Integration Tests", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await prisma.aIModel.updateMany({
      where: { tier: "FREE" },
      data: { blockedUntil: null, isEnabled: true },
    });
    await prisma.aIUsageCounter.updateMany({
      data: { countRequestsMin: 0, countRequestsDay: 0 },
    });
  });

  afterAll(async () => {
    await prisma.aIModel.updateMany({
      where: { tier: "FREE" },
      data: { blockedUntil: null, isEnabled: true },
    });
    await prisma.aIUsageCounter.updateMany({
      data: { countRequestsMin: 0, countRequestsDay: 0 },
    });
  });

  it("routes request to available FREE tier model", async () => {
    jest.spyOn(GoogleGenAIAdapter, "executeText").mockResolvedValue("parsed_result_mock");

    const result = await generateText("Test prompt", "cv.parse.basicData");
    expect(result).toBe("parsed_result_mock");
  });

  it("falls back to Local Ollama when FREE model fails", async () => {
    jest.spyOn(GoogleGenAIAdapter, "executeText").mockRejectedValue(new Error("API rate limit error 429"));
    jest.spyOn(OllamaAdapter, "executeText").mockResolvedValue("ollama_fallback_result");

    const result = await generateText("Test prompt", "cv.parse.basicData");
    expect(result).toBe("ollama_fallback_result");
  });

  it("throws AIServiceUnavailableError (503) for synchronous routes when all providers fail", async () => {
    jest.spyOn(GoogleGenAIAdapter, "executeText").mockRejectedValue(new Error("Google error"));
    jest.spyOn(OllamaAdapter, "executeText").mockRejectedValue(new Error("Ollama connection error"));

    await expect(generateText("Test prompt", "cv.parse.basicData")).rejects.toThrow(
      AIServiceUnavailableError,
    );
  });

  it("throws AIWorkerBackoffError (429/pause) for background worker routes when all providers fail", async () => {
    jest.spyOn(GoogleGenAIAdapter, "executeJSON").mockRejectedValue(new Error("Google error"));
    jest.spyOn(OllamaAdapter, "executeJSON").mockRejectedValue(new Error("Ollama connection error"));

    await expect(generateJSON("Test prompt", "jobs.classification")).rejects.toThrow(
      AIWorkerBackoffError,
    );
  });

  it("enriches AIWorkerBackoffError with exhaustionReason and retryAfterSeconds from rotation cursor", async () => {
    const freeModels = await prisma.aIModel.findMany({
      where: { tier: "FREE", isEnabled: true },
    });
    const now = new Date();
    const minStart = floorToMinute(now);
    const dayStart = floorToUtcDay(now);

    for (const model of freeModels) {
      const evalLimits = evaluateAndLazyReset(model, null, now);
      await prisma.aIUsageCounter.upsert({
        where: { modelId: model.id },
        create: {
          modelId: model.id,
          windowStartMin: minStart,
          countRequestsMin: evalLimits.effectiveRpm,
          countTokensMin: 0,
          windowStartDay: dayStart,
          countRequestsDay: 1,
          countTokensDay: 0,
        },
        update: {
          windowStartMin: minStart,
          countRequestsMin: evalLimits.effectiveRpm,
          windowStartDay: dayStart,
          countRequestsDay: 1,
        },
      });
    }

    jest
      .spyOn(OllamaAdapter, "executeJSON")
      .mockRejectedValue(new Error("Ollama offline"));

    let caughtError: AIWorkerBackoffError | null = null;
    try {
      await generateJSON("Test prompt", "jobs.classification");
    } catch (err) {
      caughtError = err as AIWorkerBackoffError;
    }

    expect(caughtError).toBeInstanceOf(AIWorkerBackoffError);
    expect(caughtError?.exhaustionReason).toBe("MINUTE_QUOTA");
    expect(caughtError?.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(caughtError?.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("does not write a legacy 60-minute SystemConfig block when withCircuitBreaker catches AIWorkerBackoffError", async () => {
    const testKey = "AI_PROVIDER_PARSING_TEST_BACKOFF";
    await prisma.systemConfig.deleteMany({
      where: { key: `${testKey}_BLOCKED_UNTIL` },
    });

    await expect(
      withCircuitBreaker(testKey, "gemini", async () => {
        throw new AIWorkerBackoffError("Minute quota exhausted", "MINUTE_QUOTA", 15);
      }),
    ).rejects.toThrow(AIWorkerBackoffError);

    const blockedRow = await prisma.systemConfig.findUnique({
      where: { key: `${testKey}_BLOCKED_UNTIL` },
    });
    expect(blockedRow).toBeNull();
  });

  it("prioritizes interactive user AI requests over background worker requests under scarce capacity (AC.7)", async () => {
    const freeModels = await prisma.aIModel.findMany({
      where: { tier: "FREE", isEnabled: true },
    });
    const now = new Date();
    const minStart = floorToMinute(now);
    const dayStart = floorToUtcDay(now);

    // Leave exactly 1 reserved RPM slot per FREE model (worker ceiling reached, interactive slot available)
    for (const model of freeModels) {
      const evalLimits = evaluateAndLazyReset(model, null, now, {
        isWorker: true,
      });
      await prisma.aIUsageCounter.upsert({
        where: { modelId: model.id },
        create: {
          modelId: model.id,
          windowStartMin: minStart,
          countRequestsMin: evalLimits.workerEffectiveRpm,
          countTokensMin: 0,
          windowStartDay: dayStart,
          countRequestsDay: 1,
          countTokensDay: 0,
        },
        update: {
          windowStartMin: minStart,
          countRequestsMin: evalLimits.workerEffectiveRpm,
          windowStartDay: dayStart,
          countRequestsDay: 1,
        },
      });
    }

    let observedActiveCountDuringUserCall = 0;

    jest
      .spyOn(GoogleGenAIAdapter, "executeText")
      .mockImplementation(async () => {
        observedActiveCountDuringUserCall = getActiveUserRequestCount();
        await new Promise((r) => setTimeout(r, 25));
        return "interactive_user_result";
      });

    jest
      .spyOn(OllamaAdapter, "executeJSON")
      .mockResolvedValue({ fallback: "worker_used_ollama" });

    const [userRes, workerRes] = await Promise.all([
      generateText("User CV prompt", "cv.parse.basicData"),
      generateJSON("Worker job prompt", "jobs.classification"),
    ]);

    expect(userRes).toBe("interactive_user_result");
    expect(workerRes).toEqual({ fallback: "worker_used_ollama" });
    expect(observedActiveCountDuringUserCall).toBeGreaterThanOrEqual(1);
    expect(getActiveUserRequestCount()).toBe(0);
  });
});
