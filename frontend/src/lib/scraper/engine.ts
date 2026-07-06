import * as cheerio from "cheerio";
import TurndownService from "turndown";
import * as fs from "fs/promises";
import * as path from "path";
import { prisma } from "@/lib/db/prisma";
import { getStrategy } from "./registry";
import { logger } from "@/lib/logging/logger";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

// Strips unnecessary elements like script/style and converts HTML to Markdown
export function convertHtmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}

export interface ExtractionContext {
  searchUrl: string;
  userAgent: string;
}

export interface ListResult {
  externalJobId: string;
  title: string;
  company: string;
  url: string;
  location?: string;
  locationType?: string;
  countries?: string;
  jobType?: string;
  experienceLevel?: string;
  postedAt?: Date;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  fullDescription?: string;
  isFullDescriptionFetched?: boolean;
}

export interface DeepResult {
  fullDescription: string;
}

export interface ScraperStrategy {
  portalId: string;
  extractList(html: string, $: cheerio.CheerioAPI, ctx: ExtractionContext): ListResult[] | Promise<ListResult[]>;
  extractDeep(html: string, $: cheerio.CheerioAPI): DeepResult | Promise<DeepResult>;
}

// Custom Error to represent HTTP 429 Rate Limit
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

// Fetch raw HTML with custom User-Agent header
export async function fetchHtml(url: string, userAgent: string): Promise<string> {
  logger.debug(`[Scraper Engine] fetchHtml entry: url=${url}`);
  logger.info(`[Scraper Engine] HTTP GET Request to target URL: ${url}`);

  const headers: Record<string, string> = {
    "User-Agent": userAgent,
  };

  if (url.includes("wellfound.com")) {
    try {
      const cookieConfig = await prisma.systemConfig.findUnique({ where: { key: "WELLFOUND_COOKIE" } });
      if (cookieConfig?.value) {
        headers["Cookie"] = cookieConfig.value;
      }
      const uaConfig = await prisma.systemConfig.findUnique({ where: { key: "WELLFOUND_USER_AGENT" } });
      if (uaConfig?.value) {
        headers["User-Agent"] = uaConfig.value;
      }
      headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";
      headers["Accept-Language"] = "en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7,es;q=0.6";
      headers["Referer"] = "https://wellfound.com/";
    } catch (err) {
      logger.warn(`[Scraper Engine] Failed to load Wellfound configs from DB: ${err}`);
    }
  }

  const response = await fetch(url, {
    headers,
  });

  if (response.status === 429) {
    logger.warn(`[Scraper Engine] Rate limited on URL: ${url} (HTTP 429)`);
    throw new RateLimitError(`Rate limited on URL: ${url} (HTTP 429)`);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${url} (HTTP ${response.status})`);
  }

  const html = await response.text();
  logger.debug(`[Scraper Engine] fetchHtml return: url=${url}, contentSize=${html.length} bytes`);
  return html;
}

const getRepoRoot = (): string => {
  const cwd = process.cwd();
  if (cwd.endsWith("frontend")) {
    return path.join(cwd, "..");
  }
  return cwd;
};

// Save raw payloads to /debug/scraper/ for developer inspection when LOG_LEVEL=debug
export async function saveAuditPayload(portalId: string, type: string, ext: string, data: string) {
  logger.debug(`[Scraper Engine] saveAuditPayload entry: portalId=${portalId}, type=${type}, ext=${ext}`);
  
  const isDebugMode = (process.env.LOG_LEVEL || "info").toLowerCase() === "debug";
  if (!isDebugMode) {
    logger.debug("[Scraper Engine] saveAuditPayload return (skipped because LOG_LEVEL != debug)");
    return;
  }

  try {
    const repoRoot = getRepoRoot();
    const debugDir = path.join(repoRoot, "debug", "scraper");
    await fs.mkdir(debugDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${timestamp}-${portalId}-${type}.${ext}`;
    const filePath = path.join(debugDir, fileName);

    let content = data;
    if (ext === "html") {
      try {
        const prettier = await import("prettier");
        content = await prettier.format(data, { parser: "html" });
      } catch {
        // Fallback to raw data silently if prettier is not available or fails
      }
    }

    await fs.writeFile(filePath, content, "utf-8");
    logger.debug(`[Scraper Engine] saveAuditPayload return: saved to ${filePath}`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[Scraper Engine] Failed to save audit payload: ${errMsg}`, { error: err });
    logger.debug("[Scraper Engine] saveAuditPayload return (error)");
  }
}

// Handle task retry logic with exponential backoff on rate limit (HTTP 429)
export async function handleRateLimitFailure(
  task: { id: string; portalId: string; attempts: number; searchUrl: string | null },
  errorMessage: string
) {
  logger.debug(`[Scraper Engine] handleRateLimitFailure entry: taskId=${task.id}`);
  
  const nextAttempts = task.attempts + 1;
  const maxRetriesConfig = await prisma.systemConfig.findUnique({ where: { key: "SCRAPER_MAX_RETRIES" } });
  const maxRetries = maxRetriesConfig ? parseInt(maxRetriesConfig.value) : 3;

  if (nextAttempts < maxRetries) {
    // Exponential backoff: starting at 30 seconds, doubling, max 5 minutes, plus 0-5s jitter
    const baseDelayMs = 30 * 1000;
    const expFactor = Math.pow(2, task.attempts);
    const maxBackoffMs = 5 * 60 * 1000;
    const jitter = Math.random() * 5000;
    const backoffMs = Math.min(baseDelayMs * expFactor + jitter, maxBackoffMs);
    const newCreatedAt = new Date(Date.now() + backoffMs);

    await prisma.scrapeTask.update({
      where: { id: task.id },
      data: {
        status: "PENDING",
        attempts: nextAttempts,
        errorMessage: `${errorMessage} (Rate limited - backing off for ${Math.round(backoffMs / 1000)}s)`,
        progress: 0,
        createdAt: newCreatedAt, // Delay picker
      },
    });

    logger.warn(
      `[Scraper Engine] Task ${task.id} rate limited. Backoff: ${Math.round(
        backoffMs / 1000
      )}s. Re-scheduled at ${newCreatedAt.toISOString()}. Attempts: ${nextAttempts}/${maxRetries}`
    );
  } else {
    // Permanent FAILED state when attempts exceed maxRetries
    await prisma.scrapeTask.update({
      where: { id: task.id },
      data: {
        status: "FAILED",
        attempts: nextAttempts,
        errorMessage: `${errorMessage} (Rate limited - max retries exceeded)`,
        progress: 100,
      },
    });
    logger.error(`[Scraper Engine] Task ${task.id} reached maximum retries on rate limit. Status set to FAILED.`);

    // Set matching PortalSearchUrl status to BROKEN
    if (task.searchUrl) {
      const updatedPortals = await prisma.portalSearchUrl.updateMany({
        where: {
          portalId: task.portalId,
          url: task.searchUrl,
          isActive: true,
        },
        data: {
          status: "BROKEN",
        },
      });
      if (updatedPortals.count > 0) {
        logger.warn(`[Scraper Engine] Flagged PortalSearchUrl configuration for portal ${task.portalId} as BROKEN.`);
      }
    }
  }

  logger.debug("[Scraper Engine] handleRateLimitFailure return");
}

// Handle task retry logic and broken portal configuration status updates
export async function handleTaskFailure(
  task: { id: string; portalId: string; attempts: number; searchUrl: string | null },
  errorMessage: string
) {
  logger.debug(`[Scraper Engine] handleTaskFailure entry: taskId=${task.id}`);
  
  const nextAttempts = task.attempts + 1;
  const maxRetriesConfig = await prisma.systemConfig.findUnique({ where: { key: "SCRAPER_MAX_RETRIES" } });
  const maxRetries = maxRetriesConfig ? parseInt(maxRetriesConfig.value) : 3;

  if (nextAttempts < maxRetries) {
    // Re-queue task to be picked up again
    await prisma.scrapeTask.update({
      where: { id: task.id },
      data: {
        status: "PENDING",
        attempts: nextAttempts,
        errorMessage: errorMessage,
        progress: 0,
      },
    });
    logger.warn(`[Scraper Engine] Task ${task.id} failed. Attempts: ${nextAttempts}/${maxRetries}. Re-queued as PENDING.`);
  } else {
    // Permanent task failure
    await prisma.scrapeTask.update({
      where: { id: task.id },
      data: {
        status: "FAILED",
        attempts: nextAttempts,
        errorMessage: errorMessage,
        progress: 100,
      },
    });
    logger.error(`[Scraper Engine] Task ${task.id} reached maximum retries (${maxRetries}). Status set to FAILED.`);

    // Set matching PortalSearchUrl status to BROKEN
    if (task.searchUrl) {
      const updatedPortals = await prisma.portalSearchUrl.updateMany({
        where: {
          portalId: task.portalId,
          url: task.searchUrl,
          isActive: true,
        },
        data: {
          status: "BROKEN",
        },
      });
      if (updatedPortals.count > 0) {
        logger.warn(`[Scraper Engine] Flagged PortalSearchUrl configuration for portal ${task.portalId} as BROKEN.`);
      }
    }
  }

  logger.debug("[Scraper Engine] handleTaskFailure return");
}

// Main strategy execution engine runner
export async function runTask(taskId: string) {
  logger.debug(`[Scraper Engine] runTask entry: taskId=${taskId}`);

  const task = await prisma.scrapeTask.findUnique({
    where: { id: taskId },
  });
  if (!task || task.status === "COMPLETED" || task.status === "FAILED") {
    logger.debug(`[Scraper Engine] runTask return (task is null or already completed/failed)`);
    return;
  }

  await prisma.scrapeTask.update({
    where: { id: taskId },
    data: { status: "RUNNING", progress: 10 },
  });

  const userAgentConfig = await prisma.systemConfig.findUnique({ where: { key: "SCRAPER_USER_AGENT" } });
  const userAgent = userAgentConfig?.value || "ApplyCopilot/1.0";

  try {
    const strategy = getStrategy(task.portalId);
    if (!strategy) {
      throw new Error(`No strategy registered for portal: ${task.portalId}`);
    }

    if (task.type === "LIST") {
      const url = task.searchUrl;
      if (!url) throw new Error("Search URL is required for LIST task");

      await prisma.scrapeTask.update({ where: { id: taskId }, data: { progress: 30 } });
      const html = await fetchHtml(url, userAgent);

      await saveAuditPayload(task.portalId, "list_html", "html", html);

      await prisma.scrapeTask.update({ where: { id: taskId }, data: { progress: 50 } });
      const $ = cheerio.load(html);
      const results = await strategy.extractList(html, $, { searchUrl: url, userAgent });

      logger.debug(`[Scraper Engine] JobList Response for task ${taskId}: extracted ${results.length} listings.`);
      await saveAuditPayload(task.portalId, "list_result", "json", JSON.stringify(results, null, 2));

      await prisma.scrapeTask.update({ where: { id: taskId }, data: { progress: 80 } });

      let jobsAdded = 0;
      for (const item of results) {
        // Upsert listing using unique compound constraint (portalId + externalJobId)
        await prisma.jobListing.upsert({
          where: {
            portalId_externalJobId: {
              portalId: task.portalId,
              externalJobId: item.externalJobId,
            },
          },
          create: {
            portalId: task.portalId,
            externalJobId: item.externalJobId,
            title: item.title,
            company: item.company,
            location: item.location || null,
            url: item.url,
            isFullDescriptionFetched: item.isFullDescriptionFetched || false,
            fullDescription: item.fullDescription || null,
            locationType: item.locationType || null,
            countries: item.countries || null,
            jobType: item.jobType || null,
            experienceLevel: item.experienceLevel || null,
            postedAt: item.postedAt || null,
            salaryMin: item.salaryMin || null,
            salaryMax: item.salaryMax || null,
            currency: item.currency || null,
          },
          update: {
            title: item.title,
            company: item.company,
            location: item.location || null,
            url: item.url,
            isFullDescriptionFetched: item.isFullDescriptionFetched || undefined,
            fullDescription: item.fullDescription || undefined,
            locationType: item.locationType || null,
            countries: item.countries || null,
            jobType: item.jobType || null,
            experienceLevel: item.experienceLevel || null,
            postedAt: item.postedAt || null,
            salaryMin: item.salaryMin || null,
            salaryMax: item.salaryMax || null,
            currency: item.currency || null,
          },
        });
        jobsAdded++;
      }

      await prisma.scrapeTask.update({
        where: { id: taskId },
        data: {
          status: "COMPLETED",
          progress: 100,
          resultsCount: jobsAdded,
          errorMessage: null,
        },
      });
      logger.info(`[Scraper Engine] LIST task ${taskId} completed successfully. Found ${jobsAdded} jobs.`);

    } else if (task.type === "DEEP") {
      const jobUrl = task.searchUrl;
      if (!jobUrl) throw new Error("Job URL is required for DEEP task");

      await prisma.scrapeTask.update({ where: { id: taskId }, data: { progress: 40 } });
      const html = await fetchHtml(jobUrl, userAgent);

      await saveAuditPayload(task.portalId, "deep_html", "html", html);

      await prisma.scrapeTask.update({ where: { id: taskId }, data: { progress: 70 } });
      const $ = cheerio.load(html);
      const deepResult = await strategy.extractDeep(html, $);

      logger.debug(`[Scraper Engine] JobDetail parsed response for DEEP task ${taskId}`);
      await saveAuditPayload(task.portalId, "deep_result", "json", JSON.stringify(deepResult, null, 2));

      // Save description Markdown and set completed flag on JobListing
      await prisma.jobListing.updateMany({
        where: { url: jobUrl },
        data: {
          fullDescription: deepResult.fullDescription,
          isFullDescriptionFetched: true,
        },
      });

      await prisma.scrapeTask.update({
        where: { id: taskId },
        data: {
          status: "COMPLETED",
          progress: 100,
          resultsCount: 1,
          errorMessage: null,
        },
      });
      logger.info(`[Scraper Engine] DEEP task ${taskId} completed successfully for URL: ${jobUrl}`);
    }
  } catch (error: unknown) {
    const errorStr = error instanceof Error ? error.message : String(error);
    if (error instanceof RateLimitError || (error && typeof error === "object" && "name" in error && error.name === "RateLimitError")) {
      await handleRateLimitFailure(task, errorStr);
    } else {
      await handleTaskFailure(task, errorStr);
    }
  } finally {
    logger.debug(`[Scraper Engine] runTask return: taskId=${taskId}`);
  }
}
