/**
 * @jest-environment node
 */

jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

jest.mock("@/services/embeddingBackfillService", () => {
  class BackfillInProgressError extends Error {
    constructor(
      message = "A skill vocabulary and embedding backfill is already in progress.",
    ) {
      super(message);
      this.name = "BackfillInProgressError";
    }
  }
  return {
    BackfillInProgressError,
    runEmbeddingBackfill: jest.fn(),
  };
});

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { AIServiceUnavailableError } from "@/lib/ai/aiClient";
import {
  BackfillInProgressError,
  runEmbeddingBackfill,
} from "@/services/embeddingBackfillService";
import {
  GET as getSkillThreshold,
  POST as postSkillThreshold,
} from "@/app/api/admin/skill-threshold/route";
import {
  GET as getSkillMatchThreshold,
  POST as postSkillMatchThreshold,
} from "@/app/api/admin/skill-match-threshold/route";
import { POST as postBackfill } from "@/app/api/admin/backfill-skill-vocabulary/route";

const mockAuth = auth as jest.Mock;
const mockFindUnique = prisma.systemConfig.findUnique as jest.Mock;
const mockUpsert = prisma.systemConfig.upsert as jest.Mock;
const mockRunEmbeddingBackfill = runEmbeddingBackfill as jest.Mock;

