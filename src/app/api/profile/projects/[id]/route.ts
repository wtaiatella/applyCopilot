import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { ProjectInputSchema } from "@/lib/validation/profileSchemas";
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
    const project = await prisma.project.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!project || project.profile.userId !== userId) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 404 },
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = ProjectInputSchema.safeParse(body);
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
    const existingBullets = await prisma.projectBullet.findMany({
      where: { projectId: id, isArchived: false },
    });

    const incomingBullets = data.bullets;
    const incomingIds = incomingBullets
      .filter((b) => b.id)
      .map((b) => b.id) as string[];

    const bulletsToDelete = existingBullets.filter(
      (b) => !incomingIds.includes(b.id),
    );

    // Update in transaction
    const updatedProj = await prisma.$transaction(async (tx) => {
      // 1. Reconcile removed bullets (soft-delete if used in CVs, hard-delete otherwise)
      if (bulletsToDelete.length > 0) {
        for (const bullet of bulletsToDelete) {
          const usedCount = await tx.cVBullet.count({
            where: { projectBulletId: bullet.id },
          });

          if (usedCount > 0) {
            await tx.projectBullet.update({
              where: { id: bullet.id },
              data: { isArchived: true, isActive: false },
            });
          } else {
            await tx.projectBullet.delete({
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
              by: ["projectBulletId"],
              where: { projectBulletId: { in: guardedBulletIds } },
              _count: true,
            })
          : [];
      const usedCountByBulletId = new Map(
        usageCounts.map((u) => [u.projectBulletId, u._count]),
      );
      const existingTextByBulletId = new Map(
        existingBullets.map((b) => [b.id, b.text]),
      );

      // 3. Upsert incoming bullets
      for (const [idx, b] of incomingBullets.entries()) {
        if (b.id) {
          const existingText = existingTextByBulletId.get(b.id);
          if (existingText === undefined) {
            // b.id is not among this project's active bullets — reject to prevent a
            // cross-parent bypass of the immutability guard (security fix, §6 rework).
            logger.warn(
              "Rejected bullet update: id not found among this project's bullets",
              { bulletId: b.id, projectId: id },
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
              { bulletId: b.id, table: "projectBullet" },
            );
          }

          await tx.projectBullet.update({
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
          await tx.projectBullet.create({
            data: {
              projectId: id,
              text: b.text,
              isActive: b.isActive,
              isArchived: b.isArchived,
              type: b.type,
              sortOrder: b.sortOrder ?? idx,
            },
          });
        }
      }

      // 4. Update parent project details
      return tx.project.update({
        where: { id },
        data: {
          name: data.name,
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
          current: data.current,
          technologies: data.technologies,
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
      id: updatedProj.id,
      name: updatedProj.name,
      startDate: updatedProj.startDate
        ? updatedProj.startDate.toISOString()
        : null,
      endDate: updatedProj.endDate ? updatedProj.endDate.toISOString() : null,
      current: updatedProj.current,
      technologies: updatedProj.technologies,
      freeFormContext: updatedProj.freeFormContext,
      tabLabel: updatedProj.tabLabel ?? null,
      bullets: updatedProj.bullets.map((b) => ({
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

    logger.info("Project updated successfully", { projectId: id });

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error("Failed to update project", { error });
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
    const project = await prisma.project.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!project || project.profile.userId !== userId) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 404 },
      );
    }

    await prisma.project.delete({
      where: { id },
    });

    logger.info("Project deleted successfully", { projectId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete project", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
