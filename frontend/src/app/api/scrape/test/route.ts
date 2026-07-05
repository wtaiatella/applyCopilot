import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { getStrategy } from "@/lib/scraper/registry";
import { fetchHtml } from "@/lib/scraper/engine";
import { prisma } from "@/lib/db/prisma";

// Trigger auto-registration of strategies
import "@/lib/scraper/portals/example";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, portalId } = body;
    const type = body.type || "LIST";

    if (!url || !portalId) {
      return NextResponse.json({ error: "Missing url or portalId" }, { status: 400 });
    }

    const strategy = getStrategy(portalId);
    if (!strategy) {
      return NextResponse.json({ error: `Portal strategy ${portalId} not found` }, { status: 404 });
    }

    const userAgentConfig = await prisma.systemConfig.findUnique({ where: { key: "SCRAPER_USER_AGENT" } });
    const userAgent = userAgentConfig?.value || "ApplyCopilot/1.0";

    console.log(`[Scraper Tester] Sync testing ${type} extraction for ${portalId} using User-Agent: ${userAgent}`);
    const html = await fetchHtml(url, userAgent);
    const $ = cheerio.load(html);

    if (type === "LIST") {
      const results = await strategy.extractList(html, $, { searchUrl: url, userAgent });
      return NextResponse.json({ type: "LIST", count: results.length, data: results });
    } else {
      const result = await strategy.extractDeep(html, $);
      return NextResponse.json({ type: "DEEP", data: result });
    }
  } catch (error: any) {
    console.error("[Scraper Tester API] Test failed:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
