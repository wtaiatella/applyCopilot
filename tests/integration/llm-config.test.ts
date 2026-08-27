/**
 * @jest-environment node
 */
import "dotenv/config";
import {
  GET as getConfigHandler,
  POST as postConfigHandler,
} from "@/app/api/admin/llm-config/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { safeCleanup } from "./helpers/test-fixtures";

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
        user: {
          id: "admin-user-id",
          email: "wtaiatella@gmail.com",
          role: "ADMIN",
        },
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
          profileProvider: "ollama",
          embeddingProvider: "ollama",
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
          profileProvider: "ollama",
          embeddingProvider: "ollama",
        }),
      });

      const res = await postConfigHandler(req);
      expect(res.status).toBe(403);
    });

    it("should return 400 if validation fails", async () => {
      mockAuth.mockResolvedValue({
        user: {
          id: "admin-user-id",
          email: "wtaiatella@gmail.com",
          role: "ADMIN",
        },
        expires: "any",
      });

      const req = new Request("http://localhost:3000/api/admin/llm-config", {
        method: "POST",
        body: JSON.stringify({
          defaultProvider: "ollama",
          parsingProvider: "invalid-provider", // invalid
          summariesProvider: "claude",
          profileProvider: "ollama",
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
        user: {
          id: "admin-user-id",
          email: "wtaiatella@gmail.com",
          role: "ADMIN",
        },
        expires: "any",
      });

      // Save current config to restore later
      const originalDefault = await prisma.systemConfig.findUnique({
        where: { key: "AI_PROVIDER_DEFAULT" },
      });
      const originalParsing = await prisma.systemConfig.findUnique({
        where: { key: "AI_PROVIDER_PARSING" },
      });
      const originalSummaries = await prisma.systemConfig.findUnique({
        where: { key: "AI_PROVIDER_SUMMARIES" },
      });
      const originalProfile = await prisma.systemConfig.findUnique({
        where: { key: "AI_PROVIDER_PROFILE" },
      });
      const originalEmbedding = await prisma.systemConfig.findUnique({
        where: { key: "AI_PROVIDER_EMBEDDING" },
      });

      const req = new Request("http://localhost:3000/api/admin/llm-config", {
        method: "POST",
        body: JSON.stringify({
          defaultProvider: "ollama",
          parsingProvider: "gemini",
          summariesProvider: "claude",
          profileProvider: "ollama",
          embeddingProvider: "ollama",
        }),
      });

      try {
        const res = await postConfigHandler(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.updated.parsingProvider).toBe("gemini");

        // Verify db updated
        const parsingInDb = await prisma.systemConfig.findUnique({
          where: { key: "AI_PROVIDER_PARSING" },
        });
        expect(parsingInDb?.value).toBe("gemini");
      } finally {
        // Restore DB original config
        if (originalDefault) {
          await prisma.systemConfig.upsert({
            where: { key: "AI_PROVIDER_DEFAULT" },
            create: {
              key: "AI_PROVIDER_DEFAULT",
              value: originalDefault.value,
            },
            update: { value: originalDefault.value },
          });
        }
        if (originalParsing) {
          await prisma.systemConfig.upsert({
            where: { key: "AI_PROVIDER_PARSING" },
            create: {
              key: "AI_PROVIDER_PARSING",
              value: originalParsing.value,
            },
            update: { value: originalParsing.value },
          });
        }
        if (originalSummaries) {
          await prisma.systemConfig.upsert({
            where: { key: "AI_PROVIDER_SUMMARIES" },
            create: {
              key: "AI_PROVIDER_SUMMARIES",
              value: originalSummaries.value,
            },
            update: { value: originalSummaries.value },
          });
        }
        if (originalProfile) {
          await prisma.systemConfig.upsert({
            where: { key: "AI_PROVIDER_PROFILE" },
            create: {
              key: "AI_PROVIDER_PROFILE",
              value: originalProfile.value,
            },
            update: { value: originalProfile.value },
          });
        }
        if (originalEmbedding) {
          await prisma.systemConfig.upsert({
            where: { key: "AI_PROVIDER_EMBEDDING" },
            create: {
              key: "AI_PROVIDER_EMBEDDING",
              value: originalEmbedding.value,
            },
            update: { value: originalEmbedding.value },
          });
        } else {
          await safeCleanup("llm-config:AI_PROVIDER_EMBEDDING delete", () =>
            prisma.systemConfig.delete({
              where: { key: "AI_PROVIDER_EMBEDDING" },
            }),
          );
        }
      }
    });
  });

  describe("embeddingProvider change side-effects (NFR: Compatibilidade de Embeddings)", () => {
    const testEmail = `llm-config-embed-test-${Date.now()}@example.com`;
    let testUserId: string;
    let testProfileId: string;
    let testJobId: string;
    let originalEmbeddingConfig: { value: string } | null;

    beforeEach(async () => {
      mockAuth.mockResolvedValue({
        user: {
          id: "admin-user-id",
          email: "wtaiatella@gmail.com",
          role: "ADMIN",
        },
        expires: "any",
      });

      originalEmbeddingConfig = await prisma.systemConfig.findUnique({
        where: { key: "AI_PROVIDER_EMBEDDING" },
      });

      const user = await prisma.user.create({
        data: {
          email: testEmail,
          password: "hashedpassword123",
          profile: {
            create: {
              firstName: "Embed",
              lastName: "Tester",
              embeddingSyncedAt: new Date(),
            },
          },
        },
        include: { profile: true },
      });
      testUserId = user.id;
      testProfileId = user.profile!.id;

      const job = await prisma.jobListing.create({
        data: {
          portalId: "test-portal",
          externalJobId: `embed-test-${Date.now()}`,
          title: "Senior Engineer",
          company: "Acme",
          url: "https://example.com/job",
          classificationStatus: "COMPLETED",
          classificationAttempts: 3,
          classificationError: "prior transient error",
        },
      });
      testJobId = job.id;
    });

    afterEach(async () => {
      await safeCleanup("llm-config:embedding jobListing delete", () =>
        prisma.jobListing.delete({ where: { id: testJobId } }),
      );
      await safeCleanup("llm-config:embedding user delete", () =>
        prisma.user.delete({ where: { id: testUserId } }),
      );

      if (originalEmbeddingConfig) {
        await prisma.systemConfig.upsert({
          where: { key: "AI_PROVIDER_EMBEDDING" },
          create: {
            key: "AI_PROVIDER_EMBEDDING",
            value: originalEmbeddingConfig.value,
          },
          update: { value: originalEmbeddingConfig.value },
        });
      } else {
        await safeCleanup(
          "llm-config:embedding AI_PROVIDER_EMBEDDING delete",
          () =>
            prisma.systemConfig.delete({
              where: { key: "AI_PROVIDER_EMBEDDING" },
            }),
        );
      }
    });

    it("resets embeddingSyncedAt and requeues COMPLETED jobs when embeddingProvider changes", async () => {
      await prisma.systemConfig.upsert({
        where: { key: "AI_PROVIDER_EMBEDDING" },
        create: { key: "AI_PROVIDER_EMBEDDING", value: "ollama" },
        update: { value: "ollama" },
      });

      // This endpoint's reset/requeue is intentionally global (NFR "Compatibilidade de
      // Embeddings" — cross-provider vectors are incomparable for every row, not just the ones
      // this test created). Snapshot any other pre-existing affected rows so this test can
      // restore them afterward instead of permanently mutating the shared dev/test database.
      const otherSyncedProfilesBefore = await prisma.userProfile.findMany({
        where: { embeddingSyncedAt: { not: null }, id: { not: testProfileId } },
        select: { id: true, embeddingSyncedAt: true },
      });
      const otherCompletedJobsBefore = await prisma.jobListing.findMany({
        where: { classificationStatus: "COMPLETED", id: { not: testJobId } },
        select: {
          id: true,
          classificationAttempts: true,
          classificationError: true,
        },
      });

      const req = new Request("http://localhost:3000/api/admin/llm-config", {
        method: "POST",
        body: JSON.stringify({
          defaultProvider: "ollama",
          parsingProvider: "ollama",
          summariesProvider: "ollama",
          profileProvider: "ollama",
          embeddingProvider: "gemini", // changed from "ollama"
        }),
      });

      const res = await postConfigHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.embeddingProviderChanged).toBe(true);

      const profile = await prisma.userProfile.findUnique({
        where: { id: testProfileId },
      });
      expect(profile?.embeddingSyncedAt).toBeNull();

      const job = await prisma.jobListing.findUnique({
        where: { id: testJobId },
      });
      expect(job?.classificationStatus).toBe("PENDING");
      expect(job?.classificationAttempts).toBe(0);
      expect(job?.classificationError).toBeNull();

      // Restore other pre-existing rows this global reset touched (see snapshot above).
      for (const p of otherSyncedProfilesBefore) {
        await prisma.userProfile.update({
          where: { id: p.id },
          data: { embeddingSyncedAt: p.embeddingSyncedAt },
        });
      }
      for (const j of otherCompletedJobsBefore) {
        await prisma.jobListing.update({
          where: { id: j.id },
          data: {
            classificationStatus: "COMPLETED",
            classificationAttempts: j.classificationAttempts,
            classificationError: j.classificationError,
          },
        });
      }
    });

    it("is a no-op reset when embeddingProvider is unchanged", async () => {
      await prisma.systemConfig.upsert({
        where: { key: "AI_PROVIDER_EMBEDDING" },
        create: { key: "AI_PROVIDER_EMBEDDING", value: "ollama" },
        update: { value: "ollama" },
      });

      const req = new Request("http://localhost:3000/api/admin/llm-config", {
        method: "POST",
        body: JSON.stringify({
          defaultProvider: "ollama",
          parsingProvider: "ollama",
          summariesProvider: "ollama",
          profileProvider: "ollama",
          embeddingProvider: "ollama", // unchanged
        }),
      });

      const res = await postConfigHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.embeddingProviderChanged).toBe(false);

      const profile = await prisma.userProfile.findUnique({
        where: { id: testProfileId },
      });
      expect(profile?.embeddingSyncedAt).not.toBeNull();

      const job = await prisma.jobListing.findUnique({
        where: { id: testJobId },
      });
      expect(job?.classificationStatus).toBe("COMPLETED");
      expect(job?.classificationAttempts).toBe(3);
    });
  });
});
