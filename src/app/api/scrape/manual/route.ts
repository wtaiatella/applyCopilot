import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, portalId, type } = body;

    if (!url || !portalId || !type) {
      return NextResponse.json({ error: "Missing url, portalId, or type" }, { status: 400 });
    }

    const task = await prisma.scrapeTask.create({
      data: {
        type: type as "LIST" | "DEEP",
        portalId: portalId,
        status: "PENDING",
        searchUrl: url,
        progress: 0,
        triggeredBy: "admin",
      },
    });

    console.log(`[Scraper Manual] Manually enqueued background task ${task.id} (${type}) for portal ${portalId}`);
    return NextResponse.json({ taskId: task.id });
  } catch (error: any) {
    console.error("[Scraper Manual API] Trigger failed:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
