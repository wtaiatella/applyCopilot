export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[instrumentation] Bootstrapping background workers...");

    try {
      // Startup crash recovery: reset any tasks stuck in RUNNING state
      const { prisma } = await import("@/lib/db/prisma");

      console.log(
        "[instrumentation] Running crash recovery for ScrapeTasks...",
      );
      const recoveryResult = await prisma.scrapeTask.updateMany({
        where: { status: "RUNNING" },
        data: {
          status: "PENDING",
          errorMessage: "Worker crashed or restarted during execution",
        },
      });

      console.log(
        `[instrumentation] Recovered ${recoveryResult.count} tasks from RUNNING to PENDING.`,
      );
    } catch (error) {
      console.error("[instrumentation] Crash recovery failed:", error);
    }

    try {
      // Scraper queue worker (Step 1: LIST + DEEP tasks)
      const { bootstrapWorker } = await import("@/lib/scraper/queue");
      bootstrapWorker();
    } catch (error) {
      console.warn(
        "[instrumentation] Scraper queue manager not fully implemented yet, skipping start.",
        error,
      );
    }

    try {
      // Classification worker (Step 2: LLM clean + vectorize job listings)
      const {
        recoverRunningClassifications,
        bootstrapClassificationWorker,
      } = await import("@/lib/workers/classification-worker");
      const recoveredCount = await recoverRunningClassifications("startup");
      console.log(
        `[instrumentation] Recovered ${recoveredCount} job(s) from RUNNING to PENDING classification.`,
      );
      await bootstrapClassificationWorker();
    } catch (error) {
      console.error(
        "[instrumentation] Classification worker failed to start:",
        error,
      );
    }
  }
}
