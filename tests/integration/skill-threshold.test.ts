/**
 * @jest-environment node
 */
import "dotenv/config";
import {
  GET as getThresholdHandler,
  POST as postThresholdHandler,
} from "@/app/api/admin/skill-threshold/route";
import { prisma, pool } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { safeCleanup } from "./helpers/test-fixtures";

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

const THRESHOLD_KEY = "SKILL_ALIAS_SIMILARITY_THRESHOLD";

describe("Skill Threshold Integration Tests (GET + POST /api/admin/skill-threshold)", () => {
  const mockAuth = auth as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  describe("GET /api/admin/skill-threshold", () => {
    it("should return 401 if unauthenticated", async () => {
      mockAuth.mockResolvedValue(null);

      const res = await getThresholdHandler();
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("should return 403 if user is not ADMIN", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "test-user-id", email: "user@example.com", role: "USER" },
        expires: "any",
      });

      const res = await getThresholdHandler();
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("Forbidden");
    });

    it("should default to 60 when no SystemConfig row exists", async () => {
      mockAuth.mockResolvedValue({
        user: {
          id: "admin-user-id",
          email: "wtaiatella@gmail.com",
          role: "ADMIN",
        },
        expires: "any",
      });

      const original = await prisma.systemConfig.findUnique({
        where: { key: THRESHOLD_KEY },
      });
      await safeCleanup(
        "skill-threshold.test.ts default-60 delete",
        async () => {
          await prisma.systemConfig.delete({ where: { key: THRESHOLD_KEY } });
        },
      );

      const res = await getThresholdHandler();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.threshold).toBe(60);

      if (original) {
        await prisma.systemConfig.upsert({
          where: { key: THRESHOLD_KEY },
          create: { key: THRESHOLD_KEY, value: original.value },
          update: { value: original.value },
        });
      }
    });
  });

  describe("POST /api/admin/skill-threshold", () => {
    it("should return 401 if unauthenticated", async () => {
      mockAuth.mockResolvedValue(null);

      const req = new Request(
        "http://localhost:3000/api/admin/skill-threshold",
        {
          method: "POST",
          body: JSON.stringify({ threshold: 70 }),
        },
      );

      const res = await postThresholdHandler(req);
      expect(res.status).toBe(401);
    });

    it("should return 403 if user is not ADMIN", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "test-user-id", email: "user@example.com", role: "USER" },
        expires: "any",
      });

      const req = new Request(
        "http://localhost:3000/api/admin/skill-threshold",
        {
          method: "POST",
          body: JSON.stringify({ threshold: 70 }),
        },
      );

      const res = await postThresholdHandler(req);
      expect(res.status).toBe(403);
    });

    it("should return 400 if validation fails (out of range)", async () => {
      mockAuth.mockResolvedValue({
        user: {
          id: "admin-user-id",
          email: "wtaiatella@gmail.com",
          role: "ADMIN",
        },
        expires: "any",
      });

      const req = new Request(
        "http://localhost:3000/api/admin/skill-threshold",
        {
          method: "POST",
          body: JSON.stringify({ threshold: 150 }),
        },
      );

      const res = await postThresholdHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Validation failed");
      expect(data.details).toBeDefined();
      expect(data.details[0].field).toBe("threshold");
    });

    it("persists a new threshold value and does not touch SkillEmbedding/SkillAlias rows", async () => {
      mockAuth.mockResolvedValue({
        user: {
          id: "admin-user-id",
          email: "wtaiatella@gmail.com",
          role: "ADMIN",
        },
        expires: "any",
      });

      const originalThreshold = await prisma.systemConfig.findUnique({
        where: { key: THRESHOLD_KEY },
      });

      const embeddingCountBefore = await prisma.skillEmbedding.count();
      const aliasCountBefore = await prisma.skillAlias.count();

      const req = new Request(
        "http://localhost:3000/api/admin/skill-threshold",
        {
          method: "POST",
          body: JSON.stringify({ threshold: 75 }),
        },
      );

      const res = await postThresholdHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.threshold).toBe(75);

      const inDb = await prisma.systemConfig.findUnique({
        where: { key: THRESHOLD_KEY },
      });
      expect(inDb?.value).toBe("75");

      // FR-15: no retroactive reprocessing — row counts for existing canonical vocabulary
      // must be unchanged by a threshold update.
      const embeddingCountAfter = await prisma.skillEmbedding.count();
      const aliasCountAfter = await prisma.skillAlias.count();
      expect(embeddingCountAfter).toBe(embeddingCountBefore);
      expect(aliasCountAfter).toBe(aliasCountBefore);

      // Restore
      if (originalThreshold) {
        await prisma.systemConfig.upsert({
          where: { key: THRESHOLD_KEY },
          create: { key: THRESHOLD_KEY, value: originalThreshold.value },
          update: { value: originalThreshold.value },
        });
      } else {
        await safeCleanup(
          "skill-threshold.test.ts restore delete",
          async () => {
            await prisma.systemConfig.delete({ where: { key: THRESHOLD_KEY } });
          },
        );
      }
    });
  });
});
