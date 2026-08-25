import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { SkillInputSchema } from "@/lib/validation/profileSchemas";
import { reconcileSkillMutation } from "@/lib/db/cvBulletMutations";
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
      return NextResponse.json(
        { error: "Validation failed", details },
        { status: 400 },
      );
    }

    const skillsData = parsed.data;

    // Deduplicate incoming list by normalized name first (unchanged from before — keeps the
    // last entry when the client submits the same name twice).
    const uniqueSkillsMap = new Map<string, (typeof skillsData)[number]>();
    for (const s of skillsData) {
      uniqueSkillsMap.set(s.name.toLowerCase().trim(), s);
    }
    const uniqueSkills = Array.from(uniqueSkillsMap.values());
    const incomingNames = new Set(
      uniqueSkills.map((s) => s.name.toLowerCase().trim()),
    );

    // Perform replacement in a transaction — per-skill reconciliation (not blind delete-all +
    // recreate-all), so a skill already locked into a generated CV (CVBullet.skillId) is
    // archived rather than hard-deleted. A hard delete would either violate CVBullet's
    // "exactly one FK non-null" check constraint (ON DELETE SET NULL leaves the row with zero
    // non-null FKs) or, if the same name is simply recreated with a new id, silently detach the
    // historical CV's bullet from any current skill. See lib/db/cvBulletMutations.ts.
    const updatedSkills = await prisma.$transaction(async (tx) => {
      const existingSkills = await tx.skill.findMany({
        where: { profileId: profile.id, isArchived: false },
      });
      const existingByName = new Map(
        existingSkills.map((s) => [s.name.toLowerCase().trim(), s]),
      );

      // Skills removed by this edit (present before, absent from the new payload).
      for (const existing of existingSkills) {
        const key = existing.name.toLowerCase().trim();
        if (incomingNames.has(key)) continue;

        const usedCount = await tx.cVBullet.count({
          where: { skillId: existing.id },
        });
        if (usedCount > 0) {
          await tx.skill.update({
            where: { id: existing.id },
            data: { isArchived: true, isActive: false },
          });
        } else {
          await tx.skill.delete({ where: { id: existing.id } });
        }
      }

      // Skills added or edited by this submission.
      for (const s of uniqueSkills) {
        const key = s.name.toLowerCase().trim();
        const existing = existingByName.get(key);
        if (existing) {
          await reconcileSkillMutation(
            tx,
            existing.id,
            profile.id,
            s.name,
            s.proficiency,
            s.yearsExperience ?? null,
          );
        } else {
          await tx.skill.create({
            data: {
              profileId: profile.id,
              name: s.name,
              proficiency: s.proficiency,
              yearsExperience: s.yearsExperience ?? null,
            },
          });
        }
      }

      return tx.skill.findMany({
        where: { profileId: profile.id, isArchived: false },
      });
    });

    const responseData = updatedSkills.map((s) => ({
      id: s.id,
      name: s.name,
      proficiency: s.proficiency,
      yearsExperience: s.yearsExperience,
    }));

    logger.info("Skills updated successfully", {
      profileId: profile.id,
      count: responseData.length,
    });

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error("Failed to update skills", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
