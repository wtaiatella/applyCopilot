import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { AcceptSuggestionSchema } from "@/lib/validation/aiSchemas";
import {
  loadOwnedEntity,
  ENTITY_BULLET_TABLE,
  ENTITY_BULLET_FK,
  ENTITY_PARENT_FIELD,
  type ProfileEntityType,
  type OwnedEntityBullet,
} from "@/lib/db/profileEntityAccess";
import { reconcileBulletMutation } from "@/lib/db/bulletMutations";

interface ResponseBullet {
  id: string;
  text: string;
  isActive: boolean;
  isArchived: boolean;
  type: "BULLET" | "PARAGRAPH";
  sortOrder: number;
  usedInCVs: Array<{ id: string; name: string }>;
}

/** Reloads the entity's (non-archived) bullets, shaped like existing profile route responses. */
async function loadBulletsForResponse(
  entityType: ProfileEntityType,
  entityId: string,
): Promise<ResponseBullet[]> {
  const include = { usedInCVs: { include: { cv: true } } } as const;
  const orderBy = { sortOrder: "asc" as const };

  let rows;
  switch (entityType) {
    case "experience":
      rows = await prisma.experienceBullet.findMany({
        where: { experienceId: entityId, isArchived: false },
        include,
        orderBy,
      });
      break;
    case "project":
      rows = await prisma.projectBullet.findMany({
        where: { projectId: entityId, isArchived: false },
        include,
        orderBy,
      });
      break;
    case "education":
      rows = await prisma.educationBullet.findMany({
        where: { educationId: entityId, isArchived: false },
        include,
        orderBy,
      });
      break;
  }

  return rows.map((b) => ({
    id: b.id,
    text: b.text,
    isActive: b.isActive,
    isArchived: b.isArchived,
    type: b.type,
    sortOrder: b.sortOrder,
    usedInCVs: b.usedInCVs.map((uc) => ({ id: uc.cv.id, name: uc.cv.name })),
  }));
}

// Structural subset of a Prisma transaction client, matching bulletMutations.ts's own
// (unexported) MinimalTx shape — required because reconcileBulletMutation's tx param
// carries a string index signature that Prisma's real transaction client type lacks.
type ReconcileTx = Parameters<typeof reconcileBulletMutation>[0];

interface BulletTableTxClient {
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<unknown>;
  delete(args: { where: { id: string } }): Promise<unknown>;
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
}

interface CVBulletTxClient {
  count(args: { where: Record<string, string> }): Promise<number>;
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = AcceptSuggestionSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return NextResponse.json(
        { error: "Validation failed", details },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const { entityType, entityId, action } = data;

    // Ownership check
    const entity = await loadOwnedEntity(entityType, entityId, userId);
    if (!entity) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const table = ENTITY_BULLET_TABLE[entityType];
    const fkKey = ENTITY_BULLET_FK[entityType];
    const parentField = ENTITY_PARENT_FIELD[entityType];

    if (action === "rewrite") {
      // Verify the bulletId belongs to this entity before mutating it
      const bullet = entity.bullets.find((b) => b.id === data.bulletId);
      if (!bullet) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      await prisma.$transaction(async (tx) => {
        await reconcileBulletMutation(
          tx as unknown as ReconcileTx,
          bullet.id,
          data.newText,
          table,
          fkKey,
          entityId,
          bullet.sortOrder,
          bullet.type,
        );
      });
    } else if (action === "merge") {
      // Verify every source bulletId belongs to this entity before mutating any of them
      const sourceBullets = data.bulletIds.map((id) =>
        entity.bullets.find((b) => b.id === id),
      );
      if (sourceBullets.some((b) => !b)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const sources = sourceBullets as OwnedEntityBullet[];
      const lowestSortOrder = Math.min(...sources.map((s) => s.sortOrder));

      await prisma.$transaction(async (tx) => {
        const txClient = tx as unknown as {
          cVBullet: CVBulletTxClient;
          [k: string]: unknown;
        };
        const tableClient = txClient[table] as BulletTableTxClient;

        // 1. Reconcile each source bullet per CV usage (archive if used, hard-delete otherwise)
        for (const source of sources) {
          const usedCount = await txClient.cVBullet.count({
            where: { [fkKey]: source.id },
          });
          if (usedCount > 0) {
            await tableClient.update({
              where: { id: source.id },
              data: { isArchived: true, isActive: false },
            });
          } else {
            await tableClient.delete({ where: { id: source.id } });
          }
        }

        // 2. Create the single combined bullet at the lowest source sortOrder
        await tableClient.create({
          data: {
            [parentField]: entityId,
            text: data.combinedText,
            isActive: true,
            isArchived: false,
            type: "BULLET",
            sortOrder: lowestSortOrder,
          },
        });
      });
    } else {
      // "new" | "generate" — append a fresh bullet at the end of the list
      const maxSortOrder =
        entity.bullets.length > 0
          ? Math.max(...entity.bullets.map((b) => b.sortOrder))
          : -1;
      const sortOrder = maxSortOrder + 1;

      switch (entityType) {
        case "experience":
          await prisma.experienceBullet.create({
            data: {
              experienceId: entityId,
              text: data.text,
              isActive: true,
              isArchived: false,
              type: "BULLET",
              sortOrder,
            },
          });
          break;
        case "project":
          await prisma.projectBullet.create({
            data: {
              projectId: entityId,
              text: data.text,
              isActive: true,
              isArchived: false,
              type: "BULLET",
              sortOrder,
            },
          });
          break;
        case "education":
          await prisma.educationBullet.create({
            data: {
              educationId: entityId,
              text: data.text,
              isActive: true,
              isArchived: false,
              type: "BULLET",
              sortOrder,
            },
          });
          break;
      }
    }

    const bullets = await loadBulletsForResponse(entityType, entityId);

    logger.info("Accept-suggestion completed", {
      entityType,
      entityId,
      action,
    });

    return NextResponse.json({ bullets });
  } catch (error) {
    logger.error("Failed to accept suggestion", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
