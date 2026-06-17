import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { ExperienceInputSchema } from "@/lib/validation/profileSchemas";

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
      return NextResponse.json({ error: "Experience not found or access denied" }, { status: 404 });
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
      return NextResponse.json({ error: "Validation failed", details }, { status: 400 });
    }

    const data = parsed.data;

    // Load existing bullets
    const existingBullets = await prisma.experienceBullet.findMany({
      where: { experienceId: id },
    });

    const incomingBullets = data.bullets;
    const incomingIds = incomingBullets.filter((b) => b.id).map((b) => b.id) as string[];

    const bulletsToDelete = existingBullets.filter((b) => !incomingIds.includes(b.id));

    // Update in transaction
    const updatedExp = await prisma.$transaction(async (tx) => {
      // 1. Delete removed bullets
      if (bulletsToDelete.length > 0) {
        await tx.experienceBullet.deleteMany({
          where: {
            id: { in: bulletsToDelete.map((b) => b.id) },
          },
        });
      }

      // 2. Upsert incoming bullets
      for (const [idx, b] of incomingBullets.entries()) {
        if (b.id) {
          await tx.experienceBullet.update({
            where: { id: b.id },
            data: {
              text: b.text,
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

      // 3. Update parent experience details
      return tx.experience.update({
        where: { id },
        data: {
          company: data.company,
          position: data.position,
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : null,
          current: data.current,
          freeFormContext: data.freeFormContext,
        },
        include: {
          bullets: {
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
        })),
      })),
    };

    logger.info("Experience updated successfully", { experienceId: id });

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error("Failed to update experience", { error });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
      return NextResponse.json({ error: "Experience not found or access denied" }, { status: 404 });
    }

    await prisma.experience.delete({
      where: { id },
    });

    logger.info("Experience deleted successfully", { experienceId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete experience", { error });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
