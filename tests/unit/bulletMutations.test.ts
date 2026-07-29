/**
 * @jest-environment node
 */

import {
  reconcileBulletMutation,
  BulletTable,
  CVBulletForeignKey,
} from "@/lib/db/bulletMutations";

// Mock logger to suppress output during tests
jest.mock("@/lib/logging/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

/** Build a minimal tx mock for a given bullet table */
function buildTxMock(
  table: BulletTable,
  cvBulletCount: number,
  createdBulletId = "new-bullet-id"
) {
  const cVBullet = { count: jest.fn().mockResolvedValue(cvBulletCount) };

  const tableClient = {
    update: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({ id: createdBulletId }),
  };

  // MinimalTx shape: cVBullet + indexed table access
  return {
    cVBullet,
    [table]: tableClient,
  } as Record<string, unknown> as Parameters<typeof reconcileBulletMutation>[0];
}

describe("reconcileBulletMutation", () => {
  const bulletId = "bullet-abc";
  const newText = "Improved bullet text";
  const parentId = "parent-xyz";
  const sortOrder = 3;
  const type = "BULLET" as const;
  const table: BulletTable = "experienceBullet";
  const fkKey: CVBulletForeignKey = "experienceBulletId";

  // ───────────────────────────────────────────────
  // Test 1: used bullet → archive original + create new
  // ───────────────────────────────────────────────
  describe("when the bullet has been used in a CV (usedCount > 0)", () => {
    it("archives the original bullet and creates a new one at the same sortOrder", async () => {
      const createdId = "newly-created-bullet";
      const tx = buildTxMock(table, 2, createdId);
      const tableClient = (tx as Record<string, unknown>)[table] as {
        update: jest.Mock;
        create: jest.Mock;
      };
      const cvBulletClient = (tx as Record<string, unknown>).cVBullet as { count: jest.Mock };

      const result = await reconcileBulletMutation(
        tx,
        bulletId,
        newText,
        table,
        fkKey,
        parentId,
        sortOrder,
        type
      );

      // CVBullet.count was called with the correct foreign key
      expect(cvBulletClient.count).toHaveBeenCalledWith({
        where: { [fkKey]: bulletId },
      });

      // Original bullet archived
      expect(tableClient.update).toHaveBeenCalledWith({
        where: { id: bulletId },
        data: { isArchived: true, isActive: false },
      });

      // New bullet created at same sortOrder
      expect(tableClient.create).toHaveBeenCalledWith({
        data: {
          experienceId: parentId,
          text: newText,
          isActive: true,
          isArchived: false,
          type,
          sortOrder,
        },
      });

      // Returns the new bullet ID
      expect(result).toEqual({
        action: "archived_and_created",
        newBulletId: createdId,
      });
    });
  });

  // ───────────────────────────────────────────────
  // Test 2: unused bullet → in-place update
  // ───────────────────────────────────────────────
  describe("when the bullet has never been used in a CV (usedCount === 0)", () => {
    it("updates the bullet text in-place (same ID, no new record)", async () => {
      const tx = buildTxMock(table, 0);
      const tableClient = (tx as Record<string, unknown>)[table] as {
        update: jest.Mock;
        create: jest.Mock;
      };
      const cvBulletClient = (tx as Record<string, unknown>).cVBullet as { count: jest.Mock };

      const result = await reconcileBulletMutation(
        tx,
        bulletId,
        newText,
        table,
        fkKey,
        parentId,
        sortOrder,
        type
      );

      // CVBullet.count was called
      expect(cvBulletClient.count).toHaveBeenCalledWith({
        where: { [fkKey]: bulletId },
      });

      // In-place text update only
      expect(tableClient.update).toHaveBeenCalledWith({
        where: { id: bulletId },
        data: { text: newText },
      });

      // No new bullet created
      expect(tableClient.create).not.toHaveBeenCalled();

      // Returns same bulletId
      expect(result).toEqual({
        action: "updated",
        newBulletId: bulletId,
      });
    });
  });

  // ───────────────────────────────────────────────
  // Test 3: transaction failure on create → throws
  // ───────────────────────────────────────────────
  describe("when the new bullet creation fails (transaction error)", () => {
    it("throws and propagates the error", async () => {
      const tx = buildTxMock(table, 1);
      const tableClient = (tx as Record<string, unknown>)[table] as {
        update: jest.Mock;
        create: jest.Mock;
      };

      // update (archive) succeeds, but create throws
      tableClient.create.mockRejectedValueOnce(new Error("DB constraint error"));

      await expect(
        reconcileBulletMutation(tx, bulletId, newText, table, fkKey, parentId, sortOrder, type)
      ).rejects.toThrow("DB constraint error");

      // Note: in a real Prisma $transaction, the failed create would roll back
      // the update too. In unit tests we verify the throw propagates correctly.
      expect(tableClient.create).toHaveBeenCalledTimes(1);
    });
  });

  // ───────────────────────────────────────────────
  // Test 4: projectBullet table uses correct parentFk
  // ───────────────────────────────────────────────
  describe("with projectBullet table", () => {
    it("uses projectId as the parent foreign key field", async () => {
      const projectTable: BulletTable = "projectBullet";
      const projectFk: CVBulletForeignKey = "projectBulletId";
      const createdId = "proj-bullet-new";

      const tx = buildTxMock(projectTable, 1, createdId);
      const tableClient = (tx as Record<string, unknown>)[projectTable] as {
        update: jest.Mock;
        create: jest.Mock;
      };

      await reconcileBulletMutation(
        tx,
        bulletId,
        newText,
        projectTable,
        projectFk,
        parentId,
        sortOrder,
        type
      );

      expect(tableClient.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ projectId: parentId }),
      });
    });
  });

  // ───────────────────────────────────────────────
  // Test 5: educationBullet table uses correct parentFk
  // ───────────────────────────────────────────────
  describe("with educationBullet table", () => {
    it("uses educationId as the parent foreign key field", async () => {
      const eduTable: BulletTable = "educationBullet";
      const eduFk: CVBulletForeignKey = "educationBulletId";
      const createdId = "edu-bullet-new";

      const tx = buildTxMock(eduTable, 1, createdId);
      const tableClient = (tx as Record<string, unknown>)[eduTable] as {
        update: jest.Mock;
        create: jest.Mock;
      };

      await reconcileBulletMutation(
        tx,
        bulletId,
        newText,
        eduTable,
        eduFk,
        parentId,
        sortOrder,
        type
      );

      expect(tableClient.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ educationId: parentId }),
      });
    });
  });
});
