import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { ExperienceInputSchema } from "@/lib/validation/profileSchemas";

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

    const parsed = ExperienceInputSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return NextResponse.json({ error: "Validation failed", details }, { status: 400 });
    }

    const data = parsed.data;

    // Create experience
    const newExp = await prisma.experience.create({
      data: {
        profileId: profile.id,
        company: data.company,
        position: data.position,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        current: data.current,
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

    // Map to DTO format
    const responseData = {
      id: newExp.id,
      company: newExp.company,
      position: newExp.position,
      startDate: newExp.startDate.toISOString(),
      endDate: newExp.endDate ? newExp.endDate.toISOString() : null,
      current: newExp.current,
      freeFormContext: newExp.freeFormContext,
      tabLabel: newExp.tabLabel ?? null,
      bullets: newExp.bullets.map((b) => ({
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

    logger.info("Experience created successfully", { profileId: profile.id, experienceId: newExp.id });

    return NextResponse.json(responseData, { status: 201 });
  } catch (error) {
    logger.error("Failed to create experience", { error });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
