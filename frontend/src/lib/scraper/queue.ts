import { prisma } from "@/lib/db/prisma";
import { runTask } from "./engine";

// Import strategy files to trigger auto-registration in Registry
import "./portals/example";

let isWorkerRunning = false;

// Helper to query configuration strings from the SystemConfig key-value store
async function getConfigVal(key: string, defaultVal: string): Promise<string> {
  try {
    const config = await prisma.systemConfig.findUnique({ where: { key } });
    return config ? config.value : defaultVal;
  } catch (err) {
    return defaultVal;
  }
}

// Schedule LIST tasks (Step 1) for active configurations that have not run within the interval
export async function scheduleListTasks() {
  try {
    const activeConfigs = await prisma.portalSearchUrl.findMany({
      where: {
        isActive: true,
        status: "ACTIVE", // Skip configurations flagged as BROKEN or DISABLED
      },
    });

    const intervalMinStr = await getConfigVal("SCRAPER_GLOBAL_INTERVAL", "360");
    const intervalMin = parseInt(intervalMinStr) || 360;
    const cutoffTime = new Date(Date.now() - intervalMin * 60 * 1000);

    for (const config of activeConfigs) {
      // Check if a LIST task has run for this portal config in the current interval window
      const lastTask = await prisma.scrapeTask.findFirst({
        where: {
          portalId: config.portalId,
          searchUrl: config.url,
          type: "LIST",
          createdAt: { gte: cutoffTime },
        },
      });

      if (!lastTask) {
        await prisma.scrapeTask.create({
          data: {
            type: "LIST",
            portalId: config.portalId,
            searchUrl: config.url,
            status: "PENDING",
            progress: 0,
          },
        });
        console.log(`[Scraper Queue] Scheduled LIST task for config ${config.id} (${config.portalId})`);
      }
    }
  } catch (error) {
    console.error("[Scraper Queue] Failed scheduling LIST tasks:", error);
  }
}

// Enqueue DEEP tasks (Step 2) for JobListing entries with pending full description extraction
export async function enqueueDeepTasks() {
  try {
    const pendingJobs = await prisma.jobListing.findMany({
      where: {
        isFullDescriptionFetched: false,
      },
      take: 50, // Batch process to prevent memory/Prisma overload
    });

    for (const job of pendingJobs) {
      // Check if a DEEP task is already registered/pending/running for this job URL
      const taskExists = await prisma.scrapeTask.findFirst({
        where: {
          portalId: job.portalId,
          searchUrl: job.url,
          type: "DEEP",
        },
      });

      if (!taskExists) {
        await prisma.scrapeTask.create({
          data: {
            type: "DEEP",
            portalId: job.portalId,
            searchUrl: job.url,
            status: "PENDING",
            progress: 0,
          },
        });
        console.log(`[Scraper Queue] Enqueued DEEP task for job listing: ${job.url}`);
      }
    }
  } catch (error) {
    console.error("[Scraper Queue] Failed enqueuing DEEP tasks:", error);
  }
}

// Bootstrap worker and initiate background loops (called on Next.js boot via instrumentation.ts)
export async function bootstrapWorker() {
  if (isWorkerRunning) {
    console.log("[Scraper Worker] Queue worker already bootstrapped and running.");
    return;
  }
  isWorkerRunning = true;
  console.log("[Scraper Worker] Initializing background polling worker loops...");

  // Polling loop 1: Scan configurations and check for pending job descriptions every 1 minute
  setInterval(async () => {
    await scheduleListTasks();
    await enqueueDeepTasks();
  }, 60 * 1000);

  // Fire scheduling immediately on startup
  await scheduleListTasks();
  await enqueueDeepTasks();

  // Polling loop 2: Process pending tasks sequentially respecting concurrency and delay rates
  async function runQueueLoop() {
    try {
      const concurrencyStr = await getConfigVal("SCRAPER_MAX_CONCURRENCY", "3");
      const maxConcurrency = parseInt(concurrencyStr) || 3;

      const runningCount = await prisma.scrapeTask.count({
        where: { status: "RUNNING" },
      });

      if (runningCount < maxConcurrency) {
        const nextTask = await prisma.scrapeTask.findFirst({
          where: { status: "PENDING" },
          orderBy: { createdAt: "asc" },
        });

        if (nextTask) {
          // Execute runTask asynchronously to prevent blocking the worker scheduler
          runTask(nextTask.id).catch((err) => {
            console.error(`[Scraper Worker] Error executing task ${nextTask.id}:`, err);
          });
        }
      }
    } catch (error) {
      console.error("[Scraper Worker] Error inside execution queue loop:", error);
    }

    // Dynamic scheduling delay loaded directly from DB SystemConfig settings
    const delayStr = await getConfigVal("SCRAPER_RATE_LIMIT_DELAY", "1000");
    const delay = parseInt(delayStr) || 1000;
    setTimeout(runQueueLoop, delay);
  }

  // Launch task processing queue loop
  runQueueLoop();
}
