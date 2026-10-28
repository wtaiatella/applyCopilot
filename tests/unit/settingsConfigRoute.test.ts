/**
 * @jest-environment node
 */

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemConfig: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { GET, POST } from "@/app/api/settings/config/route";
import { NextRequest } from "next/server";

const mockAuth = auth as jest.Mock;
const mockFindMany = prisma.systemConfig.findMany as jest.Mock;
const mockUpsert = prisma.systemConfig.upsert as jest.Mock;

describe("Settings Config Route (APC-24 / US-2)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/settings/config", () => {
    it("returns 401 if user is not ADMIN", async () => {
      mockAuth.mockResolvedValue({ user: { role: "USER" } });

      const res = await GET();
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("returns default jobRetentionDays: 15 when key is absent", async () => {
      mockAuth.mockResolvedValue({ user: { role: "ADMIN" } });
      mockFindMany.mockResolvedValue([]);

      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.jobRetentionDays).toBe(15);
      expect(json.globalScrapeInterval).toBe(360);
    });

    it("returns stored jobRetentionDays when present in SystemConfig", async () => {
      mockAuth.mockResolvedValue({ user: { role: "ADMIN" } });
      mockFindMany.mockResolvedValue([
        { key: "SCRAPER_JOB_RETENTION_DAYS", value: "30" },
        { key: "SCRAPER_GLOBAL_INTERVAL", value: "180" },
      ]);

      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.jobRetentionDays).toBe(30);
      expect(json.globalScrapeInterval).toBe(180);
    });
  });

  describe("POST /api/settings/config", () => {
    it("returns 401 if user is not ADMIN", async () => {
      mockAuth.mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3100/api/settings/config", {
        method: "POST",
        body: JSON.stringify({ jobRetentionDays: 20 }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("persists jobRetentionDays in SCRAPER_JOB_RETENTION_DAYS", async () => {
      mockAuth.mockResolvedValue({ user: { role: "ADMIN" } });
      mockUpsert.mockResolvedValue({});

      const req = new NextRequest("http://localhost:3100/api/settings/config", {
        method: "POST",
        body: JSON.stringify({
          globalScrapeInterval: 360,
          maxConcurrency: 3,
          rateLimitDelay: 1000,
          maxExtractionRetries: 3,
          userAgent: "ApplyCopilot/1.0",
          jobRetentionDays: 25,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: "SCRAPER_JOB_RETENTION_DAYS" },
          update: { value: "25" },
          create: { key: "SCRAPER_JOB_RETENTION_DAYS", value: "25" },
        }),
      );
    });
  });
});
