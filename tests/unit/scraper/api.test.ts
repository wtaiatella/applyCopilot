/**
 * @jest-environment node
 */
import { POST as testHandler } from "@/app/api/scrape/test/route";
import { POST as manualHandler } from "@/app/api/scrape/manual/route";
import { GET as streamHandler } from "@/app/api/scrape/stream/route";
import { prisma } from "@/lib/db/prisma";
import { NextRequest } from "next/server";

describe("Scraper API Route Handlers", () => {
  // Track only the rows this test file creates so cleanup never touches
  // pre-existing/real data (registered scraper URLs, job listings, etc.).
  let taskIds: string[] = [];
  let portalIds: string[] = [];

  afterEach(async () => {
    if (taskIds.length) {
      await prisma.scrapeTask.deleteMany({ where: { id: { in: taskIds } } });
    }
    if (portalIds.length) {
      await prisma.portalSearchUrl.deleteMany({
        where: { id: { in: portalIds } },
      });
    }
    taskIds = [];
    portalIds = [];
  });

  afterAll(async () => {
    await prisma.$disconnect();
    const { pool } = await import("@/lib/db/prisma");
    await pool.end();
  });

  it("should fail POST /api/scrape/test with 400 if parameters are missing", async () => {
    const req = new NextRequest("http://localhost/api/scrape/test", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await testHandler(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing url or portalId");
  });

  it("should successfully trigger a manual background task via POST /api/scrape/manual", async () => {
    const req = new NextRequest("http://localhost/api/scrape/manual", {
      method: "POST",
      body: JSON.stringify({
        url: "https://example.com/manual-test",
        portalId: "example",
        type: "LIST",
      }),
    });
    const res = await manualHandler(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.taskId).toBeDefined();
    taskIds.push(data.taskId);

    const task = await prisma.scrapeTask.findUnique({
      where: { id: data.taskId },
    });
    expect(task).toBeDefined();
    expect(task?.status).toBe("PENDING");
    expect(task?.type).toBe("LIST");
    expect(task?.searchUrl).toBe("https://example.com/manual-test");
  });

  it("should connect and stream task progress via GET /api/scrape/stream", async () => {
    const task = await prisma.scrapeTask.create({
      data: {
        type: "LIST",
        portalId: "example",
        status: "COMPLETED",
        progress: 100,
      },
    });
    taskIds.push(task.id);

    const req = new NextRequest(
      `http://localhost/api/scrape/stream?taskId=${task.id}`,
      {
        method: "GET",
      },
    );
    const res = await streamHandler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    const { value } = await reader!.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('"status":"COMPLETED"');
    expect(text).toContain('"progress":100');
  });
});
