import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { checkRobotsTxt } from "@/lib/scraper/robots";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const config = await prisma.portalSearchUrl.findUnique({
      where: { id },
    });

    if (!config) {
      return NextResponse.json({ error: "Configuration not found" }, { status: 404 });
    }

    const uaConfig = await prisma.systemConfig.findUnique({ where: { key: "SCRAPER_USER_AGENT" } });
    const userAgent = uaConfig?.value || "ApplyCopilot/1.0";

    const isRobotsBlocked = await checkRobotsTxt(config.url, userAgent);

    const updated = await prisma.portalSearchUrl.update({
      where: { id },
      data: { isRobotsBlocked },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
