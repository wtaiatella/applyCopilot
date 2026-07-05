import * as cheerio from "cheerio";
import TurndownService from "turndown";
import * as fs from "fs/promises";
import * as path from "path";
import { prisma } from "@/lib/db/prisma";
import { getStrategy } from "./registry";

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

// Fetch raw HTML with custom User-Agent header
export async function fetchHtml(url: string, userAgent: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${url} (HTTP ${response.status})`);
  }
  return response.text();
}

// Save raw HTML payloads to /debug/scraper/ for developer inspection
async function saveAuditPayload(portalId: string, type: string, data: string) {
  try {
    const debugDir = path.join(process.cwd(), "debug", "scraper");
    await fs.mkdir(debugDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${timestamp}-${portalId}-${type}.html`;
    await fs.writeFile(path.join(debugDir, fileName), data, "utf-8");
  } catch (err) {
    console.error("[Scraper Engine] Failed to save audit payload:", err);
  }
}

// Handle task retry logic and broken portal configuration status updates
export async function handleTaskFailure(task: { id: string; portalId: string; attempts: number; searchUrl: string | null }, errorMessage: string) {
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
    console.log(`[Scraper Engine] Task ${task.id} failed. Attempts: ${nextAttempts}/${maxRetries}. Re-queued as PENDING.`);
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
    console.warn(`[Scraper Engine] Task ${task.id} reached maximum retries (${maxRetries}). Status set to FAILED.`);

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
        console.warn(`[Scraper Engine] Flagged PortalSearchUrl configuration for portal ${task.portalId} as BROKEN.`);
      }
    }
  }
}

// Main strategy execution engine runner
export async function runTask(taskId: string) {
  const task = await prisma.scrapeTask.findUnique({
    where: { id: taskId },
  });
  if (!task || task.status === "COMPLETED" || task.status === "FAILED") return;

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

      if (process.env.LOG_LEVEL === "debug") {
        await saveAuditPayload(task.portalId, "list_html", html);
      }

      await prisma.scrapeTask.update({ where: { id: taskId }, data: { progress: 50 } });
      const $ = cheerio.load(html);
      const results = await strategy.extractList(html, $, { searchUrl: url, userAgent });

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
      console.log(`[Scraper Engine] LIST task ${taskId} completed successfully. Found ${jobsAdded} jobs.`);

    } else if (task.type === "DEEP") {
      const jobUrl = task.searchUrl;
      if (!jobUrl) throw new Error("Job URL is required for DEEP task");

      await prisma.scrapeTask.update({ where: { id: taskId }, data: { progress: 40 } });
      const html = await fetchHtml(jobUrl, userAgent);

      if (process.env.LOG_LEVEL === "debug") {
        await saveAuditPayload(task.portalId, "deep_html", html);
      }

      await prisma.scrapeTask.update({ where: { id: taskId }, data: { progress: 70 } });
      const $ = cheerio.load(html);
      const deepResult = await strategy.extractDeep(html, $);

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
      console.log(`[Scraper Engine] DEEP task ${taskId} completed successfully for URL: ${jobUrl}`);
    }
  } catch (error: any) {
    const errorStr = error.message || String(error);
    await handleTaskFailure(task, errorStr);
  }
}
