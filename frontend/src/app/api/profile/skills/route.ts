import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { SkillInputSchema } from "@/lib/validation/profileSchemas";
import { z } from "zod";

const SkillsPayloadSchema = z.array(SkillInputSchema);

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

    const parsed = SkillsPayloadSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return NextResponse.json({ error: "Validation failed", details }, { status: 400 });
    }

    const skillsData = parsed.data;

    // Perform replacement in a transaction
    const updatedSkills = await prisma.$transaction(async (tx) => {
      // 1. Delete existing skills
      await tx.skill.deleteMany({
        where: { profileId: profile.id },
      });

      // 2. Create new skills
      // Note: Because name + profileId is unique, we should deduplicate incoming list by normalized name first,
      // keeping the last one or the highest proficiency if duplicates exist. Here we will just map them,
      // but let's deduplicate by name to prevent DB unique constraint failures.
      const uniqueSkillsMap = new Map<string, typeof skillsData[number]>();
      for (const s of skillsData) {
        uniqueSkillsMap.set(s.name.toLowerCase().trim(), s);
      }
      const uniqueSkills = Array.from(uniqueSkillsMap.values());

      if (uniqueSkills.length > 0) {
        await tx.skill.createMany({
          data: uniqueSkills.map((s) => ({
            profileId: profile.id,
            name: s.name,
            proficiency: s.proficiency,
            yearsExperience: s.yearsExperience ?? null,
          })),
        });
      }

      return tx.skill.findMany({
        where: { profileId: profile.id },
      });
    });

    const responseData = updatedSkills.map((s) => ({
      id: s.id,
      name: s.name,
      proficiency: s.proficiency,
      yearsExperience: s.yearsExperience,
    }));

    logger.info("Skills updated successfully", { profileId: profile.id, count: responseData.length });

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error("Failed to update skills", { error });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
