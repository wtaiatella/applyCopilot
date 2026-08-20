/**
 * @jest-environment node
 */
// Mock external AI SDKs before importing the module under test. jest.mock() factories cannot
// reference outer-scope consts (TDZ, since jest.mock is hoisted above them) — the jest.fn()s are
// created inside each factory instead, then recovered below via the constructor mock's
// `.mock.results`, since vector-service.ts instantiates one client per SDK at module load.
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      embedContent: jest.fn(),
    },
  })),
}));

jest.mock("ollama", () => ({
  Ollama: jest.fn().mockImplementation(() => ({
    embed: jest.fn(),
  })),
}));

jest.mock("@/lib/ai/aiClient", () => ({
  resolveAIConfig: jest.fn(),
}));

import {
  generateEmbedding,
  EMBEDDING_DIMENSION,
} from "@/lib/ai/vector-service";
import { resolveAIConfig } from "@/lib/ai/aiClient";
import { GoogleGenAI } from "@google/genai";
import { Ollama } from "ollama";

const mockResolveAIConfig = resolveAIConfig as jest.Mock;
const mockEmbedContent = (GoogleGenAI as unknown as jest.Mock).mock.results[0]
  .value.models.embedContent as jest.Mock;
const mockOllamaEmbed = (Ollama as unknown as jest.Mock).mock.results[0].value
  .embed as jest.Mock;

describe("Provider-Routed Vector Generation Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("exports EMBEDDING_DIMENSION as 768", () => {
    expect(EMBEDDING_DIMENSION).toBe(768);
  });

  it("should return a zero-filled EMBEDDING_DIMENSION vector when input text is empty or whitespace, without calling any provider", async () => {
    const vectorFromEmpty = await generateEmbedding("");
    expect(vectorFromEmpty.length).toBe(EMBEDDING_DIMENSION);
    expect(vectorFromEmpty.every((val) => val === 0)).toBe(true);

    const vectorFromWhitespace = await generateEmbedding("    ");
    expect(vectorFromWhitespace.length).toBe(EMBEDDING_DIMENSION);
    expect(vectorFromWhitespace.every((val) => val === 0)).toBe(true);

    expect(mockResolveAIConfig).not.toHaveBeenCalled();
    expect(mockOllamaEmbed).not.toHaveBeenCalled();
    expect(mockEmbedContent).not.toHaveBeenCalled();
  });

  it("should route to Ollama's embed() when resolveAIConfig resolves the ollama provider", async () => {
    mockResolveAIConfig.mockResolvedValue({
      provider: "ollama",
      model: "nomic-embed-text",
    });
    mockOllamaEmbed.mockResolvedValue({
      embeddings: [new Array(EMBEDDING_DIMENSION).fill(0.2)],
    });

    const vector = await generateEmbedding("Senior React Developer");

    expect(mockResolveAIConfig).toHaveBeenCalledWith("embedding");
    expect(mockOllamaEmbed).toHaveBeenCalledWith({
      model: "nomic-embed-text",
      input: "Senior React Developer",
    });
    expect(mockEmbedContent).not.toHaveBeenCalled();
    expect(vector.length).toBe(EMBEDDING_DIMENSION);
    expect(vector[0]).toBe(0.2);
  });

  it("should route to Gemini's embedContent() when resolveAIConfig resolves the gemini provider, constrained to EMBEDDING_DIMENSION", async () => {
    mockResolveAIConfig.mockResolvedValue({
      provider: "gemini",
      model: "gemini-embedding-001",
    });
    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: new Array(EMBEDDING_DIMENSION).fill(0.3) }],
    });

    const vector = await generateEmbedding("Node.js Backend Engineer");

    expect(mockResolveAIConfig).toHaveBeenCalledWith("embedding");
    expect(mockEmbedContent).toHaveBeenCalledWith({
      model: "gemini-embedding-001",
      contents: "Node.js Backend Engineer",
      config: { outputDimensionality: EMBEDDING_DIMENSION },
    });
    expect(mockOllamaEmbed).not.toHaveBeenCalled();
    expect(vector.length).toBe(EMBEDDING_DIMENSION);
    expect(vector[0]).toBe(0.3);
  });

  it("should fall back to Ollama when resolveAIConfig resolves the claude provider (no embedding API)", async () => {
    mockResolveAIConfig.mockResolvedValue({
      provider: "claude",
      model: "nomic-embed-text",
    });
    mockOllamaEmbed.mockResolvedValue({
      embeddings: [new Array(EMBEDDING_DIMENSION).fill(0.4)],
    });

    const vector = await generateEmbedding("Python Data Engineer");

    expect(mockOllamaEmbed).toHaveBeenCalledWith({
      model: "nomic-embed-text",
      input: "Python Data Engineer",
    });
    expect(mockEmbedContent).not.toHaveBeenCalled();
    expect(vector.length).toBe(EMBEDDING_DIMENSION);
  });

  it("should throw if the provider returns a vector with length other than EMBEDDING_DIMENSION", async () => {
    mockResolveAIConfig.mockResolvedValue({
      provider: "ollama",
      model: "nomic-embed-text",
    });
    mockOllamaEmbed.mockResolvedValue({
      embeddings: [new Array(256).fill(0.5)],
    });

    await expect(generateEmbedding("Tailwind CSS")).rejects.toThrow(
      `Expected embedding vector of size ${EMBEDDING_DIMENSION}, received 256`,
    );
  });

  it("should propagate provider errors (e.g. network/429) to the caller", async () => {
    mockResolveAIConfig.mockResolvedValue({
      provider: "ollama",
      model: "nomic-embed-text",
    });
    mockOllamaEmbed.mockRejectedValueOnce(new Error("Ollama unreachable"));

    await expect(generateEmbedding("React Native")).rejects.toThrow(
      "Ollama unreachable",
    );
  });
});
