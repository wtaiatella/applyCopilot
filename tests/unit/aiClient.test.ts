/**
 * @jest-environment node
 */
// Mock external AI SDK dependencies to prevent Jest ESM parsing issues
jest.mock("@google/genai", () => {
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      models: {
        generateContent: jest.fn(),
      },
    })),
  };
});

jest.mock("ollama", () => {
  return {
    Ollama: jest.fn().mockImplementation(() => ({
      chat: jest.fn(),
    })),
  };
});

// Mock the database client
jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemConfig: {
      findUnique: jest.fn(),
    },
  },
}));

import { resolveAIConfig } from "@/lib/ai/aiClient";
import { prisma } from "@/lib/db/prisma";

describe("Dynamic AI Router Configuration Resolution", () => {
  const findUniqueMock = prisma.systemConfig.findUnique as jest.Mock;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // Clear relevant environment variables to start clean
    delete process.env.AI_PROVIDER_DEFAULT;
    delete process.env.AI_PROVIDER_PARSING;
    delete process.env.AI_PROVIDER_SUMMARIES;
    delete process.env.OLLAMA_MODEL;
    delete process.env.GEMINI_MODEL;
    delete process.env.CLAUDE_MODEL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("should resolve provider and model from database SystemConfig first", async () => {
    // Mock database entries
    findUniqueMock.mockImplementation(async ({ where }: { where: { key: string } }) => {
      if (where.key === "AI_PROVIDER_PARSING") {
        return { key: "AI_PROVIDER_PARSING", value: "gemini" };
      }
      if (where.key === "GEMINI_MODEL") {
        return { key: "GEMINI_MODEL", value: "gemini-2.5-pro" };
      }
      return null;
    });

    const config = await resolveAIConfig("parsing");
    expect(config.provider).toBe("gemini");
    expect(config.model).toBe("gemini-2.5-pro");
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { key: "AI_PROVIDER_PARSING" } });
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { key: "GEMINI_MODEL" } });
  });

  it("should fallback to database default provider if capability provider is not set in DB", async () => {
    findUniqueMock.mockImplementation(async ({ where }: { where: { key: string } }) => {
      if (where.key === "AI_PROVIDER_DEFAULT") {
        return { key: "AI_PROVIDER_DEFAULT", value: "claude" };
      }
      if (where.key === "CLAUDE_MODEL") {
        return { key: "CLAUDE_MODEL", value: "claude-3-opus" };
      }
      return null;
    });

    const config = await resolveAIConfig("parsing");
    expect(config.provider).toBe("claude");
    expect(config.model).toBe("claude-3-opus");
  });

  it("should fallback to environment variables when database config is not found", async () => {
    findUniqueMock.mockResolvedValue(null);

    process.env.AI_PROVIDER_PARSING = "gemini";
    process.env.GEMINI_MODEL = "gemini-1.5-flash";

    const config = await resolveAIConfig("parsing");
    expect(config.provider).toBe("gemini");
    expect(config.model).toBe("gemini-1.5-flash");
  });

  it("should fallback to environment variables if database resolution throws an error", async () => {
    findUniqueMock.mockRejectedValue(new Error("Database connection timeout"));

    process.env.AI_PROVIDER_SUMMARIES = "claude";
    process.env.CLAUDE_MODEL = "claude-3-5-sonnet-latest";

    const config = await resolveAIConfig("summaries");
    expect(config.provider).toBe("claude");
    expect(config.model).toBe("claude-3-5-sonnet-latest");
  });

  it("should fallback to global defaults if both database and env configs are missing", async () => {
    findUniqueMock.mockResolvedValue(null);

    const config = await resolveAIConfig("default");
    expect(config.provider).toBe("ollama");
    expect(config.model).toBe("granite4.1:8b");
  });
});
