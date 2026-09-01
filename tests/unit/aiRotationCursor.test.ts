import { acquireNextAvailableFreeModel } from "../../src/lib/ai/rotation-cursor";
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
});
