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
  AIServiceUnavailableError,
  AIWorkerBackoffError,
} from "../../src/lib/ai/aiClient";
import { GoogleGenAIAdapter } from "../../src/lib/ai/adapters/googleGenAIAdapter";
import { OllamaAdapter } from "../../src/lib/ai/adapters/ollamaAdapter";

describe("AI Dispatcher Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
