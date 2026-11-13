/**
 * @jest-environment node
 */

jest.mock("@/lib/logging/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  AIServiceUnavailableError,
  AIWorkerBackoffError,
  generateJSON,
  generateText,
  resolveAIConfig,
} from "@/lib/ai/aiClient";

function makeJsonResponse(
  body: unknown,
  init: { status?: number; ok?: boolean; headers?: Record<string, string> } = {},
) {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  const headerMap = new Map(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );

  return {
    ok,
    status,
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    },
    json: jest.fn().mockResolvedValue(body),
  };
}

describe("aiClient (LiteLLM Gateway)", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      LITELLM_BASE_URL: "http://127.0.0.1:4000/v1",
      LITELLM_API_KEY: "sk-litellm-test-secret-key",
      LITELLM_TIMEOUT_MS: "15000",
    };
    delete process.env.LITELLM_LOCAL_ROUTES;
    delete process.env.GEMINI_EMBEDDING_MODEL;

    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe("Gateway routing, headers, alias selection & AbortSignal", () => {
    it("posts to ${LITELLM_BASE_URL}/chat/completions with Bearer auth, chat-free default, and AbortSignal", async () => {
      const timeoutSpy = jest.spyOn(AbortSignal, "timeout");
      fetchMock.mockResolvedValue(
        makeJsonResponse({
          choices: [{ message: { content: "Hello from LiteLLM" } }],
        }),
      );

      const result = await generateText(
        "Say hello",
        "cv.parse.basicData",
        "You are helpful.",
      );

      expect(result).toBe("Hello from LiteLLM");
      expect(timeoutSpy).toHaveBeenCalledWith(15000);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:4000/v1/chat/completions");
      expect(options.method).toBe("POST");
      expect(options.headers).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer sk-litellm-test-secret-key",
      });
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.parse(options.body)).toEqual({
        model: "chat-free",
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Say hello" },
        ],
      });
    });

    it("normalizes trailing slashes on LITELLM_BASE_URL and uses default timeout when unset", async () => {
      process.env.LITELLM_BASE_URL = "http://gateway.internal:4000/v1///";
      delete process.env.LITELLM_TIMEOUT_MS;
      const timeoutSpy = jest.spyOn(AbortSignal, "timeout");

      fetchMock.mockResolvedValue(
        makeJsonResponse({
          choices: [{ message: { content: "ok" } }],
        }),
      );

      await generateText("ping");

      expect(timeoutSpy).toHaveBeenCalledWith(60000);
      expect(fetchMock.mock.calls[0][0]).toBe(
        "http://gateway.internal:4000/v1/chat/completions",
      );
    });

    it("selects local-only alias for routes configured in LITELLM_LOCAL_ROUTES", async () => {
      process.env.LITELLM_LOCAL_ROUTES = "cv.parse.basicData, jobs.classification";
      fetchMock.mockResolvedValue(
        makeJsonResponse({
          choices: [{ message: { content: "local response" } }],
        }),
      );

      // Direct route ID in LITELLM_LOCAL_ROUTES
      await generateText("prompt 1", "jobs.classification");
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("local-only");

      // Legacy capability "parsing" normalizes to "cv.parse.basicData"
      await generateText("prompt 2", "parsing");
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe("local-only");

      // Route not in LITELLM_LOCAL_ROUTES defaults to "chat-free"
      await generateText("prompt 3", "profile.skillsSuggest");
      expect(JSON.parse(fetchMock.mock.calls[2][1].body).model).toBe("chat-free");
    });
  });

  describe("generateJSON", () => {
    it("strips ```json and ``` markdown fences and parses valid JSON", async () => {
      fetchMock
        .mockResolvedValueOnce(
          makeJsonResponse({
            choices: [{ message: { content: '```json\n{"name":"Alice","count":2}\n```' } }],
          }),
        )
        .mockResolvedValueOnce(
          makeJsonResponse({
            choices: [{ message: { content: '```\n{"ok":true}\n```' } }],
          }),
        );

      const first = await generateJSON<{ name: string; count: number }>(
        "extract",
        "cv.parse.basicData",
      );
      expect(first).toEqual({ name: "Alice", count: 2 });

      const second = await generateJSON<{ ok: boolean }>("check", "default");
      expect(second).toEqual({ ok: true });
    });

    it("throws SyntaxError when response is invalid JSON", async () => {
      fetchMock.mockResolvedValue(
        makeJsonResponse({
          choices: [{ message: { content: "```json\n{not valid json\n```" } }],
        }),
      );

      await expect(generateJSON("extract", "cv.parse.basicData")).rejects.toThrow(
        SyntaxError,
      );
    });
  });

  describe("Error mapping", () => {
    const assertSanitizedMessage = (err: Error) => {
      expect(err.message).not.toContain("127.0.0.1");
      expect(err.message).not.toContain("4000");
      expect(err.message).not.toContain("sk-litellm-test-secret-key");
      expect(err.message).not.toContain("http://");
    };

    describe("interactive routes -> AIServiceUnavailableError (sanitized)", () => {
      it("throws AIServiceUnavailableError when LITELLM_API_KEY is missing", async () => {
        delete process.env.LITELLM_API_KEY;

        let caught: unknown;
        try {
          await generateText("hello", "cv.parse.basicData");
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(AIServiceUnavailableError);
        assertSanitizedMessage(caught as Error);
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it.each([429, 500, 502, 503])(
        "maps HTTP %s to sanitized AIServiceUnavailableError",
        async (status) => {
          fetchMock.mockResolvedValue(makeJsonResponse({}, { status, ok: false }));

          let caught: unknown;
          try {
            await generateText("hello", "profile.summaryGenerate");
          } catch (err) {
            caught = err;
          }

          expect(caught).toBeInstanceOf(AIServiceUnavailableError);
          assertSanitizedMessage(caught as Error);
        },
      );

      it("maps network failures to sanitized AIServiceUnavailableError", async () => {
        fetchMock.mockRejectedValue(
          new TypeError("fetch failed: http://127.0.0.1:4000/v1/chat/completions"),
        );

        let caught: unknown;
        try {
          await generateText("hello", "cv.parse.skills");
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(AIServiceUnavailableError);
        assertSanitizedMessage(caught as Error);
      });

      it("maps timeout/AbortError to sanitized AIServiceUnavailableError", async () => {
        const timeoutErr = new DOMException("The operation timed out.", "TimeoutError");
        fetchMock.mockRejectedValue(timeoutErr);

        let caught: unknown;
        try {
          await generateText("hello", "cv.parse.education");
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(AIServiceUnavailableError);
        assertSanitizedMessage(caught as Error);
      });
    });

    describe("worker routes -> AIWorkerBackoffError", () => {
      it("throws AIWorkerBackoffError when LITELLM_API_KEY is missing", async () => {
        delete process.env.LITELLM_API_KEY;

        await expect(
          generateText("classify", "jobs.classification"),
        ).rejects.toMatchObject({
          name: "AIWorkerBackoffError",
          status: 429,
          exhaustionReason: "ALL_MODELS_UNAVAILABLE",
          retryAfterSeconds: null,
        });
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it("maps HTTP 429 with Retry-After header to AIWorkerBackoffError", async () => {
        fetchMock.mockResolvedValue(
          makeJsonResponse(
            {},
            { status: 429, ok: false, headers: { "retry-after": "120" } },
          ),
        );

        let caught: unknown;
        try {
          await generateText("classify", "jobs.classification");
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(AIWorkerBackoffError);
        expect((caught as AIWorkerBackoffError).exhaustionReason).toBe("MINUTE_QUOTA");
        expect((caught as AIWorkerBackoffError).retryAfterSeconds).toBe(120);
      });

      it("maps HTTP 429 without Retry-After header to AIWorkerBackoffError with 60s default", async () => {
        fetchMock.mockResolvedValue(makeJsonResponse({}, { status: 429, ok: false }));

        let caught: unknown;
        try {
          await generateText("sync", "profile.syncFacts");
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(AIWorkerBackoffError);
        expect((caught as AIWorkerBackoffError).exhaustionReason).toBe("MINUTE_QUOTA");
        expect((caught as AIWorkerBackoffError).retryAfterSeconds).toBe(60);
      });

      it.each([500, 503])(
        "maps HTTP %s to AIWorkerBackoffError for worker routes",
        async (status) => {
          fetchMock.mockResolvedValue(makeJsonResponse({}, { status, ok: false }));

          await expect(
            generateText("alias", "profile.skillAlias"),
          ).rejects.toMatchObject({
            name: "AIWorkerBackoffError",
            exhaustionReason: "ALL_MODELS_UNAVAILABLE",
          });
        },
      );

      it("maps network and timeout errors to AIWorkerBackoffError for worker routes", async () => {
        fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
        await expect(
          generateText("classify", "jobs.classification"),
        ).rejects.toMatchObject({
          name: "AIWorkerBackoffError",
          exhaustionReason: "ALL_MODELS_UNAVAILABLE",
        });

        fetchMock.mockRejectedValueOnce(
          new DOMException("The operation was aborted", "AbortError"),
        );
        await expect(
          generateText("classify", "jobs.classification"),
        ).rejects.toMatchObject({
          name: "AIWorkerBackoffError",
          exhaustionReason: "ALL_MODELS_UNAVAILABLE",
        });
      });
    });
  });

  describe("resolveAIConfig('embedding')", () => {
    it("returns default gemini embedding config", async () => {
      const config = await resolveAIConfig("embedding");
      expect(config).toEqual({
        provider: "gemini",
        model: "gemini-embedding-001",
      });
    });

    it("uses GEMINI_EMBEDDING_MODEL env var when configured", async () => {
      process.env.GEMINI_EMBEDDING_MODEL = "text-embedding-004";
      const config = await resolveAIConfig("embedding");
      expect(config).toEqual({
        provider: "gemini",
        model: "text-embedding-004",
      });
    });
  });
});
