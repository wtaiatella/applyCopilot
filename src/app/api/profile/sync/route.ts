import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import {
  fetchUserProfileData,
  isProfileEmpty,
  consolidateProfileToText,
  consolidateNarrativeProfileToText,
  extractProfileFacts,
  canonicalizeProfileFacts,
} from "@/services/profileSyncService";
import { generateEmbedding } from "@/lib/ai/vector-service";
import { AIServiceUnavailableError } from "@/lib/ai/aiClient";
import { ProfileFactsSchema } from "@/lib/validation/profileFactsSchema";

export async function POST(request: Request) {
  void request;
  try {
    // 1. Authenticate user
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Fetch User Profile
    const profile = await fetchUserProfileData(userId);
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // 3. Check if empty
    if (isProfileEmpty(profile)) {
      return NextResponse.json(
        {
          error:
            "Please fill in at least one skill or experience before syncing with the AI.",
        },
        { status: 400 },
      );
    }

    // 4. Consolidate profile details to string (plus narrative-only snapshot for softSkills stabilization)
    const consolidatedText = consolidateProfileToText(profile);
    const narrativeText = consolidateNarrativeProfileToText(profile);

    // 5. Extract structured ProfileFacts via the configured "profile" LLM capability
    let rawProfileFacts;
    try {
      rawProfileFacts = await extractProfileFacts(consolidatedText);
    } catch (error) {
      if (error instanceof AIServiceUnavailableError) {
        logger.warn("AI service unavailable during ProfileFacts extraction", {
          userId,
        });
        return NextResponse.json({ error: error.message }, { status: 503 });
      }
      logger.error("ProfileFacts extraction failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500 },
      );
    }

    // 5b. Canonicalize skills/softSkills against the write-path vocabulary (T007, FR-08, APC-51) —
    // deterministically unioning explicit active user skills and preserving prior validated
    // softSkills when narrative prose sections have not changed since the last sync.
    const priorFactsParsed =
      profile.profileFacts !== null && profile.profileFacts !== undefined
        ? ProfileFactsSchema.safeParse(profile.profileFacts)
        : null;
    const preserveSoftSkills =
      profile.aiCleanedText !== null &&
      profile.aiCleanedText !== undefined &&
      profile.aiCleanedText === narrativeText &&
      priorFactsParsed?.success &&
      priorFactsParsed.data.softSkills.length > 0
        ? priorFactsParsed.data.softSkills
        : undefined;

    const explicitSkills = (profile.skills ?? [])
      .map((s) => s.name.trim())
      .filter(Boolean);

    const canonicalizedProfileFacts = await canonicalizeProfileFacts(
      rawProfileFacts,
      {
        explicitSkills,
        preserveSoftSkills,
      },
    );

    // 6. Validate the extracted shape (FR-22: invalid -> 400, no DB write, prior data preserved)
    const parseResult = ProfileFactsSchema.safeParse(canonicalizedProfileFacts);
    if (!parseResult.success) {
      logger.error(
        "ProfileFacts failed Zod validation. No DB write (prior data preserved).",
        {
          error: parseResult.error.message,
        },
      );
      return NextResponse.json(
        {
          error: "AI returned invalid ProfileFacts",
          details: parseResult.error.issues,
        },
        { status: 400 },
      );
    }
    const profileFacts = parseResult.data;

    // 7. Generate the skills-list embedding (provider unavailable -> 503, no DB write)
    let embeddingVector: number[];
    try {
      embeddingVector = await generateEmbedding(profileFacts.skills.join(" "));
    } catch (error) {
      if (error instanceof AIServiceUnavailableError) {
        logger.warn(
          "AI service unavailable during ProfileFacts embedding generation. No DB write (prior data preserved).",
          { userId },
        );
        return NextResponse.json({ error: error.message }, { status: 503 });
      }
      logger.error(
        "Embedding generation failed for ProfileFacts. No DB write (prior data preserved).",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return NextResponse.json(
        { error: "Embedding provider unavailable" },
        { status: 502 },
      );
    }

    // 8. Save narrative snapshot, profileFacts, and embedding vector to the DB via raw SQL due to Prisma unsupported column limitations
    const vectorString = `[${embeddingVector.join(",")}]`;
    await prisma.$executeRaw`
      UPDATE "UserProfile"
      SET
        "aiCleanedText" = ${narrativeText},
        "profileFacts" = ${JSON.stringify(profileFacts)}::jsonb,
        "embedding" = ${vectorString}::vector,
        "embeddingSyncedAt" = NOW()
      WHERE "id" = ${profile.id}
    `;

    logger.info(
      `Profile synchronized successfully with AI for user: ${userId}`,
    );

    return NextResponse.json({
      success: true,
      profileFacts,
    });
  } catch (error) {
    if (error instanceof AIServiceUnavailableError) {
      logger.warn("AI service unavailable during profile sync");
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    logger.error("Error synchronizing profile with AI", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 },
    );
  }
}
