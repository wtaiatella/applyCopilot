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
            "SCRAPER_RATE_LIMIT_DELAY",
            "SCRAPER_MAX_RETRIES",
            "SCRAPER_USER_AGENT",
          ],
        },
      },
    });

    const configMap = new Map(configs.map((c) => [c.key, c.value]));

    return NextResponse.json({
      globalScrapeInterval: parseInt(configMap.get("SCRAPER_GLOBAL_INTERVAL") || "360"),
      maxConcurrency: parseInt(configMap.get("SCRAPER_MAX_CONCURRENCY") || "3"),
      rateLimitDelay: parseInt(configMap.get("SCRAPER_RATE_LIMIT_DELAY") || "1000"),
      maxExtractionRetries: parseInt(configMap.get("SCRAPER_MAX_RETRIES") || "3"),
      userAgent: configMap.get("SCRAPER_USER_AGENT") || "ApplyCopilot/1.0",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { globalScrapeInterval, maxConcurrency, rateLimitDelay, maxExtractionRetries, userAgent } = body;

    const updates = [
      { key: "SCRAPER_GLOBAL_INTERVAL", value: String(globalScrapeInterval) },
      { key: "SCRAPER_MAX_CONCURRENCY", value: String(maxConcurrency) },
      { key: "SCRAPER_RATE_LIMIT_DELAY", value: String(rateLimitDelay) },
      { key: "SCRAPER_MAX_RETRIES", value: String(maxExtractionRetries) },
      { key: "SCRAPER_USER_AGENT", value: userAgent },
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