describe("Admin Skill Threshold & Backfill Routes (APC-45 / US-4)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/admin/skill-threshold", () => {
    it("returns 401 when unauthenticated", async () => {
      mockAuth.mockResolvedValue(null);
      const res = await getSkillThreshold();
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not ADMIN", async () => {
      mockAuth.mockResolvedValue({ user: { id: "u1", role: "USER" } });
      const res = await getSkillThreshold();
      expect(res.status).toBe(403);
    });

    it("returns default threshold 60 when SystemConfig row is absent", async () => {
      mockAuth.mockResolvedValue({ user: { id: "a1", role: "ADMIN" } });
      mockFindUnique.mockResolvedValue(null);
      const res = await getSkillThreshold();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ threshold: 60 });
    });

    it("returns stored threshold when SystemConfig row exists", async () => {
      mockAuth.mockResolvedValue({ user: { id: "a1", role: "ADMIN" } });
      mockFindUnique.mockResolvedValue({
        key: "SKILL_ALIAS_SIMILARITY_THRESHOLD",
        value: "75",
      });
      const res = await getSkillThreshold();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ threshold: 75 });
    });
  });

  describe("POST /api/admin/skill-threshold", () => {
    it("returns 401 when unauthenticated", async () => {
      mockAuth.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3100/api/admin/skill-threshold", {
        method: "POST",
        body: JSON.stringify({ threshold: 65 }),
      });
      const res = await postSkillThreshold(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not ADMIN", async () => {
      mockAuth.mockResolvedValue({ user: { id: "u1", role: "USER" } });
      const req = new NextRequest("http://localhost:3100/api/admin/skill-threshold", {
        method: "POST",
        body: JSON.stringify({ threshold: 65 }),
      });
      const res = await postSkillThreshold(req);
      expect(res.status).toBe(403);
    });

    it.each([-1, 101, 60.5, "60"])(
      "returns 400 for out-of-range or invalid threshold %p",
      async (invalid) => {
        mockAuth.mockResolvedValue({ user: { id: "a1", role: "ADMIN" } });
        const req = new NextRequest("http://localhost:3100/api/admin/skill-threshold", {
          method: "POST",
          body: JSON.stringify({ threshold: invalid }),
        });
        const res = await postSkillThreshold(req);
        expect(res.status).toBe(400);
        expect(mockUpsert).not.toHaveBeenCalled();
      },
    );

    it.each([0, 60, 100])(
      "persists valid integer threshold %p in [0, 100]",
      async (valid) => {
        mockAuth.mockResolvedValue({
          user: { id: "a1", email: "admin@example.com", role: "ADMIN" },
        });
        mockUpsert.mockResolvedValue({});
        const req = new NextRequest("http://localhost:3100/api/admin/skill-threshold", {
          method: "POST",
          body: JSON.stringify({ threshold: valid }),
        });
        const res = await postSkillThreshold(req);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, threshold: valid });
        expect(mockUpsert).toHaveBeenCalledWith({
          where: { key: "SKILL_ALIAS_SIMILARITY_THRESHOLD" },
          create: {
            key: "SKILL_ALIAS_SIMILARITY_THRESHOLD",
            value: String(valid),
          },
          update: { value: String(valid) },
        });
      },
    );
  });

  describe("GET /api/admin/skill-match-threshold", () => {
    it("returns 401 when unauthenticated", async () => {
      mockAuth.mockResolvedValue(null);
      const res = await getSkillMatchThreshold();
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not ADMIN", async () => {
      mockAuth.mockResolvedValue({ user: { id: "u1", role: "USER" } });
      const res = await getSkillMatchThreshold();
      expect(res.status).toBe(403);
    });

    it("returns stored threshold when SystemConfig row exists", async () => {
      mockAuth.mockResolvedValue({ user: { id: "a1", role: "ADMIN" } });
      mockFindUnique.mockResolvedValue({
        key: "SKILL_MATCH_DISPLAY_THRESHOLD",
        value: "83",
      });
      const res = await getSkillMatchThreshold();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ threshold: 83 });
    });
  });

  describe("POST /api/admin/skill-match-threshold", () => {
    it("returns 401 when unauthenticated", async () => {
      mockAuth.mockResolvedValue(null);
      const req = new NextRequest(
        "http://localhost:3100/api/admin/skill-match-threshold",
        {
          method: "POST",
          body: JSON.stringify({ threshold: 83 }),
        },
      );
      const res = await postSkillMatchThreshold(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is not ADMIN", async () => {
      mockAuth.mockResolvedValue({ user: { id: "u1", role: "USER" } });
      const req = new NextRequest(
        "http://localhost:3100/api/admin/skill-match-threshold",
        {
          method: "POST",
          body: JSON.stringify({ threshold: 83 }),
        },
      );
      const res = await postSkillMatchThreshold(req);
      expect(res.status).toBe(403);
    });

    it.each([-5, 105, 83.2])(
      "returns 400 for out-of-range or non-integer threshold %p",
      async (invalid) => {
        mockAuth.mockResolvedValue({ user: { id: "a1", role: "ADMIN" } });
        const req = new NextRequest(
          "http://localhost:3100/api/admin/skill-match-threshold",
          {
            method: "POST",
            body: JSON.stringify({ threshold: invalid }),
          },
        );
        const res = await postSkillMatchThreshold(req);
        expect(res.status).toBe(400);
        expect(mockUpsert).not.toHaveBeenCalled();
      },
    );

    it("persists valid integer threshold 83", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "a1", email: "admin@example.com", role: "ADMIN" },
      });
      mockUpsert.mockResolvedValue({});
      const req = new NextRequest(
        "http://localhost:3100/api/admin/skill-match-threshold",
        {
          method: "POST",
          body: JSON.stringify({ threshold: 83 }),
        },
      );
      const res = await postSkillMatchThreshold(req);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, threshold: 83 });
      expect(mockUpsert).toHaveBeenCalledWith({
        where: { key: "SKILL_MATCH_DISPLAY_THRESHOLD" },
        create: { key: "SKILL_MATCH_DISPLAY_THRESHOLD", value: "83" },
        update: { value: "83" },
      });
    });
  });

  describe("POST /api/admin/backfill-skill-vocabulary", () => {
    it("returns 401 when unauthenticated", async () => {
      mockAuth.mockResolvedValue(null);
      const res = await postBackfill();
      expect(res.status).toBe(401);
      expect(mockRunEmbeddingBackfill).not.toHaveBeenCalled();
    });

    it("returns 403 when user is not ADMIN", async () => {
      mockAuth.mockResolvedValue({ user: { id: "u1", role: "USER" } });
      const res = await postBackfill();
      expect(res.status).toBe(403);
      expect(mockRunEmbeddingBackfill).not.toHaveBeenCalled();
    });

    it("returns 200 with backfill counts when runEmbeddingBackfill succeeds", async () => {
      mockAuth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
      mockRunEmbeddingBackfill.mockResolvedValue({
        profilesReset: 2,
        skillsCleared: 45,
        jobsReindexed: 12,
        jobsSkipped: 1,
      });

      const res = await postBackfill();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        success: true,
        profilesReset: 2,
        skillsCleared: 45,
        jobsReindexed: 12,
        jobsSkipped: 1,
      });
      expect(mockRunEmbeddingBackfill).toHaveBeenCalledWith("admin-1");
    });

    it("returns 409 Conflict when BackfillInProgressError is thrown", async () => {
      mockAuth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
      mockRunEmbeddingBackfill.mockRejectedValue(new BackfillInProgressError());

      const res = await postBackfill();
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain("already in progress");
    });

    it("returns 503 Service Unavailable when AIServiceUnavailableError is thrown", async () => {
      mockAuth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
      mockRunEmbeddingBackfill.mockRejectedValue(
        new AIServiceUnavailableError("AI service temporarily unavailable."),
      );

      const res = await postBackfill();
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toContain("unavailable");
    });
  });
});
