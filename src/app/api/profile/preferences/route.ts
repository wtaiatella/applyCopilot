import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { UserPreferencesInputSchema } from "@/lib/validation/preferencesSchemas";
import { UserPreferencesDTO } from "@/types/profile";

// Default all-null shape returned by GET when the user never saved preferences
// (spectech.md Clarifications & Assumptions) — keeps the auto-save form bound to a
// stable shape instead of branching on 404.
const DEFAULT_PREFERENCES: UserPreferencesDTO = {
  seniority: null,
  totalYearsExperience: null,
  acceptsContract: null,
  acceptsFreelance: null,
  acceptsOnsite: null,
  acceptsHybrid: null,
  acceptsRemote: null,
  onlyWorldwide: null,
  hasUsWorkAuth: null,
  requiresVisaRelocation: null,
  salaryMin: null,
  salaryCurrency: null,
  excludeKeywords: [],
};

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const profile = await prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const preferences = await prisma.userPreferences.findUnique({
      where: { profileId: profile.id },
    });

    if (!preferences) {
      return NextResponse.json(DEFAULT_PREFERENCES);
    }

    const responseData: UserPreferencesDTO = {
      seniority: preferences.seniority as UserPreferencesDTO["seniority"],
      totalYearsExperience: preferences.totalYearsExperience,
      acceptsContract: preferences.acceptsContract,
      acceptsFreelance: preferences.acceptsFreelance,
      acceptsOnsite: preferences.acceptsOnsite,
      acceptsHybrid: preferences.acceptsHybrid,
      acceptsRemote: preferences.acceptsRemote,
      onlyWorldwide: preferences.onlyWorldwide,
      hasUsWorkAuth: preferences.hasUsWorkAuth,
      requiresVisaRelocation: preferences.requiresVisaRelocation,
      salaryMin: preferences.salaryMin,
      salaryCurrency: preferences.salaryCurrency,
      excludeKeywords: preferences.excludeKeywords,
    };

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error("Failed to fetch preferences", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

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

    const parsed = UserPreferencesInputSchema.safeParse(body);
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

    // Full-object upsert (matches SkillsForm's PUT-replace convention, spectech.md
    // Clarifications & Assumptions) — always scoped by the session-derived profileId,
    // never a client-supplied id (Security Requirements — no IDOR surface).
    const saved = await prisma.userPreferences.upsert({
      where: { profileId: profile.id },
      create: {
        profileId: profile.id,
        ...data,
      },
      update: {
        ...data,
      },
    });

    const responseData: UserPreferencesDTO = {
      seniority: saved.seniority as UserPreferencesDTO["seniority"],
      totalYearsExperience: saved.totalYearsExperience,
      acceptsContract: saved.acceptsContract,
      acceptsFreelance: saved.acceptsFreelance,
      acceptsOnsite: saved.acceptsOnsite,
      acceptsHybrid: saved.acceptsHybrid,
      acceptsRemote: saved.acceptsRemote,
      onlyWorldwide: saved.onlyWorldwide,
      hasUsWorkAuth: saved.hasUsWorkAuth,
      requiresVisaRelocation: saved.requiresVisaRelocation,
      salaryMin: saved.salaryMin,
      salaryCurrency: saved.salaryCurrency,
      excludeKeywords: saved.excludeKeywords,
    };

    logger.info("Preferences updated successfully", { profileId: profile.id });

    return NextResponse.json(responseData);
  } catch (error) {
    logger.error("Failed to update preferences", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
