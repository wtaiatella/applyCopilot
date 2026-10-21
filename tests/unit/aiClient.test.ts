/**
 * @jest-environment node
 */
// Mock external AI SDK dependencies to prevent Jest ESM parsing issues
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

// Mock the database client
jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    aIRoutePreference: {
      findUnique: jest.fn(),
    },
  },
}));

import { resolveAIRoute } from "@/lib/ai/aiClient";
import { prisma } from "@/lib/db/prisma";

describe("AI Route Configuration Resolution", () => {
  const findUniqueMock = prisma.aIRoutePreference.findUnique as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should resolve route preference from database AIRoutePreference", async () => {
    findUniqueMock.mockResolvedValue({
      routeId: "cv.parse.basicData",
      groupName: "CV Parser",
      displayName: "Parse Basic Data",
      preferredTier: "FREE",
      isWorker: false,
    });

    const route = await resolveAIRoute("cv.parse.basicData");
    expect(route.preferredTier).toBe("FREE");
    expect(route.isWorker).toBe(false);
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { routeId: "cv.parse.basicData" },
    });
  });

  it("should default to FREE tier when not found in database", async () => {
    findUniqueMock.mockResolvedValue(null);

    const route = await resolveAIRoute("jobs.classification");
    expect(route.preferredTier).toBe("FREE");
    expect(route.isWorker).toBe(true);
  });
});
