import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { llmConfigSchema } from "@/lib/validation/adminSchemas";
import {
  LLMProvider,
  EmbeddingProvider,
  CredentialStatus,
} from "@/types/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const configs = await prisma.systemConfig.findMany({
      where: {
        key: {
          in: [
            "AI_PROVIDER_DEFAULT",
            "AI_PROVIDER_PARSING",
            "AI_PROVIDER_SUMMARIES",
            "AI_PROVIDER_PROFILE",
            "AI_PROVIDER_EMBEDDING",
            "AI_PROVIDER_DEFAULT_BLOCKED_UNTIL",
            "AI_PROVIDER_PARSING_BLOCKED_UNTIL",
            "AI_PROVIDER_SUMMARIES_BLOCKED_UNTIL",
            "AI_PROVIDER_PROFILE_BLOCKED_UNTIL",
            "AI_PROVIDER_EMBEDDING_BLOCKED_UNTIL",
          ],
        },
      },
    });

    const configMap = new Map(configs.map((c) => [c.key, c.value]));

    const defaultProvider = (configMap.get("AI_PROVIDER_DEFAULT") ||
      "ollama") as LLMProvider;
    const parsingProvider = (configMap.get("AI_PROVIDER_PARSING") ||
      "ollama") as LLMProvider;
    const summariesProvider = (configMap.get("AI_PROVIDER_SUMMARIES") ||
      "gemini") as LLMProvider;
    const profileProvider = (configMap.get("AI_PROVIDER_PROFILE") ||
      "ollama") as LLMProvider;
    const embeddingProvider = (configMap.get("AI_PROVIDER_EMBEDDING") ||
      "ollama") as EmbeddingProvider;

    const defaultBlockedUntil = configMap.get(
      "AI_PROVIDER_DEFAULT_BLOCKED_UNTIL",
    );
    const parsingBlockedUntil = configMap.get(
      "AI_PROVIDER_PARSING_BLOCKED_UNTIL",
    );
    const summariesBlockedUntil = configMap.get(
      "AI_PROVIDER_SUMMARIES_BLOCKED_UNTIL",
    );
    const profileBlockedUntil = configMap.get(
      "AI_PROVIDER_PROFILE_BLOCKED_UNTIL",
    );
    const embeddingBlockedUntil = configMap.get(
      "AI_PROVIDER_EMBEDDING_BLOCKED_UNTIL",
    );

    const now = new Date();
    const defaultBlocked = defaultBlockedUntil
      ? new Date(defaultBlockedUntil) > now
      : false;
    const parsingBlocked = parsingBlockedUntil
      ? new Date(parsingBlockedUntil) > now
      : false;
    const summariesBlocked = summariesBlockedUntil
      ? new Date(summariesBlockedUntil) > now
      : false;
    const profileBlocked = profileBlockedUntil
      ? new Date(profileBlockedUntil) > now
      : false;
    const embeddingBlocked = embeddingBlockedUntil
      ? new Date(embeddingBlockedUntil) > now
      : false;

    const ollamaUrl = process.env.OLLAMA_BASE_URL;
    const geminiKey = process.env.GEMINI_API_KEY;
    const claudeKey = process.env.CLAUDE_API_KEY;

    const credentialStatus: CredentialStatus = {
      ollama: !!(ollamaUrl && ollamaUrl.length > 0),
      gemini: !!(
        geminiKey &&
        geminiKey.length > 0 &&
        geminiKey !== "your-gemini-api-key-here"
      ),
      claude: !!(claudeKey && claudeKey.length > 0),
    };

    return NextResponse.json({
      config: {
        defaultProvider,
        parsingProvider,
        summariesProvider,
        profileProvider,
        embeddingProvider,
      },
      blockedStatus: {
        defaultProvider: defaultBlocked ? defaultBlockedUntil : null,
        parsingProvider: parsingBlocked ? parsingBlockedUntil : null,
        summariesProvider: summariesBlocked ? summariesBlockedUntil : null,
        profileProvider: profileBlocked ? profileBlockedUntil : null,
        embeddingProvider: embeddingBlocked ? embeddingBlockedUntil : null,
      },
      credentialStatus,
    });
  } catch (error) {
    logger.error("Failed to load configuration", { error });
    return NextResponse.json(
      { error: "Failed to load configuration" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { key } = body;
    if (
      ![
        "AI_PROVIDER_DEFAULT",
        "AI_PROVIDER_PARSING",
        "AI_PROVIDER_SUMMARIES",
        "AI_PROVIDER_PROFILE",
      ].includes(key)
    ) {
      return NextResponse.json(
        { error: "Invalid provider key" },
        { status: 400 },
      );
    }

    const { resetProviderBlock } = await import("@/lib/ai/circuit-breaker");
    await resetProviderBlock(key);

    logger.info("LLM provider block reset manually by admin", {
      userId: session.user.id,
      email: session.user.email,
      providerKey: key,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to reset provider block", { error });
    return NextResponse.json(
      { error: "Failed to reset provider block" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const result = llmConfigSchema.safeParse(body);
    if (!result.success) {
      const details = result.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return NextResponse.json(
        { error: "Validation failed", details },
        { status: 400 },
      );
    }

    const {
      defaultProvider,
      parsingProvider,
      summariesProvider,
      profileProvider,
      embeddingProvider,
    } = result.data;

    // Read the previously stored embedding provider before overwriting it, so a change can be
    // detected (NFR "Compatibilidade de Embeddings" — cross-provider vectors are incomparable).
    const previousEmbeddingConfig = await prisma.systemConfig.findUnique({
      where: { key: "AI_PROVIDER_EMBEDDING" },
    });
    const embeddingProviderChanged =
      !!previousEmbeddingConfig &&
      previousEmbeddingConfig.value !== embeddingProvider;

    await prisma.$transaction([
      prisma.systemConfig.upsert({
        where: { key: "AI_PROVIDER_DEFAULT" },
        create: { key: "AI_PROVIDER_DEFAULT", value: defaultProvider },
        update: { value: defaultProvider },
      }),
      prisma.systemConfig.upsert({
        where: { key: "AI_PROVIDER_PARSING" },
        create: { key: "AI_PROVIDER_PARSING", value: parsingProvider },
        update: { value: parsingProvider },
      }),
      prisma.systemConfig.upsert({
        where: { key: "AI_PROVIDER_SUMMARIES" },
        create: { key: "AI_PROVIDER_SUMMARIES", value: summariesProvider },
        update: { value: summariesProvider },
      }),
      prisma.systemConfig.upsert({
        where: { key: "AI_PROVIDER_PROFILE" },
        create: { key: "AI_PROVIDER_PROFILE", value: profileProvider },
        update: { value: profileProvider },
      }),
      prisma.systemConfig.upsert({
        where: { key: "AI_PROVIDER_EMBEDDING" },
        create: { key: "AI_PROVIDER_EMBEDDING", value: embeddingProvider },
        update: { value: embeddingProvider },
      }),
    ]);

    if (embeddingProviderChanged) {
      const [profileResetResult, jobsRequeuedResult] =
        await prisma.$transaction([
          prisma.userProfile.updateMany({
            where: { embeddingSyncedAt: { not: null } },
            data: { embeddingSyncedAt: null },
          }),
          prisma.jobListing.updateMany({
            where: { classificationStatus: "COMPLETED" },
            data: {
              classificationStatus: "PENDING",
              classificationAttempts: 0,
              classificationError: null,
            },
          }),
        ]);

      logger.warn("embedding_provider_changed", {
        userId: session.user.id,
        email: session.user.email,
        previousProvider: previousEmbeddingConfig?.value,
        newProvider: embeddingProvider,
        profilesReset: profileResetResult.count,
        jobsRequeued: jobsRequeuedResult.count,
      });
    }

    logger.info("LLM config updated successfully by admin", {
      userId: session.user.id,
      email: session.user.email,
      updates: {
        defaultProvider,
        parsingProvider,
        summariesProvider,
        profileProvider,
        embeddingProvider,
      },
      embeddingProviderChanged,
    });

    return NextResponse.json({
      success: true,
      updated: {
        defaultProvider,
        parsingProvider,
        summariesProvider,
        profileProvider,
        embeddingProvider,
      },
      embeddingProviderChanged,
    });
  } catch (error) {
    console.error("POST config error:", error);
    logger.error("Failed to update configuration", { error });
    return NextResponse.json(
      { error: "Failed to update configuration" },
      { status: 500 },
    );
  }
}
