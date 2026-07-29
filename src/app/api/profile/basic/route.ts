import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { BasicDataInputSchema } from "@/lib/validation/profileSchemas";
import { BasicDataDTO } from "@/types/profile";

export async function PUT(req: Request) {
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

    const parsed = BasicDataInputSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return NextResponse.json({ error: "Validation failed", details }, { status: 400 });
    }

    const data = parsed.data;

    let finalTitle = data.title;
    let finalSummary = data.summary;

    if (data.summaries !== undefined) {
      const activeSummary = data.summaries.find((s) => s.isActive);
      if (activeSummary) {
        finalTitle = activeSummary.title;
        finalSummary = activeSummary.content;
      } else {
        finalTitle = null;
        finalSummary = null;
      }
    }

    const updatedProfile = await prisma.$transaction(async (tx) => {
      // 1. Reconcile summaries if provided
      if (data.summaries !== undefined) {
        const existingSummaries = await tx.profileSummary.findMany({
          where: { profileId: profile.id },
        });

        const incomingIds = data.summaries.filter((s) => s.id).map((s) => s.id) as string[];
        const summariesToDelete = existingSummaries.filter((s) => !incomingIds.includes(s.id));

        if (summariesToDelete.length > 0) {
          await tx.profileSummary.deleteMany({
            where: { id: { in: summariesToDelete.map((s) => s.id) } },
          });
        }

        for (const [idx, s] of data.summaries.entries()) {
          if (s.id) {
            await tx.profileSummary.update({
              where: { id: s.id },
              data: {
                title: s.title,
                content: s.content,
                isAIGenerated: s.isAIGenerated,
                isActive: s.isActive,
                sortOrder: s.sortOrder ?? idx,
              },
            });
          } else {
            await tx.profileSummary.create({
              data: {
                profileId: profile.id,
                title: s.title,
                content: s.content,
                isAIGenerated: s.isAIGenerated,
                isActive: s.isActive,
                sortOrder: s.sortOrder ?? idx,
              },
            });
          }
        }
      }

      // 2. Update parent UserProfile basic fields
      const updateData: any = {};
      if (data.firstName !== undefined) updateData.firstName = data.firstName;
      if (data.lastName !== undefined) updateData.lastName = data.lastName;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.location !== undefined) updateData.location = data.location;
      if (data.linkedin !== undefined) updateData.linkedin = data.linkedin;
      if (data.github !== undefined) updateData.github = data.github;
      if (data.website !== undefined) updateData.website = data.website;

      if (data.summaries !== undefined) {
        updateData.title = finalTitle;
        updateData.summary = finalSummary;
      } else {
        if (data.title !== undefined) updateData.title = data.title;
        if (data.summary !== undefined) updateData.summary = data.summary;
      }

      return tx.userProfile.update({
        where: { id: profile.id },
        data: updateData,
      });
    });

    const responseData: BasicDataDTO = {
      firstName: updatedProfile.firstName,
      lastName: updatedProfile.lastName,
      email: session.user.email || "",
      phone: updatedProfile.phone,
      location: updatedProfile.location,
      linkedin: updatedProfile.linkedin,
      github: updatedProfile.github,
      website: updatedProfile.website,
      title: updatedProfile.title,
      summary: updatedProfile.summary,
    };

    logger.info("Profile basic data updated successfully", { profileId: profile.id });

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error("Failed to update profile basic data", { error });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
