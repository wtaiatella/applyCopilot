/**
 * @jest-environment node
 */
import {
  generateText,
  generateJSON,
  AIServiceUnavailableError,
  AIWorkerBackoffError,
} from "../../src/lib/ai/aiClient";
import { withCircuitBreaker } from "../../src/lib/ai/circuit-breaker";
import { prisma } from "../../src/lib/db/prisma";

function makeGatewayResponse(
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

describe("AI Dispatcher Integration Tests (LiteLLM Gateway)", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      LITELLM_BASE_URL: "http://127.0.0.1:4000/v1",
      LITELLM_API_KEY: "sk-litellm-integration-test-key",
      LITELLM_TIMEOUT_MS: "15000",
    };
    delete process.env.LITELLM_LOCAL_ROUTES;

    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("routes request to LiteLLM gateway with chat-free alias by default", async () => {
    fetchMock.mockResolvedValue(
      makeGatewayResponse({
        choices: [{ message: { content: "parsed_result_mock" } }],
      }),
    );

    const result = await generateText("Test prompt", "cv.parse.basicData");
    expect(result).toBe("parsed_result_mock");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:4000/v1/chat/completions");
    expect(JSON.parse(options.body)).toEqual({
      model: "chat-free",
      messages: [{ role: "user", content: "Test prompt" }],
    });
  });

  it("routes request to local-only alias when configured in LITELLM_LOCAL_ROUTES", async () => {
    process.env.LITELLM_LOCAL_ROUTES = "cv.parse.basicData";
    fetchMock.mockResolvedValue(
      makeGatewayResponse({
        choices: [{ message: { content: "ollama_local_result" } }],
      }),
    );

    const result = await generateText("Test prompt", "cv.parse.basicData");
    expect(result).toBe("ollama_local_result");

    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body).model).toBe("local-only");
  });

  it("parses structured JSON from LiteLLM gateway response", async () => {
    fetchMock.mockResolvedValue(
      makeGatewayResponse({
        choices: [{ message: { content: '```json\n{"ok":true}\n```' } }],
      }),
    );

    const result = await generateJSON<{ ok: boolean }>(
      "Test prompt",
      "jobs.classification",
    );
    expect(result).toEqual({ ok: true });
  });

  it("throws AIServiceUnavailableError (503) for synchronous routes when LiteLLM gateway fails", async () => {
    fetchMock.mockResolvedValue(makeGatewayResponse({}, { status: 503 }));

    await expect(
      generateText("Test prompt", "cv.parse.basicData"),
    ).rejects.toThrow(AIServiceUnavailableError);
  });

  it("throws AIWorkerBackoffError (429/pause) for background worker routes when LiteLLM gateway fails", async () => {
    fetchMock.mockRejectedValue(new Error("Gateway connection refused"));

    await expect(
      generateJSON("Test prompt", "jobs.classification"),
    ).rejects.toThrow(AIWorkerBackoffError);
  });

  it("enriches AIWorkerBackoffError with MINUTE_QUOTA and retryAfterSeconds from Retry-After header", async () => {
    fetchMock.mockResolvedValue(
      makeGatewayResponse(
        { error: { message: "Rate limit exceeded" } },
        { status: 429, headers: { "Retry-After": "45" } },
      ),
    );

    let caughtError: AIWorkerBackoffError | null = null;
    try {
      await generateJSON("Test prompt", "jobs.classification");
    } catch (err) {
      caughtError = err as AIWorkerBackoffError;
    }

    expect(caughtError).toBeInstanceOf(AIWorkerBackoffError);
    expect(caughtError?.exhaustionReason).toBe("MINUTE_QUOTA");
    expect(caughtError?.retryAfterSeconds).toBe(45);
  });

  it("does not write a legacy SystemConfig block when withCircuitBreaker catches AIWorkerBackoffError", async () => {
    const testKey = "AI_PROVIDER_PARSING_TEST_BACKOFF";
    await prisma.systemConfig.deleteMany({
      where: {
        key: {
          in: [`${testKey}_BLOCKED_UNTIL`, `${testKey}_LITELLM_BLOCKED_UNTIL`],
        },
      },
    });

    fetchMock.mockResolvedValue(
      makeGatewayResponse({}, { status: 429, headers: { "Retry-After": "15" } }),
    );

    await expect(
      withCircuitBreaker(testKey, "litellm", async () => {
        return await generateJSON("Test prompt", "jobs.classification");
      }),
    ).rejects.toThrow(AIWorkerBackoffError);

    const blockedRow = await prisma.systemConfig.findFirst({
      where: {
        key: {
          in: [`${testKey}_BLOCKED_UNTIL`, `${testKey}_LITELLM_BLOCKED_UNTIL`],
        },
      },
    });
    expect(blockedRow).toBeNull();
  });
});
