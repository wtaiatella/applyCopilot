import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import {
  fetchUserProfileData,
  isProfileEmpty,
  consolidateProfileToText,
  cleanProfileWithLLM,
} from "@/services/profileSyncService";
import { generateEmbedding } from "@/lib/ai/vector-service";

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
        { error: "Please fill in at least one skill or experience before syncing with the AI." },
        { status: 400 }
      );
    }

    // 4. Consolidate profile details to string
    const consolidatedText = consolidateProfileToText(profile);

    // 5. Clean profile text via configured LLM summaries provider
    const cleanedText = await cleanProfileWithLLM(consolidatedText);

    // 6. Generate 512-dimension vector local embedding
    const embeddingVector = await generateEmbedding(cleanedText);

    // 7. Save cleaned text and embedding vector to the DB via raw SQL due to Prisma unsupported column limitations
    const vectorString = `[${embeddingVector.join(",")}]`;
    await prisma.$executeRaw`
      UPDATE "UserProfile"
      SET 
        "aiCleanedText" = ${cleanedText},
        "embedding" = ${vectorString}::vector,
        "embeddingSyncedAt" = NOW()
      WHERE "id" = ${profile.id}
    `;

    logger.info(`Profile synchronized successfully with AI for user: ${userId}`);

    return NextResponse.json({
      success: true,
      cleanedText,
    });
  } catch (error) {
    logger.error("Error synchronizing profile with AI", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
