import { ScraperStrategy, ListResult, convertHtmlToMarkdown } from "../engine";
import { registerStrategy } from "../registry";
import { fetchHtml } from "../engine";
import * as cheerio from "cheerio";

export const wellfoundStrategy: ScraperStrategy = {
  portalId: "wellfound",
  async extractList(html, $, ctx) {
    const results: ListResult[] = [];

    // Helper to extract numeric values from salary text, e.g., "$150k – $175k"
    const parseSalary = (text: string) => {
      let salaryMin: number | undefined = undefined;
      let salaryMax: number | undefined = undefined;
      let currency: string | undefined = undefined;

      if (text.includes("$")) {
        currency = "USD";
      }

      // Replace different dash types with a standard hyphen
      const cleanSalary = text.split("•")[0].replace(/[\u2013\u2014]/g, "-").trim();
      const parts = cleanSalary.split("-").map((p) => p.trim());

      if (parts[0]) {
        const val = parseFloat(parts[0].replace(/[^0-9.]/g, ""));
        if (!isNaN(val)) {
          salaryMin = parts[0].toLowerCase().includes("k") ? val * 1000 : val;
        }
      }
      if (parts[1]) {
        const val = parseFloat(parts[1].replace(/[^0-9.]/g, ""));
        if (!isNaN(val)) {
          salaryMax = parts[1].toLowerCase().includes("k") ? val * 1000 : val;
        }
      }

      return { salaryMin, salaryMax, currency };
    };

    // Helper to parse relative post date, e.g., "1 week ago"
    const parsePostedAt = (text: string): Date | undefined => {
      const cleanAgo = text.toLowerCase();
      const match = cleanAgo.match(/(\d+)\s+(day|week|month|hour|minute)s?\s+ago/);
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2];
        const date = new Date();
        if (unit === "day") date.setDate(date.getDate() - value);
        else if (unit === "week") date.setDate(date.getDate() - value * 7);
        else if (unit === "month") date.setDate(date.getDate() - value * 30);
        else if (unit === "hour") date.setHours(date.getHours() - value);
        else if (unit === "minute") date.setMinutes(date.getMinutes() - value);
        return date;
      } else if (cleanAgo.includes("yesterday")) {
        const date = new Date();
        date.setDate(date.getDate() - 1);
        return date;
      } else if (cleanAgo.includes("today")) {
        return new Date();
      }
      return undefined;
    };

    // Parse company cards
    const companyCards = $(".mb-6.w-full.rounded.border.border-gray-400.bg-white");
    companyCards.each((_, card) => {
      const company = $(card).find('[data-testid="startup-header"] h2').text().trim() ||
        $(card).find('a[href^="/company/"] h2').text().trim() ||
        "";

      // Find all job listings in the company card
      const jobItems = $(card).find("div").filter((_, el) => $(el).hasClass("min-h-[50px]"));
      jobItems.each((_, item) => {
        const linkEl = $(item).find('a[href^="/jobs/"]');
        const title = linkEl.first().text().trim();
        const relativeUrl = linkEl.first().attr("href") || "";

        if (!title || !relativeUrl) return;

        const url = new URL(relativeUrl, "https://wellfound.com").toString();

        // Parse externalJobId from the URL slug, e.g., "/jobs/4121876-software-engineer" -> "4121876"
        let externalJobId = "";
        const parts = relativeUrl.split("/").filter(Boolean);
        const slug = parts[parts.length - 1];
        if (slug) {
          externalJobId = slug.split("-")[0];
        }

        if (!externalJobId) return;

        // Job type badge (usually next to title)
        const jobType = $(item).find(".bg-accent-yellow-100").text().trim() ||
          $(item).find("span").filter((_, el) => $(el).text().includes("time")).text().trim() ||
          "";

        // Parse salary, location, experience and posted time by filtering spans inside the job item
        let salaryMin: number | undefined = undefined;
        let salaryMax: number | undefined = undefined;
        let currency: string | undefined = undefined;
        let location = "";
        let experienceLevel = "";
        let postedAt: Date | undefined = undefined;

        $(item).find("span.text-xs, span.pl-1").each((_, el) => {
          const text = $(el).text().trim();
          if (!text) return;

          if (text.includes("$")) {
            const parsed = parseSalary(text);
            salaryMin = parsed.salaryMin;
            salaryMax = parsed.salaryMax;
            currency = parsed.currency;
          } else if (text.toLowerCase().includes("exp")) {
            experienceLevel = text;
          } else if (text.toLowerCase().includes("ago")) {
            postedAt = parsePostedAt(text);
          } else if (
            text !== "Full-time" &&
            text !== "Part-time" &&
            text !== "Save" &&
            text !== "Apply" &&
            !text.startsWith("•") &&
            !/^\+\d+$/.test(text)
          ) {
            location = text;
          }
        });

        // Determine remote/onsite state from location text
        const locationType = location.toLowerCase().includes("remote") ? "remote" : "onsite";

        results.push({
          externalJobId,
          title,
          company,
          url,
          location: location || undefined,
          locationType,
          jobType: jobType || undefined,
          experienceLevel: experienceLevel || undefined,
          postedAt,
          salaryMin,
          salaryMax,
          currency,
          isFullDescriptionFetched: false,
        });
      });
    });

    // Check pagination next link
    let nextPageToken = "";
    const nextLink = $('a[aria-label="Next page"]').attr("href");
    if (nextLink) {
      try {
        const nextUrlObj = new URL(nextLink, "https://wellfound.com");
        const pageVal = nextUrlObj.searchParams.get("page");
        if (pageVal) {
          nextPageToken = pageVal;
        }
      } catch { }
    }

    // Paginate recursively using fetchHtml
    const seenTokens = new Set<string>();
    let baseUrlObj: URL;
    try {
      baseUrlObj = new URL(ctx.searchUrl);
    } catch {
      return results;
    }

    while (nextPageToken && !seenTokens.has(nextPageToken)) {
      seenTokens.add(nextPageToken);
      try {
        const pageUrlObj = new URL(baseUrlObj.toString());
        pageUrlObj.searchParams.set("page", nextPageToken);
        const apiUrl = pageUrlObj.toString();

        // Polite delay
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const responseHtml = await fetchHtml(apiUrl, ctx.userAgent);
        const $page = cheerio.load(responseHtml);

        const pageCards = $page(".mb-6.w-full.rounded.border.border-gray-400.bg-white");
        if (pageCards.length === 0) {
          break; // Stop if no cards are found on the page
        }

        pageCards.each((_, card) => {
          const company = $page(card).find('[data-testid="startup-header"] h2').text().trim() ||
            $page(card).find('a[href^="/company/"] h2').text().trim() ||
            "";

          const jobItems = $page(card).find("div").filter((_, el) => $page(el).hasClass("min-h-[50px]"));
          jobItems.each((_, item) => {
            const linkEl = $page(item).find('a[href^="/jobs/"]');
            const title = linkEl.first().text().trim();
            const relativeUrl = linkEl.first().attr("href") || "";

            if (!title || !relativeUrl) return;

            const url = new URL(relativeUrl, "https://wellfound.com").toString();

            let externalJobId = "";
            const parts = relativeUrl.split("/").filter(Boolean);
            const slug = parts[parts.length - 1];
            if (slug) {
              externalJobId = slug.split("-")[0];
            }

            if (!externalJobId) return;

            const jobType = $page(item).find(".bg-accent-yellow-100").text().trim() ||
              $page(item).find("span").filter((_, el) => $page(el).text().includes("time")).text().trim() ||
              "";

            let salaryMin: number | undefined = undefined;
            let salaryMax: number | undefined = undefined;
            let currency: string | undefined = undefined;
            let location = "";
            let experienceLevel = "";
            let postedAt: Date | undefined = undefined;

            $page(item).find("span.text-xs, span.pl-1").each((_, el) => {
              const text = $page(el).text().trim();
              if (!text) return;

              if (text.includes("$")) {
                const parsed = parseSalary(text);
                salaryMin = parsed.salaryMin;
                salaryMax = parsed.salaryMax;
                currency = parsed.currency;
              } else if (text.toLowerCase().includes("exp")) {
                experienceLevel = text;
              } else if (text.toLowerCase().includes("ago")) {
                postedAt = parsePostedAt(text);
              } else if (
                text !== "Full-time" &&
                text !== "Part-time" &&
                text !== "Save" &&
                text !== "Apply" &&
                !text.startsWith("•") &&
                !/^\+\d+$/.test(text)
              ) {
                location = text;
              }
            });

            const locationType = location.toLowerCase().includes("remote") ? "remote" : "onsite";

            results.push({
              externalJobId,
              title,
              company,
              url,
              location: location || undefined,
              locationType,
              jobType: jobType || undefined,
              experienceLevel: experienceLevel || undefined,
              postedAt,
              salaryMin,
              salaryMax,
              currency,
              isFullDescriptionFetched: false
            });
          });
        });

        // Resolve next page token
        const nextLinkPage = $page('a[aria-label="Next page"]').attr("href");
        if (nextLinkPage) {
          const nextUrlObj = new URL(nextLinkPage, "https://wellfound.com");
          const pageVal = nextUrlObj.searchParams.get("page");
          nextPageToken = pageVal || "";
        } else {
          nextPageToken = "";
        }
      } catch (err) {
        console.error("[Wellfound Strategy] Pagination failed:", err);
        break;
      }
    }

    return results;
  },

  async extractDeep(html, $) {
    let fullDescription = "";

    // 1. Try parsing JSON-LD script block containing JobPosting metadata
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const jsonText = $(el).html();
        if (jsonText) {
          const parsed = JSON.parse(jsonText);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const getDesc = (obj: any): string => {
            if (obj && obj["@type"] === "JobPosting" && obj.description) {
              return obj.description;
            }
            return "";
          };

          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              const d = getDesc(item);
              if (d) {
                fullDescription = d;
                break;
              }
            }
          } else {
            fullDescription = getDesc(parsed);
          }
        }
      } catch { }
    });

    // 2. Fallback to HTML selectors if JSON-LD parsing failed
    if (!fullDescription) {
      fullDescription = $("#job-description").html() ||
        $("article").html() ||
        $(".styles_jobDescription__body__Y_XzG").html() ||
        "";
    }

    const markdown = fullDescription ? convertHtmlToMarkdown(fullDescription) : "";
    return {
      fullDescription: markdown,
    };
  },
};

registerStrategy(wellfoundStrategy);
