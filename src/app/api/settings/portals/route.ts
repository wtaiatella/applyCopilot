import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { checkRobotsTxt } from "@/lib/scraper/robots";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const portals = await prisma.portalSearchUrl.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(portals);
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
    const { url, portalId, name } = body;

    if (!url || !portalId || !name) {
      return NextResponse.json({ error: "Missing required fields: url, portalId, name" }, { status: 400 });
    }

    // Get User-Agent for robots.txt check
    const uaConfig = await prisma.systemConfig.findUnique({ where: { key: "SCRAPER_USER_AGENT" } });
    const userAgent = uaConfig?.value || "ApplyCopilot/1.0";

    // Run checkRobotsTxt
    const isRobotsBlocked = await checkRobotsTxt(url, userAgent);

    const config = await prisma.portalSearchUrl.create({
      data: {
        url,
        portalId,
        name,
        isActive: true,
        status: "ACTIVE",
        isRobotsBlocked,
      },
    });

    return NextResponse.json(config);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
