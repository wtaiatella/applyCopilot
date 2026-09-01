import { GoogleGenAIAdapter } from "../../src/lib/ai/adapters/googleGenAIAdapter";
import { OpenAICompatAdapter } from "../../src/lib/ai/adapters/openAICompatAdapter";
import { OllamaAdapter } from "../../src/lib/ai/adapters/ollamaAdapter";

// Mock @google/genai
jest.mock("@google/genai", () => {
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      models: {
        generateContent: jest.fn().mockResolvedValue({
          text: '{"result": "google_success"}',
        }),
      },
    })),
  };
});

// Mock ollama
jest.mock("ollama", () => {
  return {
    Ollama: jest.fn().mockImplementation(() => ({
      chat: jest.fn().mockResolvedValue({
        message: { content: '{"result": "ollama_success"}' },
      }),
    })),
  };
});

describe("Protocol Adapters Unit Tests", () => {
  const dummyModel = {
    id: "m1",
    providerId: "p1",
    displayName: "Test Model",
    modelId: "test-model-id",
    tier: "FREE" as const,
    rpm: 15,
    rpd: 500,
    tpm: 250000,
    tpd: 1000000,
    safetyMargin: 0.9,
    isEnabled: true,
    blockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const dummyProvider = {
    id: "p1",
    name: "Google AI",
    sdkType: "GOOGLE_GENAI" as const,
    apiKeyEnvVar: "GEMINI_API_KEY",
    baseUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("GoogleGenAIAdapter executes text and JSON correctly", async () => {
    const textRes = await GoogleGenAIAdapter.executeText(
      "test prompt",
      dummyModel,
      dummyProvider,
    );
    expect(textRes).toContain("google_success");

    const jsonRes = await GoogleGenAIAdapter.executeJSON<{ result: string }>(
      "test prompt",
      dummyModel,
      dummyProvider,
    );
    expect(jsonRes.result).toBe("google_success");
  });

  it("OpenAICompatAdapter executes HTTP calls correctly", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: '{"result": "openai_compat_success"}',
            },
          },
        ],
      }),
    } as unknown as Response);

    try {
      const openAIProvider = {
        ...dummyProvider,
        name: "OpenRouter",
        sdkType: "OPENAI_COMPATIBLE" as const,
        apiKeyEnvVar: "OPENROUTER_API_KEY",
        baseUrl: "https://openrouter.ai/api/v1",
      };

      const textRes = await OpenAICompatAdapter.executeText(
        "test prompt",
        dummyModel,
        openAIProvider,
      );
      expect(textRes).toContain("openai_compat_success");

      const jsonRes = await OpenAICompatAdapter.executeJSON<{ result: string }>(
        "test prompt",
        dummyModel,
        openAIProvider,
      );
      expect(jsonRes.result).toBe("openai_compat_success");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("OllamaAdapter executes local requests correctly", async () => {
    const textRes = await OllamaAdapter.executeText("test prompt");
    expect(textRes).toContain("ollama_success");

    const jsonRes = await OllamaAdapter.executeJSON<{ result: string }>(
      "test prompt",
    );
    expect(jsonRes.result).toBe("ollama_success");
  });
});
