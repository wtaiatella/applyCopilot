/**
 * @jest-environment node
 */
import "dotenv/config";
import { GET as getConfigHandler, POST as postConfigHandler } from "@/app/api/admin/llm-config/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

describe("LLM Configuration Integration Tests (GET + POST /api/admin/llm-config)", () => {
  const mockAuth = auth as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Clean up connection pools
    await prisma.$disconnect();
    await pool.end();
  });

  describe("GET /api/admin/llm-config", () => {
    it("should return 401 if unauthenticated", async () => {
      mockAuth.mockResolvedValue(null);

      const res = await getConfigHandler();
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("should return 403 if user is not ADMIN", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "test-user-id", email: "user@example.com", role: "USER" },
        expires: "any",
      });

      const res = await getConfigHandler();
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("Forbidden");
    });

    it("should return config and credentialStatus for ADMIN", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "admin-user-id", email: "wtaiatella@gmail.com", role: "ADMIN" },
        expires: "any",
      });

      // Temporarily mock environment variables
      const originalOllama = process.env.OLLAMA_BASE_URL;
      const originalGemini = process.env.GEMINI_API_KEY;
      const originalClaude = process.env.CLAUDE_API_KEY;

      process.env.OLLAMA_BASE_URL = "http://localhost:11434";
      process.env.GEMINI_API_KEY = "your-gemini-api-key-here"; // placeholder
      process.env.CLAUDE_API_KEY = ""; // empty

      const res = await getConfigHandler();
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.config).toBeDefined();
      expect(data.config.defaultProvider).toBeDefined();
      expect(data.credentialStatus).toBeDefined();
      expect(data.credentialStatus.ollama).toBe(true);
      expect(data.credentialStatus.gemini).toBe(false);
      expect(data.credentialStatus.claude).toBe(false);

      // Restore env
      process.env.OLLAMA_BASE_URL = originalOllama;
      process.env.GEMINI_API_KEY = originalGemini;
      process.env.CLAUDE_API_KEY = originalClaude;
    });
  });

  describe("POST /api/admin/llm-config", () => {
    it("should return 401 if unauthenticated", async () => {
      mockAuth.mockResolvedValue(null);

      const req = new Request("http://localhost:3000/api/admin/llm-config", {
        method: "POST",
        body: JSON.stringify({
          defaultProvider: "ollama",
          parsingProvider: "gemini",
          summariesProvider: "claude",
        }),
      });

      const res = await postConfigHandler(req);
      expect(res.status).toBe(401);
    });

    it("should return 403 if user is not ADMIN", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "test-user-id", email: "user@example.com", role: "USER" },
        expires: "any",
      });

      const req = new Request("http://localhost:3000/api/admin/llm-config", {
        method: "POST",
        body: JSON.stringify({
          defaultProvider: "ollama",
          parsingProvider: "gemini",
          summariesProvider: "claude",
        }),
      });

      const res = await postConfigHandler(req);
      expect(res.status).toBe(403);
    });

    it("should return 400 if validation fails", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "admin-user-id", email: "wtaiatella@gmail.com", role: "ADMIN" },
        expires: "any",
      });

      const req = new Request("http://localhost:3000/api/admin/llm-config", {
        method: "POST",
        body: JSON.stringify({
          defaultProvider: "ollama",
          parsingProvider: "invalid-provider", // invalid
          summariesProvider: "claude",
        }),
      });

      const res = await postConfigHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Validation failed");
      expect(data.details).toBeDefined();
      expect(data.details[0].field).toBe("parsingProvider");
    });

    it("should successfully update and return 200 for ADMIN", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "admin-user-id", email: "wtaiatella@gmail.com", role: "ADMIN" },
        expires: "any",
      });

      // Save current config to restore later
      const originalDefault = await prisma.systemConfig.findUnique({ where: { key: "AI_PROVIDER_DEFAULT" } });
      const originalParsing = await prisma.systemConfig.findUnique({ where: { key: "AI_PROVIDER_PARSING" } });
      const originalSummaries = await prisma.systemConfig.findUnique({ where: { key: "AI_PROVIDER_SUMMARIES" } });

      const req = new Request("http://localhost:3000/api/admin/llm-config", {
        method: "POST",
        body: JSON.stringify({
          defaultProvider: "ollama",
          parsingProvider: "gemini",
          summariesProvider: "claude",
        }),
      });

      const res = await postConfigHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.updated.parsingProvider).toBe("gemini");

      // Verify db updated
      const parsingInDb = await prisma.systemConfig.findUnique({ where: { key: "AI_PROVIDER_PARSING" } });
      expect(parsingInDb?.value).toBe("gemini");

      // Restore DB original config
      if (originalDefault) {
        await prisma.systemConfig.upsert({
          where: { key: "AI_PROVIDER_DEFAULT" },
          create: { key: "AI_PROVIDER_DEFAULT", value: originalDefault.value },
          update: { value: originalDefault.value },
        });
      }
      if (originalParsing) {
        await prisma.systemConfig.upsert({
          where: { key: "AI_PROVIDER_PARSING" },
          create: { key: "AI_PROVIDER_PARSING", value: originalParsing.value },
          update: { value: originalParsing.value },
        });
      }
      if (originalSummaries) {
        await prisma.systemConfig.upsert({
          where: { key: "AI_PROVIDER_SUMMARIES" },
          create: { key: "AI_PROVIDER_SUMMARIES", value: originalSummaries.value },
          update: { value: originalSummaries.value },
        });
      }
    });
  });
});
