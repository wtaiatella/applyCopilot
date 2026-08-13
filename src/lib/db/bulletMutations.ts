import { logger } from "@/lib/logging/logger";

export type BulletTable =
  | "experienceBullet"
  | "projectBullet"
  | "educationBullet";
export type CVBulletForeignKey =
  | "experienceBulletId"
  | "projectBulletId"
  | "educationBulletId";

export interface MutationResult {
  action: "updated" | "archived_and_created";
  newBulletId: string;
}

/**
 * Maps a bullet table name to its parent foreign key field name.
 * e.g. "experienceBullet" → "experienceId"
 */
const parentFkField: Record<BulletTable, string> = {
  experienceBullet: "experienceId",
  projectBullet: "projectId",
  educationBullet: "educationId",
};

// Minimal interface that covers only the operations needed from a Prisma tx client
// for bullet table mutations. Using `unknown` intermediary to satisfy the TS compiler
// when indexing Prisma's union delegate types.
interface BulletTableClient {
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<unknown>;
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
}

interface CVBulletClient {
  count(args: { where: Record<string, string> }): Promise<number>;
}

// A structural subset of the Prisma transaction client
interface MinimalTx {
  cVBullet: CVBulletClient;
  [table: string]: unknown;
}

/**
 * Applies the bullet immutability rule to a text mutation.
 *
 * Immutability path (bullet was previously used in a generated CV):
 *   1. Archive the original: isArchived = true, isActive = false
 *   2. Create a new bullet with the new text at the same sortOrder
 *
 * Simple path (bullet has never been used in a CV):
 *   In-place text update (same ID)
 *
 * @param forceInPlace When `true`, always takes the simple in-place-update path, even when
 *   `usedCount > 0` (US-3 "Replace" escape hatch). Optional, defaults to `false` so all
 *   pre-existing call sites/tests are unaffected unless they explicitly opt in.
 * @returns MutationResult with the action taken and the ID to use going forward.
 */
export async function reconcileBulletMutation(
  tx: MinimalTx,
  bulletId: string,
  newText: string,
  table: BulletTable,
  fkKey: CVBulletForeignKey,
  parentId: string,
  sortOrder: number,
  type: "BULLET" | "PARAGRAPH",
  forceInPlace = false,
): Promise<MutationResult> {
  // Check whether this bullet has ever been referenced in a generated CV
  const usedCount = await tx.cVBullet.count({
    where: { [fkKey]: bulletId },
  });

  const tableClient = tx[table] as BulletTableClient;

  if (usedCount > 0 && !forceInPlace) {
    // Immutability path: archive original, create new
    logger.info(
      "reconcileBulletMutation: immutability path — archiving original and creating new bullet",
      {
        bulletId,
        table,
        usedCount,
      },
    );

    // 1. Archive the original
    await tableClient.update({
      where: { id: bulletId },
      data: { isArchived: true, isActive: false },
    });

    // 2. Create the replacement at the same sortOrder position
    const newBullet = await tableClient.create({
      data: {
        [parentFkField[table]]: parentId,
        text: newText,
        isActive: true,
        isArchived: false,
        type,
        sortOrder,
      },
    });

    return { action: "archived_and_created", newBulletId: newBullet.id };
  } else {
    // Simple path: in-place update
    logger.info("reconcileBulletMutation: simple path — in-place update", {
      bulletId,
      table,
    });

    await tableClient.update({
      where: { id: bulletId },
      data: { text: newText },
    });

    return { action: "updated", newBulletId: bulletId };
  }
}

/**
 * Server-side backstop for US-1 (bullet immutability): a bullet that has ever been referenced by
 * a generated CV (`usedCount > 0`) keeps its stored text no matter what an entity `PUT` request
 * sends. This is defense-in-depth alongside the UI's read-only text field — see spectech.md
 * Technical Decisions.
 *
 * Pure — no I/O. Callers own fetching `usedCount` (e.g. via `cVBullet.groupBy`).
 *
 * @returns the text to persist: the stored `existingText` when the incoming text was ignored,
 *   otherwise `incomingText` unchanged.
 */
export function guardBulletTextUpdate(
  incomingText: string,
  existingText: string,
  usedCount: number,
): string {
  if (usedCount > 0 && incomingText !== existingText) {
    return existingText;
  }
  return incomingText;
}
