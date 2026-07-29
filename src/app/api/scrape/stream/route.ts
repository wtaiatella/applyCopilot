import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("taskId");

  if (!taskId) {
    return new Response("Missing taskId query parameter", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      const sendEvent = (data: object) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (err) {
          // Stream might have already been closed
        }
      };

      // Periodic check interval loop
      const interval = setInterval(async () => {
        if (isClosed) return;

        try {
          const task = await prisma.scrapeTask.findUnique({
            where: { id: taskId },
          });

          if (!task) {
            sendEvent({ error: "Task not found" });
            clearInterval(interval);
            try { controller.close(); } catch {}
            isClosed = true;
            return;
          }

          sendEvent({
            status: task.status,
            progress: task.progress,
            resultsCount: task.resultsCount,
            errorMessage: task.errorMessage,
          });

          // Terminate connection on final state
          if (task.status === "COMPLETED" || task.status === "FAILED") {
            clearInterval(interval);
            try { controller.close(); } catch {}
            isClosed = true;
          }
        } catch (error) {
          console.error("[SSE Stream] Database polling error:", error);
          sendEvent({ error: "Database polling error" });
          clearInterval(interval);
          try { controller.close(); } catch {}
          isClosed = true;
        }
      }, 1500); // Polling interval 1.5 seconds

      // Clean up when client aborts the connection
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        isClosed = true;
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
