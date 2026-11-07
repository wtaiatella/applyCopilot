import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const configs = await prisma.systemConfig.findMany({
      where: {
        key: {
          in: [
            "SCRAPER_GLOBAL_INTERVAL",
            "SCRAPER_MAX_CONCURRENCY",
            "CLASSIFIER_CONCURRENCY",
            "SCRAPER_RATE_LIMIT_DELAY",
            "SCRAPER_MAX_RETRIES",
            "SCRAPER_USER_AGENT",
            "SCRAPER_JOB_RETENTION_DAYS",
          ],
        },
      },
    });

    const configMap = new Map(configs.map((c) => [c.key, c.value]));
    const parsedClassifierConcurrency = parseInt(
      configMap.get("CLASSIFIER_CONCURRENCY") || "3",
      10,
    );

    return NextResponse.json({
      globalScrapeInterval: parseInt(configMap.get("SCRAPER_GLOBAL_INTERVAL") || "360"),
      maxConcurrency: parseInt(configMap.get("SCRAPER_MAX_CONCURRENCY") || "3"),
      classifierConcurrency:
        Number.isNaN(parsedClassifierConcurrency) || parsedClassifierConcurrency < 1
          ? 3
          : parsedClassifierConcurrency,
      rateLimitDelay: parseInt(configMap.get("SCRAPER_RATE_LIMIT_DELAY") || "1000"),
      maxExtractionRetries: parseInt(configMap.get("SCRAPER_MAX_RETRIES") || "3"),
      userAgent: configMap.get("SCRAPER_USER_AGENT") || "ApplyCopilot/1.0",
      jobRetentionDays: parseInt(configMap.get("SCRAPER_JOB_RETENTION_DAYS") || "15"),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      globalScrapeInterval,
      maxConcurrency,
      classifierConcurrency,
      rateLimitDelay,
      maxExtractionRetries,
      userAgent,
      jobRetentionDays,
    } = body;

    if (classifierConcurrency !== undefined) {
      const parsedConcurrency =
        typeof classifierConcurrency === "number"
          ? classifierConcurrency
          : typeof classifierConcurrency === "string" && classifierConcurrency.trim() !== ""
            ? Number(classifierConcurrency)
            : NaN;

      if (
        !Number.isInteger(parsedConcurrency) ||
        parsedConcurrency < 1 ||
        parsedConcurrency > 10
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid classifierConcurrency: must be an integer between 1 and 10",
          },
          { status: 400 },
        );
      }
    }

    const updates = [
      { key: "SCRAPER_GLOBAL_INTERVAL", value: globalScrapeInterval !== undefined ? String(globalScrapeInterval) : undefined },
      { key: "SCRAPER_MAX_CONCURRENCY", value: maxConcurrency !== undefined ? String(maxConcurrency) : undefined },
      { key: "CLASSIFIER_CONCURRENCY", value: classifierConcurrency !== undefined ? String(classifierConcurrency) : undefined },
      { key: "SCRAPER_RATE_LIMIT_DELAY", value: rateLimitDelay !== undefined ? String(rateLimitDelay) : undefined },
      { key: "SCRAPER_MAX_RETRIES", value: maxExtractionRetries !== undefined ? String(maxExtractionRetries) : undefined },
      { key: "SCRAPER_USER_AGENT", value: userAgent },
      { key: "SCRAPER_JOB_RETENTION_DAYS", value: jobRetentionDays !== undefined ? String(jobRetentionDays) : undefined },
    ];

    for (const update of updates) {
      if (update.value !== undefined) {
        await prisma.systemConfig.upsert({
          where: { key: update.key },
          update: { value: update.value },
          create: { key: update.key, value: update.value },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
