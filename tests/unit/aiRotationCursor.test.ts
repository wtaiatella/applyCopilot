import {
  acquireFreeModelWithDiagnostics,
  acquireNextAvailableFreeModel,
} from "../../src/lib/ai/rotation-cursor";
import {
  evaluateAndLazyReset,
  floorToMinute,
  floorToUtcDay,
} from "../../src/lib/ai/quota-manager";
import { prisma } from "../../src/lib/db/prisma";

describe("AI Rotation Cursor Unit Tests", () => {
  beforeEach(async () => {
    // Clean up cursor, blocks, and counters for test isolation
    await prisma.aIRotationCursor.upsert({
      where: { id: 1 },
      create: { id: 1, lastModelId: null },
      update: { lastModelId: null },
    });

    await prisma.aIModel.updateMany({
      where: { tier: "FREE" },
      data: { blockedUntil: null, isEnabled: true },
    });

    await prisma.aIUsageCounter.updateMany({
      data: { countRequestsMin: 0, countRequestsDay: 0 },
    });
  });

  it("rotates through available FREE models cyclically (A -> B -> C -> A)", async () => {
    const freeModels = await prisma.aIModel.findMany({
      where: { tier: "FREE", isEnabled: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    if (freeModels.length < 2) {
      console.warn("Skipping rotation test: less than 2 free models found");
      return;
    }

    const firstSelection = await acquireNextAvailableFreeModel();
    expect(firstSelection).not.toBeNull();
    expect(firstSelection?.model.id).toBe(freeModels[0].id);

    const secondSelection = await acquireNextAvailableFreeModel();
    expect(secondSelection).not.toBeNull();
    expect(secondSelection?.model.id).toBe(freeModels[1].id);
  });

  it("automatically skips disabled models", async () => {
    const freeModels = await prisma.aIModel.findMany({
      where: { tier: "FREE", isEnabled: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    if (freeModels.length < 2) return;

    // Temporarily disable first model
    await prisma.aIModel.update({
      where: { id: freeModels[0].id },
      data: { isEnabled: false },
    });

    try {
      const selection = await acquireNextAvailableFreeModel();
      expect(selection).not.toBeNull();
      expect(selection?.model.id).not.toBe(freeModels[0].id);
      expect(selection?.model.id).toBe(freeModels[1].id);
    } finally {
      // Re-enable
      await prisma.aIModel.update({
        where: { id: freeModels[0].id },
        data: { isEnabled: true },
      });
    }
  });

  it("automatically skips blocked models", async () => {
    const freeModels = await prisma.aIModel.findMany({
      where: { tier: "FREE", isEnabled: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    if (freeModels.length < 2) return;

    // Block first model
    await prisma.aIModel.update({
      where: { id: freeModels[0].id },
      data: { blockedUntil: new Date(Date.now() + 60000) },
    });

    try {
      const selection = await acquireNextAvailableFreeModel();
      expect(selection).not.toBeNull();
      expect(selection?.model.id).toBe(freeModels[1].id);
    } finally {
      // Unblock
      await prisma.aIModel.update({
        where: { id: freeModels[0].id },
        data: { blockedUntil: null },
      });
    }
  });

  it("returns MINUTE_QUOTA exhaustion reason and retryAfterSeconds (1..60) when minute quota is exhausted but day quota remains", async () => {
    const freeModels = await prisma.aIModel.findMany({
      where: { tier: "FREE", isEnabled: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    if (freeModels.length === 0) return;

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

    const result = await acquireFreeModelWithDiagnostics({ isWorker: true });
    expect(result.resolved).toBeNull();
    expect(result.exhaustionReason).toBe("MINUTE_QUOTA");
    expect(result.retryAfterSeconds).not.toBeNull();
    expect(result.retryAfterSeconds!).toBeGreaterThanOrEqual(1);
    expect(result.retryAfterSeconds!).toBeLessThanOrEqual(60);
  });

  it("returns DAILY_QUOTA exhaustion reason when all unblocked FREE models have exhausted their daily quota", async () => {
    const freeModels = await prisma.aIModel.findMany({
      where: { tier: "FREE", isEnabled: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    if (freeModels.length === 0) return;

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
          countRequestsMin: 0,
          countTokensMin: 0,
          windowStartDay: dayStart,
          countRequestsDay: evalLimits.effectiveRpd,
          countTokensDay: 0,
        },
        update: {
          windowStartMin: minStart,
          countRequestsMin: 0,
          windowStartDay: dayStart,
          countRequestsDay: evalLimits.effectiveRpd,
        },
      });
    }

    const result = await acquireFreeModelWithDiagnostics({ isWorker: true });
    expect(result.resolved).toBeNull();
    expect(result.exhaustionReason).toBe("DAILY_QUOTA");
    expect(result.retryAfterSeconds).toBeNull();
  });

  it("returns ALL_MODELS_BLOCKED when all enabled FREE models have blockedUntil in the future", async () => {
    await prisma.aIModel.updateMany({
      where: { tier: "FREE", isEnabled: true },
      data: { blockedUntil: new Date(Date.now() + 60000) },
    });

    try {
      const result = await acquireFreeModelWithDiagnostics({ isWorker: true });
      expect(result.resolved).toBeNull();
      expect(result.exhaustionReason).toBe("ALL_MODELS_BLOCKED");
      expect(result.retryAfterSeconds).toBeNull();
    } finally {
      await prisma.aIModel.updateMany({
        where: { tier: "FREE" },
        data: { blockedUntil: null },
      });
    }
  });

  it("reserves the final RPM slot for interactive user calls while worker calls yield with MINUTE_QUOTA", async () => {
    const freeModels = await prisma.aIModel.findMany({
      where: { tier: "FREE", isEnabled: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    if (freeModels.length === 0) return;

    const now = new Date();
    const minStart = floorToMinute(now);
    const dayStart = floorToUtcDay(now);

    for (const model of freeModels) {
      const evalLimits = evaluateAndLazyReset(model, null, now, {
        isWorker: true,
      });
      await prisma.aIUsageCounter.upsert({
        where: { modelId: model.id },
        create: {
          modelId: model.id,
          windowStartMin: minStart,
          countRequestsMin: evalLimits.workerEffectiveRpm, // 1 slot left for interactive users
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

    // Worker call should yield the final reserved slot
    const workerAttempt = await acquireFreeModelWithDiagnostics({
      isWorker: true,
    });
    expect(workerAttempt.resolved).toBeNull();
    expect(workerAttempt.exhaustionReason).toBe("MINUTE_QUOTA");

    // Interactive user call should succeed using the reserved slot
    const userAttempt = await acquireFreeModelWithDiagnostics({
      isWorker: false,
    });
    expect(userAttempt.resolved).not.toBeNull();
  });
});
