import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import {
  fetchUserProfileData,
  isProfileEmpty,
  consolidateProfileToText,
  extractProfileFacts,
} from "@/services/profileSyncService";
import { generateEmbedding } from "@/lib/ai/vector-service";
import { ProfileFactsSchema } from "@/lib/validation/profileFactsSchema";

export async function POST(request: Request) {
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

    // 4. Consolidate profile details to string
    const consolidatedText = consolidateProfileToText(profile);

    // 5. Extract structured ProfileFacts via the configured "profile" LLM capability
    let rawProfileFacts;
    try {
      rawProfileFacts = await extractProfileFacts(consolidatedText);
    } catch (error) {
      logger.error("ProfileFacts extraction failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { error: "Internal Server Error" },
        { status: 500 },
      );
    }

    // 6. Validate the extracted shape (FR-22: invalid -> 400, no DB write, prior data preserved)
    const parseResult = ProfileFactsSchema.safeParse(rawProfileFacts);
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

    // 7. Generate the skills-list embedding (FR-23: provider failure -> 502, no DB write)
    let embeddingVector: number[];
    try {
      embeddingVector = await generateEmbedding(profileFacts.skills.join(" "));
    } catch (error) {
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

    // 8. Save profileFacts and embedding vector to the DB via raw SQL due to Prisma unsupported column limitations
    const vectorString = `[${embeddingVector.join(",")}]`;
    await prisma.$executeRaw`
      UPDATE "UserProfile"
      SET
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
