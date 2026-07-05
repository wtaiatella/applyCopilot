export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[instrumentation] Bootstrapping background worker...");
    
    try {
      // Task T008: Startup crash recovery
      const { prisma } = await import("@/lib/db/prisma");
      
      console.log("[instrumentation] Running crash recovery for ScrapeTasks...");
      const recoveryResult = await prisma.scrapeTask.updateMany({
        where: { status: "RUNNING" },
        data: {
          status: "PENDING",
          errorMessage: "Worker crashed or restarted during execution",
        },
      });
      
      console.log(`[instrumentation] Recovered ${recoveryResult.count} tasks from RUNNING to PENDING.`);
    } catch (error) {
      console.error("[instrumentation] Crash recovery failed:", error);
    }

    try {
      // Task T007: Initialize queue polling loops
      const { bootstrapWorker } = await import("@/lib/scraper/queue");
      bootstrapWorker();
    } catch (error) {
      console.warn("[instrumentation] Scraper queue manager not fully implemented yet, skipping start.");
    }
  }
}
