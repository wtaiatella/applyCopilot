import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { EducationInputSchema } from "@/lib/validation/profileSchemas";

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
    const education = await prisma.education.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!education || education.profile.userId !== userId) {
      return NextResponse.json(
        { error: "Education not found or access denied" },
        { status: 404 },
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = EducationInputSchema.safeParse(body);
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
    const existingBullets = await prisma.educationBullet.findMany({
      where: { educationId: id, isArchived: false },
    });

    const incomingBullets = data.bullets;
    const incomingIds = incomingBullets
      .filter((b) => b.id)
      .map((b) => b.id) as string[];

    const bulletsToDelete = existingBullets.filter(
      (b) => !incomingIds.includes(b.id),
    );

    // Update in transaction
    const updatedEd = await prisma.$transaction(async (tx) => {
      // 1. Reconcile removed bullets (soft-delete if used in CVs, hard-delete otherwise)
      if (bulletsToDelete.length > 0) {
        for (const bullet of bulletsToDelete) {
          const usedCount = await tx.cVBullet.count({
            where: { educationBulletId: bullet.id },
          });

          if (usedCount > 0) {
            await tx.educationBullet.update({
              where: { id: bullet.id },
              data: { isArchived: true, isActive: false },
            });
          } else {
            await tx.educationBullet.delete({
              where: { id: bullet.id },
            });
          }
        }
      }

      // 2. Upsert incoming bullets
      for (const [idx, b] of incomingBullets.entries()) {
        if (b.id) {
          await tx.educationBullet.update({
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
          await tx.educationBullet.create({
            data: {
              educationId: id,
              text: b.text,
              isActive: b.isActive,
              isArchived: b.isArchived,
              type: b.type,
              sortOrder: b.sortOrder ?? idx,
            },
          });
        }
      }

      // 3. Update parent education details
      return tx.education.update({
        where: { id },
        data: {
          institution: data.institution,
          degree: data.degree,
          fieldOfStudy: data.fieldOfStudy || null,
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : null,
          current: data.current,
          hideEndDate: data.hideEndDate,
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
      id: updatedEd.id,
      institution: updatedEd.institution,
      degree: updatedEd.degree,
      fieldOfStudy: updatedEd.fieldOfStudy,
      startDate: updatedEd.startDate.toISOString(),
      endDate: updatedEd.endDate ? updatedEd.endDate.toISOString() : null,
      current: updatedEd.current,
      hideEndDate: updatedEd.hideEndDate,
      freeFormContext: updatedEd.freeFormContext,
      tabLabel: updatedEd.tabLabel ?? null,
      bullets: updatedEd.bullets.map((b) => ({
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

    logger.info("Education updated successfully", { educationId: id });

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error("Failed to update education", { error });
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
    const education = await prisma.education.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!education || education.profile.userId !== userId) {
      return NextResponse.json(
        { error: "Education not found or access denied" },
        { status: 404 },
      );
    }

    await prisma.education.delete({
      where: { id },
    });

    logger.info("Education deleted successfully", { educationId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete education", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
