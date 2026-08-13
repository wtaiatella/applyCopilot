import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { ExperienceInputSchema } from "@/lib/validation/profileSchemas";
import { guardBulletTextUpdate } from "@/lib/db/bulletMutations";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PUT(req: Request, props: Params) {
  try {
    const { id } = await props.params;
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Verify ownership
    const experience = await prisma.experience.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!experience || experience.profile.userId !== userId) {
      return NextResponse.json(
        { error: "Experience not found or access denied" },
        { status: 404 },
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = ExperienceInputSchema.safeParse(body);
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

    // Load existing bullets (only active ones)
    const existingBullets = await prisma.experienceBullet.findMany({
      where: { experienceId: id, isArchived: false },
    });

    const incomingBullets = data.bullets;
    const incomingIds = incomingBullets
      .filter((b) => b.id)
      .map((b) => b.id) as string[];

    const bulletsToDelete = existingBullets.filter(
      (b) => !incomingIds.includes(b.id),
    );

    // Update in transaction
    const updatedExp = await prisma.$transaction(async (tx) => {
      // 1. Reconcile removed bullets (soft-delete if used in CVs, hard-delete otherwise)
      if (bulletsToDelete.length > 0) {
        for (const bullet of bulletsToDelete) {
          const usedCount = await tx.cVBullet.count({
            where: { experienceBulletId: bullet.id },
          });

          if (usedCount > 0) {
            await tx.experienceBullet.update({
              where: { id: bullet.id },
              data: { isArchived: true, isActive: false },
            });
          } else {
            await tx.experienceBullet.delete({
              where: { id: bullet.id },
            });
          }
        }
      }

      // 2. Guard against overwriting a CV-referenced bullet's text — defense-in-depth backstop
      // for the UI's read-only text field (see spectech.md Technical Decisions, guardBulletTextUpdate).
      const guardedBulletIds = incomingBullets
        .filter((b) => b.id)
        .map((b) => b.id) as string[];
      const usageCounts =
        guardedBulletIds.length > 0
          ? await tx.cVBullet.groupBy({
              by: ["experienceBulletId"],
              where: { experienceBulletId: { in: guardedBulletIds } },
              _count: true,
            })
          : [];
      const usedCountByBulletId = new Map(
        usageCounts.map((u) => [u.experienceBulletId, u._count]),
      );
      const existingTextByBulletId = new Map(
        existingBullets.map((b) => [b.id, b.text]),
      );

      // 3. Upsert incoming bullets
      for (const [idx, b] of incomingBullets.entries()) {
        if (b.id) {
          const existingText = existingTextByBulletId.get(b.id);
          if (existingText === undefined) {
            // b.id is not among this experience's active bullets — reject to prevent a
            // cross-parent bypass of the immutability guard (security fix, §6 rework).
            logger.warn(
              "Rejected bullet update: id not found among this experience's bullets",
              { bulletId: b.id, experienceId: id },
            );
            continue;
          }
          const guardedText = guardBulletTextUpdate(
            b.text,
            existingText,
            usedCountByBulletId.get(b.id) ?? 0,
          );

          if (guardedText !== b.text) {
            logger.warn(
              "guardBulletTextUpdate: ignored text change on CV-referenced bullet",
              { bulletId: b.id, table: "experienceBullet" },
            );
          }

          await tx.experienceBullet.update({
            where: { id: b.id },
            data: {
              text: guardedText,
              isActive: b.isActive,
              isArchived: b.isArchived,
              type: b.type,
              sortOrder: b.sortOrder ?? idx,
            },
          });
        } else {
          await tx.experienceBullet.create({
            data: {
              experienceId: id,
              text: b.text,
              isActive: b.isActive,
              isArchived: b.isArchived,
              type: b.type,
              sortOrder: b.sortOrder ?? idx,
            },
          });
        }
      }

      // 4. Update parent experience details
      return tx.experience.update({
        where: { id },
        data: {
          company: data.company,
          position: data.position,
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : null,
          current: data.current,
          freeFormContext: data.freeFormContext,
          tabLabel: data.tabLabel ?? null,
        },
        include: {
          bullets: {
            where: {
              isArchived: false,
            },
            include: {
              usedInCVs: {
                include: {
                  cv: true,
                },
              },
            },
            orderBy: {
              sortOrder: "asc",
            },
          },
        },
      });
    });

    const responseData = {
      id: updatedExp.id,
      company: updatedExp.company,
      position: updatedExp.position,
      startDate: updatedExp.startDate.toISOString(),
      endDate: updatedExp.endDate ? updatedExp.endDate.toISOString() : null,
      current: updatedExp.current,
      freeFormContext: updatedExp.freeFormContext,
      tabLabel: updatedExp.tabLabel ?? null,
      bullets: updatedExp.bullets.map((b) => ({
        id: b.id,
        text: b.text,
        isActive: b.isActive,
        isArchived: b.isArchived,
        type: b.type,
        sortOrder: b.sortOrder,
        usedInCVs: b.usedInCVs.map((uc) => ({
          id: uc.cv.id,
          name: uc.cv.name,
          jobListingId: uc.cv.jobListingId,
        })),
      })),
    };

    logger.info("Experience updated successfully", { experienceId: id });

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error("Failed to update experience", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, props: Params) {
  try {
    const { id } = await props.params;
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Verify ownership
    const experience = await prisma.experience.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!experience || experience.profile.userId !== userId) {
      return NextResponse.json(
        { error: "Experience not found or access denied" },
        { status: 404 },
      );
    }

    // Archive (not hard-delete) any bullet still referenced by a CV so the CV's rendered
    // content survives; unreferenced bullets hard-delete normally — mirrors the PUT handler's
    // own inline `usedCount` check above (REM-3, spectech.md Decision 3).
    await prisma.$transaction(async (tx) => {
      const bullets = await tx.experienceBullet.findMany({
        where: { experienceId: id },
      });

      // Single aggregate query instead of one `count()` per bullet (N+1 fix).
      const usageCounts = await tx.cVBullet.groupBy({
        by: ["experienceBulletId"],
        where: { experienceBulletId: { in: bullets.map((b) => b.id) } },
        _count: true,
      });
      const referencedBulletIds = new Set(
        usageCounts.map((u) => u.experienceBulletId),
      );

      for (const bullet of bullets) {
        if (referencedBulletIds.has(bullet.id)) {
          await tx.experienceBullet.update({
            where: { id: bullet.id },
            data: { isArchived: true, isActive: false, experienceId: null },
          });
        } else {
          await tx.experienceBullet.delete({
            where: { id: bullet.id },
          });
        }
      }

      await tx.experience.delete({
        where: { id },
      });
    });

    logger.info("Experience deleted successfully", { experienceId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete experience", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
