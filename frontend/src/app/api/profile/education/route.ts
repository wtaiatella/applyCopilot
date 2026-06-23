import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { EducationInputSchema } from "@/lib/validation/profileSchemas";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Find profile
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
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
      return NextResponse.json({ error: "Validation failed", details }, { status: 400 });
    }

    const data = parsed.data;

    // Create education
    const newEd = await prisma.education.create({
      data: {
        profileId: profile.id,
        institution: data.institution,
        degree: data.degree,
        fieldOfStudy: data.fieldOfStudy || null,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        current: data.current,
        hideEndDate: data.hideEndDate,
        freeFormContext: data.freeFormContext,
        tabLabel: data.tabLabel ?? null,
        bullets: {
          create: data.bullets.map((b, idx) => ({
            text: b.text,
            isActive: b.isActive,
            isArchived: b.isArchived,
            type: b.type,
            sortOrder: b.sortOrder ?? idx,
          })),
        },
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

    // Map to DTO
    const responseData = {
      id: newEd.id,
      institution: newEd.institution,
      degree: newEd.degree,
      fieldOfStudy: newEd.fieldOfStudy,
      startDate: newEd.startDate.toISOString(),
      endDate: newEd.endDate ? newEd.endDate.toISOString() : null,
      current: newEd.current,
      hideEndDate: newEd.hideEndDate,
      freeFormContext: newEd.freeFormContext,
      tabLabel: newEd.tabLabel ?? null,
      bullets: newEd.bullets.map((b) => ({
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

    logger.info("Education created successfully", { profileId: profile.id, educationId: newEd.id });

    return NextResponse.json(responseData, { status: 201 });
  } catch (error) {
    logger.error("Failed to create education", { error });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
