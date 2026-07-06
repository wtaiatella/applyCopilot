import { prisma } from "@/lib/db/prisma";
import { runTask } from "./engine";
import { logger } from "@/lib/logging/logger";

// Import strategy files to trigger auto-registration in Registry
import "./portals/example";
import "./portals/workable";
import "./portals/wellfound";

let isWorkerRunning = false;

// Helper to query configuration strings from the SystemConfig key-value store
async function getConfigVal(key: string, defaultVal: string): Promise<string> {
  try {
    const config = await prisma.systemConfig.findUnique({ where: { key } });
    return config ? config.value : defaultVal;
  } catch {
    return defaultVal;
  }
}

// Schedule LIST tasks (Step 1) for active configurations that have not run within the interval
export async function scheduleListTasks() {
  logger.debug("[Scraper Queue] scheduleListTasks entry");
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
        const newTask = await prisma.scrapeTask.create({
          data: {
            type: "LIST",
            portalId: config.portalId,
            searchUrl: config.url,
            status: "PENDING",
            progress: 0,
          },
        });
        logger.info(`[Scraper Queue] Scheduled LIST task ${newTask.id} for config ${config.id} (${config.portalId})`);
      }
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[Scraper Queue] Failed scheduling LIST tasks: ${errMsg}`, { error });
  } finally {
    logger.debug("[Scraper Queue] scheduleListTasks return");
  }
}

// Enqueue DEEP tasks (Step 2) for JobListing entries with pending full description extraction
export async function enqueueDeepTasks() {
  logger.debug("[Scraper Queue] enqueueDeepTasks entry");
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
        const newTask = await prisma.scrapeTask.create({
          data: {
            type: "DEEP",
            portalId: job.portalId,
            searchUrl: job.url,
            status: "PENDING",
            progress: 0,
          },
        });
        logger.info(`[Scraper Queue] Enqueued DEEP task ${newTask.id} for job listing: ${job.url}`);
      }
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[Scraper Queue] Failed enqueuing DEEP tasks: ${errMsg}`, { error });
  } finally {
    logger.debug("[Scraper Queue] enqueueDeepTasks return");
  }
}

// Bootstrap worker and initiate background loops (called on Next.js boot via instrumentation.ts)
export async function bootstrapWorker() {
  logger.debug("[Scraper Worker] bootstrapWorker entry");
  if (isWorkerRunning) {
    logger.info("[Scraper Worker] Queue worker already bootstrapped and running.");
    logger.debug("[Scraper Worker] bootstrapWorker return");
    return;
  }
  isWorkerRunning = true;
  logger.info("[Scraper Worker] Initializing background polling worker loops...");

  // Polling loop 1: Scan configurations and check for pending job descriptions every 1 minute
  setInterval(async () => {
    logger.debug("[Scraper Worker] 1-minute interval loop entry");
    await scheduleListTasks();
    await enqueueDeepTasks();
    logger.debug("[Scraper Worker] 1-minute interval loop return");
  }, 60 * 1000);

  // Fire scheduling immediately on startup
  await scheduleListTasks();
  await enqueueDeepTasks();

  // Polling loop 2: Process pending tasks sequentially respecting concurrency and delay rates
  async function runQueueLoop() {
    logger.debug("[Scraper Worker] runQueueLoop entry");
    try {
      const concurrencyStr = await getConfigVal("SCRAPER_MAX_CONCURRENCY", "3");
      const maxConcurrency = parseInt(concurrencyStr) || 3;

      const runningCount = await prisma.scrapeTask.count({
        where: { status: "RUNNING" },
      });

      if (runningCount < maxConcurrency) {
        // Query next PENDING task, filtering out future createdAt schedules from backoffs
        const nextTask = await prisma.scrapeTask.findFirst({
          where: {
            status: "PENDING",
            createdAt: { lte: new Date() },
          },
          orderBy: { createdAt: "asc" },
        });

        if (nextTask) {
          logger.info(`[Scraper Worker] Worker picked up next task: ${nextTask.id} (${nextTask.type}) for portal: ${nextTask.portalId}`);
          // Execute runTask asynchronously to prevent blocking the worker scheduler
          runTask(nextTask.id).catch((err: unknown) => {
            const errMsg = err instanceof Error ? err.message : String(err);
            logger.error(`[Scraper Worker] Error executing task ${nextTask.id}: ${errMsg}`, { error: err });
          });
        }
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[Scraper Worker] Error inside execution queue loop: ${errMsg}`, { error });
    }

    // Dynamic scheduling delay loaded directly from DB SystemConfig settings
    const delayStr = await getConfigVal("SCRAPER_RATE_LIMIT_DELAY", "1000");
    const delay = parseInt(delayStr) || 1000;
    
    logger.debug(`[Scraper Worker] runQueueLoop return. Scheduling next run in ${delay}ms`);
    setTimeout(runQueueLoop, delay);
  }

  // Launch task processing queue loop
  runQueueLoop();
  logger.debug("[Scraper Worker] bootstrapWorker return");
}
