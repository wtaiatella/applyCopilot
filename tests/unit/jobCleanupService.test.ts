/**
 * @jest-environment node
 */

jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemConfig: {
      findUnique: jest.fn(),
    },
    jobListing: {
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/logging/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import {
  getRetentionDays,
  purgeExpiredOrphanJobs,
  DEFAULT_RETENTION_DAYS,
  RETENTION_CONFIG_KEY,
} from "@/services/jobCleanupService";

const mockSystemConfigFindUnique = prisma.systemConfig.findUnique as jest.Mock;
const mockDeleteMany = prisma.jobListing.deleteMany as jest.Mock;

describe("jobCleanupService (APC-24 / US-3)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getRetentionDays", () => {
    it("returns DEFAULT_RETENTION_DAYS (15) when config is absent", async () => {
      mockSystemConfigFindUnique.mockResolvedValue(null);
      const days = await getRetentionDays();
      expect(days).toBe(DEFAULT_RETENTION_DAYS);
      expect(mockSystemConfigFindUnique).toHaveBeenCalledWith({
        where: { key: RETENTION_CONFIG_KEY },
      });
    });

    it("returns parsed integer when valid config exists", async () => {
      mockSystemConfigFindUnique.mockResolvedValue({ value: "30" });
      const days = await getRetentionDays();
      expect(days).toBe(30);
    });

    it("falls back to default if stored value is invalid or <= 0", async () => {
      mockSystemConfigFindUnique.mockResolvedValue({ value: "-5" });
      const days = await getRetentionDays();
      expect(days).toBe(DEFAULT_RETENTION_DAYS);

      mockSystemConfigFindUnique.mockResolvedValue({ value: "invalid" });
      const days2 = await getRetentionDays();
      expect(days2).toBe(DEFAULT_RETENTION_DAYS);
    });

    it("falls back to default when database query throws", async () => {
      mockSystemConfigFindUnique.mockRejectedValue(new Error("DB Connection Error"));
      const days = await getRetentionDays();
      expect(days).toBe(DEFAULT_RETENTION_DAYS);
    });
  });

  describe("purgeExpiredOrphanJobs", () => {
    it("deletes orphan jobs exceeding retention period with strict relational guards", async () => {
      mockSystemConfigFindUnique.mockResolvedValue({ value: "15" });
      mockDeleteMany.mockResolvedValue({ count: 42 });

      const before = Date.now();
      const result = await purgeExpiredOrphanJobs();
      const after = Date.now();

      expect(mockDeleteMany).toHaveBeenCalledTimes(1);

      // Verify strict relational safety filter protecting candidates (RF-3 / AC.5)
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: { lt: expect.any(Date) },
          favorites: { none: {} },
          analyses: { none: {} },
          applications: { none: {} },
          cvs: { none: {} },
        },
      });

      // Verify cutoff date is approximately 15 days ago
      const calledWhere = mockDeleteMany.mock.calls[0][0].where;
      const cutoffDate = calledWhere.createdAt.lt as Date;
      const expectedCutoffMin = before - 15 * 24 * 60 * 60 * 1000 - 1000;
      const expectedCutoffMax = after - 15 * 24 * 60 * 60 * 1000 + 1000;

      expect(cutoffDate.getTime()).toBeGreaterThanOrEqual(expectedCutoffMin);
      expect(cutoffDate.getTime()).toBeLessThanOrEqual(expectedCutoffMax);

      expect(result.purgedCount).toBe(42);
      expect(result.retentionDays).toBe(15);
      expect(logger.info).toHaveBeenCalledWith(
        "[JobCleanup] Successfully purged orphan jobs",
        expect.objectContaining({
          purgedCount: 42,
          retentionDays: 15,
        }),
      );
    });

    it("supports overriding retention days via parameter", async () => {
      mockDeleteMany.mockResolvedValue({ count: 10 });

      const result = await purgeExpiredOrphanJobs(7);

      expect(mockSystemConfigFindUnique).not.toHaveBeenCalled();
      expect(result.retentionDays).toBe(7);
      expect(result.purgedCount).toBe(10);
    });

    it("logs error and rethrows when deletion query fails", async () => {
      mockSystemConfigFindUnique.mockResolvedValue(null);
      const dbError = new Error("Deadlock detected");
      mockDeleteMany.mockRejectedValue(dbError);

      await expect(purgeExpiredOrphanJobs()).rejects.toThrow("Deadlock detected");

      expect(logger.error).toHaveBeenCalledWith(
        "[JobCleanup] Failed to execute orphan job retention sweep",
        expect.objectContaining({
          error: "Deadlock detected",
          retentionDays: 15,
        }),
      );
    });
  });
});
