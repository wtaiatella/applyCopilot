import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/database/wipe-profile
 *
 * ADMIN-only endpoint. Wipes all profile data for the currently authenticated
 * user while preserving the User record itself (login credentials remain intact).
 *
 * Deletion order follows the schema FK dependency chain to avoid constraint
 * violations. Mirrors the logic of the v1 test script (wipe-db.ts) but scoped
 * to a single user instead of the entire database.
 */
export async function POST() {
  try {
    const session = await auth();

    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden — ADMIN role required" }, { status: 403 });
    }

    const userId = session.user.id;

    // Resolve the UserProfile for this user
    const userProfile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!userProfile) {
      return NextResponse.json(
        { error: "No profile found for this user — nothing to wipe." },
        { status: 404 }
      );
    }

    const profileId = userProfile.id;

    logger.warn(`[ADMIN] Starting profile data wipe for userId=${userId} profileId=${profileId}`);

    const summary: Record<string, number> = {};

    // ── Step 1: CVBullets (references bullets via FK — must go first) ─────────
    const cvIds = (
      await prisma.cV.findMany({ where: { profileId }, select: { id: true } })
    ).map((cv) => cv.id);

    if (cvIds.length > 0) {
      const cvBulletDel = await prisma.cVBullet.deleteMany({
        where: { cvId: { in: cvIds } },
      });
      summary["CVBullets"] = cvBulletDel.count;
    } else {
      summary["CVBullets"] = 0;
    }

    // ── Step 2: CV records ────────────────────────────────────────────────────
    const cvDel = await prisma.cV.deleteMany({ where: { profileId } });
    summary["CVs"] = cvDel.count;

    // ── Step 3: AIUsageLogs ───────────────────────────────────────────────────
    const aiLogDel = await prisma.aIUsageLog.deleteMany({ where: { userId } });
    summary["AIUsageLogs"] = aiLogDel.count;

    // ── Step 4: Experience bullets ────────────────────────────────────────────
    const expIds = (
      await prisma.experience.findMany({ where: { profileId }, select: { id: true } })
    ).map((e) => e.id);

    if (expIds.length > 0) {
      const expBulletDel = await prisma.experienceBullet.deleteMany({
        where: { experienceId: { in: expIds } },
      });
      summary["ExperienceBullets"] = expBulletDel.count;
    } else {
      summary["ExperienceBullets"] = 0;
    }

    // ── Step 5: Project bullets ───────────────────────────────────────────────
    const projIds = (
      await prisma.project.findMany({ where: { profileId }, select: { id: true } })
    ).map((p) => p.id);

    if (projIds.length > 0) {
      const projBulletDel = await prisma.projectBullet.deleteMany({
        where: { projectId: { in: projIds } },
      });
      summary["ProjectBullets"] = projBulletDel.count;
    } else {
      summary["ProjectBullets"] = 0;
    }

    // ── Step 6: Education bullets ─────────────────────────────────────────────
    const eduIds = (
      await prisma.education.findMany({ where: { profileId }, select: { id: true } })
    ).map((e) => e.id);

    if (eduIds.length > 0) {
      const eduBulletDel = await prisma.educationBullet.deleteMany({
        where: { educationId: { in: eduIds } },
      });
      summary["EducationBullets"] = eduBulletDel.count;
    } else {
      summary["EducationBullets"] = 0;
    }

    // ── Step 7: Parent entities ───────────────────────────────────────────────
    const expDel = await prisma.experience.deleteMany({ where: { profileId } });
    summary["Experiences"] = expDel.count;

    const projDel = await prisma.project.deleteMany({ where: { profileId } });
    summary["Projects"] = projDel.count;

    const eduDel = await prisma.education.deleteMany({ where: { profileId } });
    summary["Education"] = eduDel.count;

    const skillDel = await prisma.skill.deleteMany({ where: { profileId } });
    summary["Skills"] = skillDel.count;

    const refDel = await prisma.reference.deleteMany({ where: { profileId } });
    summary["References"] = refDel.count;

    const sumDel = await prisma.profileSummary.deleteMany({ where: { profileId } });
    summary["ProfileSummaries"] = sumDel.count;

    // ── Step 8: Reset UserProfile flat fields (keep the record itself) ────────
    await prisma.userProfile.update({
      where: { id: profileId },
      data: {
        firstName: null,
        lastName: null,
        title: null,
        summary: null,
        location: null,
        phone: null,
        website: null,
        github: null,
        linkedin: null,
      },
    });
    summary["UserProfileFieldsReset"] = 1;

    logger.warn(
      `[ADMIN] Profile data wipe completed for userId=${userId}`,
      { summary }
    );

    return NextResponse.json({
      ok: true,
      message: "Profile data wiped successfully. User account preserved.",
      summary,
    });
  } catch (error) {
    const err = error as Error;
    logger.error("[ADMIN] Failed to wipe profile data", { error: err.message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
