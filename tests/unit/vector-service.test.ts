/**
 * @jest-environment node
 */

jest.mock("@/lib/logging/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import {
  AIServiceUnavailableError,
  AIWorkerBackoffError,
} from "@/lib/ai/aiClient";
import {
  EMBEDDING_DIMENSION,
  generateEmbedding,
} from "@/lib/ai/vector-service";

const mockFetch = jest.fn();

describe("LiteLLM Vector Generation Service (1024d)", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      LITELLM_API_KEY: "test-litellm-key",
      LITELLM_BASE_URL: "http://127.0.0.1:4000/v1",
      LITELLM_TIMEOUT_MS: "5000",
    };
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it("exports EMBEDDING_DIMENSION as 1024", () => {
    expect(EMBEDDING_DIMENSION).toBe(1024);
  });

  it("returns a zero-filled 1024d vector when input text is empty or whitespace without calling fetch", async () => {
    const vectorFromEmpty = await generateEmbedding("");
    expect(vectorFromEmpty.length).toBe(1024);
    expect(vectorFromEmpty.every((val) => val === 0)).toBe(true);

    const vectorFromWhitespace = await generateEmbedding("    ");
    expect(vectorFromWhitespace.length).toBe(1024);
    expect(vectorFromWhitespace.every((val) => val === 0)).toBe(true);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls POST ${LITELLM_BASE_URL}/embeddings with embedding-local model and Bearer auth", async () => {
    const expectedVector = new Array(1024).fill(0.25);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: expectedVector }],
      }),
    });

    const vector = await generateEmbedding("Senior TypeScript Engineer");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:4000/v1/embeddings");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer test-litellm-key",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      model: "embedding-local",
      input: "Senior TypeScript Engineer",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(vector).toEqual(expectedVector);
    expect(vector.length).toBe(1024);
  });

  it("throws AIServiceUnavailableError for interactive calls and AIWorkerBackoffError for worker calls when LITELLM_API_KEY is missing", async () => {
    delete process.env.LITELLM_API_KEY;

    await expect(generateEmbedding("React")).rejects.toBeInstanceOf(
      AIServiceUnavailableError,
    );
    await expect(
      generateEmbedding("React", { isWorker: true }),
    ).rejects.toBeInstanceOf(AIWorkerBackoffError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws with zero fallback on non-OK HTTP status, splitting interactive vs worker errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      headers: new Headers(),
    });
    await expect(generateEmbedding("Node.js")).rejects.toBeInstanceOf(
      AIServiceUnavailableError,
    );

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ "retry-after": "30" }),
    });
    try {
      await generateEmbedding("Node.js", { isWorker: true });
      throw new Error("Expected AIWorkerBackoffError");
    } catch (error) {
      expect(error).toBeInstanceOf(AIWorkerBackoffError);
      expect((error as AIWorkerBackoffError).exhaustionReason).toBe("MINUTE_QUOTA");
      expect((error as AIWorkerBackoffError).retryAfterSeconds).toBe(30);
    }

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws with zero fallback on network/timeout errors, splitting interactive vs worker errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:4000"));
    await expect(generateEmbedding("PostgreSQL")).rejects.toBeInstanceOf(
      AIServiceUnavailableError,
    );

    mockFetch.mockRejectedValueOnce(new DOMException("The operation was aborted", "TimeoutError"));
    await expect(
      generateEmbedding("PostgreSQL", { isWorker: true }),
    ).rejects.toBeInstanceOf(AIWorkerBackoffError);

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws on dimension mismatch (e.g. 768d instead of 1024d) for both interactive and worker callers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: new Array(768).fill(0.5) }],
      }),
    });
    await expect(generateEmbedding("Tailwind CSS")).rejects.toBeInstanceOf(
      AIServiceUnavailableError,
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: new Array(256).fill(0.5) }],
      }),
    });
    await expect(
      generateEmbedding("Tailwind CSS", { isWorker: true }),
    ).rejects.toBeInstanceOf(AIWorkerBackoffError);

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
