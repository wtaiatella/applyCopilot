import {
  ScraperStrategy,
  ListResult,
  RateLimitError,
  ScraperBlockedError,
  convertHtmlToMarkdown,
} from "../engine";
import { registerStrategy } from "../registry";
import * as cheerio from "cheerio";

const LISTINGS_ENDPOINT = "https://jobspresso.co/jm-ajax/get_listings/";
const PER_PAGE = 20;
const MAX_PAGES = 25;
// jobspresso.co/robots.txt declares Crawl-delay: 3
const CRAWL_DELAY_MS = 3000;

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

// Job-type slugs are read from the configured search URL. Query strings are
// disallowed by jobspresso's robots.txt (`Disallow: /*?`), so the preferred
// form keeps them in the hash: https://jobspresso.co/remote-non-tech-jobs/#types=ai-data,developer
function parseJobTypes(searchUrl: string): string[] {
  try {
    const url = new URL(searchUrl);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    const raw =
      hashParams.get("types") || url.searchParams.get("filter_job_type") || "";
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// The list shows relative dates ("Today", "Yesterday") or "October 31" (no year)
export function parseListDate(
  text: string,
  now: Date = new Date(),
): Date | undefined {
  const clean = text.trim().toLowerCase();
  if (!clean) return undefined;
  const base = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  if (clean === "today") return base;
  if (clean === "yesterday") {
    base.setUTCDate(base.getUTCDate() - 1);
    return base;
  }
  const m = clean.match(/^([a-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[1]);
  if (month === -1) return undefined;
  let year = m[3] ? parseInt(m[3]) : now.getUTCFullYear();
  let date = new Date(Date.UTC(year, month, parseInt(m[2])));
  // No year shown and date lands in the future => it belongs to the previous year
  if (!m[3] && date.getTime() > now.getTime() + 24 * 3600 * 1000) {
    year -= 1;
    date = new Date(Date.UTC(year, month, parseInt(m[2])));
  }
  return date;
}

// Only annual figures are mapped to numeric salary ("US$80k - US$100k/yr");
// hourly rates stay in the description.
export function parseAnnualSalary(text: string): {
  min?: number;
  max?: number;
  currency?: string;
} {
  if (!/\/\s*(yr|year)|per year|annual/i.test(text)) return {};
  const nums = [...text.matchAll(/(\d[\d,.]*)\s*(k)?/gi)].map((m) => {
    const n = parseFloat(m[1].replace(/,/g, ""));
    return m[2] ? n * 1000 : n;
  });
  if (nums.length === 0 || nums.some((n) => Number.isNaN(n))) return {};
  const currency = /US\$|USD|\$/.test(text)
    ? "USD"
    : /€|EUR/.test(text)
      ? "EUR"
      : /£|GBP/.test(text)
        ? "GBP"
        : undefined;
  return { min: Math.min(...nums), max: Math.max(...nums), currency };
}

async function postListings(
  types: string[],
  page: number,
  userAgent: string,
): Promise<{ html: string; maxPages: number }> {
  const body = new URLSearchParams();
  body.set("lang", "");
  body.set("search_keywords", "");
  body.set("search_location", "Worldwide");
  for (const t of types) body.append("filter_job_type[]", t);
  body.set("per_page", String(PER_PAGE));
  body.set("orderby", "featured");
  body.set("featured_first", "false");
  body.set("order", "DESC");
  body.set("page", String(page));
  body.set("show_pagination", "false");

  const response = await fetch(LISTINGS_ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": userAgent,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: body.toString(),
  });

  if (response.status === 403)
    throw new ScraperBlockedError(
      `Blocked on URL: ${LISTINGS_ENDPOINT} (HTTP 403)`,
    );
  if (response.status === 429)
    throw new RateLimitError(
      `Rate limited on URL: ${LISTINGS_ENDPOINT} (HTTP 429)`,
    );
  if (!response.ok)
    throw new Error(
      `Failed to fetch URL: ${LISTINGS_ENDPOINT} (HTTP ${response.status})`,
    );

  const data = await response.json();
  return {
    html: String(data.html || ""),
    maxPages: Number(data.max_num_pages) || 1,
  };
}

function parseListItems(fragment: string): ListResult[] {
  const $ = cheerio.load(fragment);
  const results: ListResult[] = [];

  $("li.job_listing").each((_, el) => {
    const item = $(el);
    const externalJobId = (item.attr("id") || "").replace("job_listing-", "");
    const url =
      item.attr("data-href") ||
      item.find("a.job_listing-clickbox").attr("href") ||
      "";
    const title = item.find(".job_listing-title").first().text().trim();
    const company = item
      .find(".job_listing-company strong")
      .first()
      .text()
      .trim();
    if (!externalJobId || !url || !title || !company) return;

    const location = item.find(".job_listing-location").first().text().trim();
    const salary = parseAnnualSalary(
      item.find(".jobspresso-card-salary span").first().text(),
    );

    results.push({
      externalJobId,
      title,
      company,
      url,
      location: location ? [location] : [],
      locationType: "remote",
      countries: [],
      postedAt: parseListDate(item.find(".job_listing-date").first().text()),
      salaryMin: salary.min,
      salaryMax: salary.max,
      currency: salary.currency,
      // The list payload carries no description: the DEEP task fetches the job page.
      isFullDescriptionFetched: false,
    });
  });

  return results;
}

export const jobspressoStrategy: ScraperStrategy = {
  portalId: "jobspresso",

  // The engine GETs the configured search URL first; its HTML is ignored because the
  // real listing data comes from the site's POST AJAX endpoint.
  async extractList(_html, _$, ctx) {
    const types = parseJobTypes(ctx.searchUrl);
    const results: ListResult[] = [];
    const seen = new Set<string>();

    let page = 1;
    let maxPages = 1;
    while (page <= maxPages && page <= MAX_PAGES) {
      if (page > 1)
        await new Promise((resolve) => setTimeout(resolve, CRAWL_DELAY_MS));
      const { html, maxPages: total } = await postListings(
        types,
        page,
        ctx.userAgent,
      );
      maxPages = total;
      for (const item of parseListItems(html)) {
        if (seen.has(item.externalJobId)) continue;
        seen.add(item.externalJobId);
        results.push(item);
      }
      page++;
    }

    return results;
  },

  async extractDeep(html, $) {
    // Primary source: schema.org JobPosting JSON-LD, which holds the full HTML description
    let descriptionHtml = "";
    $('script[type="application/ld+json"]').each((_, el) => {
      if (descriptionHtml) return;
      try {
        const json = JSON.parse($(el).html() || "");
        const nodes = Array.isArray(json) ? json : [json];
        const posting = nodes.find((n) => n && n["@type"] === "JobPosting");
        if (posting?.description) descriptionHtml = String(posting.description);
      } catch {
        // ignore malformed JSON-LD blocks
      }
    });

    if (!descriptionHtml) {
      descriptionHtml = $(".job_description").first().html() || "";
    }
    if (!descriptionHtml) {
      descriptionHtml = html;
    }

    return { fullDescription: convertHtmlToMarkdown(descriptionHtml) };
  },
};

registerStrategy(jobspressoStrategy);
