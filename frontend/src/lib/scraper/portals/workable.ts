import { ScraperStrategy, ListResult, convertHtmlToMarkdown } from "../engine";
import { registerStrategy } from "../registry";
import { fetchHtml } from "../engine";

export const workableStrategy: ScraperStrategy = {
  portalId: "workable",
  async extractList(html, $, ctx) {
    const results: ListResult[] = [];

    // Helper to process job items from JSON format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processJobs = (jobs: Record<string, any>[]) => {
      for (const job of jobs) {
        if (!job.title || !job.company?.title) continue;

        // Parse externalJobId from the job URL path or fallback to id
        let externalJobId = job.id;
        if (job.url) {
          try {
            const urlObj = new URL(job.url);
            const pathSegments = urlObj.pathname.split("/");
            const viewIdx = pathSegments.indexOf("view");
            if (viewIdx !== -1 && pathSegments[viewIdx + 1]) {
              externalJobId = pathSegments[viewIdx + 1];
            }
          } catch {}
        }

        // Build combined HTML description including requirements and benefits
        let fullDescription = "";
        if (job.description) {
          fullDescription += `<h3>Description</h3>${job.description}`;
        }
        if (job.requirementsSection) {
          fullDescription += `<h3>Requirements</h3>${job.requirementsSection}`;
        }
        if (job.benefitsSection) {
          fullDescription += `<h3>Benefits</h3>${job.benefitsSection}`;
        }

        const mdDescription = fullDescription ? convertHtmlToMarkdown(fullDescription) : undefined;

        results.push({
          externalJobId,
          title: job.title,
          company: job.company.title,
          url: job.url || `https://jobs.workable.com/view/${externalJobId}`,
          location: job.location?.countryName || job.locations?.join(", ") || undefined,
          locationType: job.workplace || undefined,
          jobType: job.employmentType || undefined,
          fullDescription: mdDescription,
          isFullDescriptionFetched: !!mdDescription,
        });
      }
    };

    let nextPageToken = "";

    // Check if the HTML is actually raw JSON (direct API access)
    const cleanHtml = html.trim();
    if (cleanHtml.startsWith("{") && cleanHtml.endsWith("}")) {
      try {
        const data = JSON.parse(cleanHtml);
        if (data.jobs && Array.isArray(data.jobs)) {
          processJobs(data.jobs);
          nextPageToken = data.nextPageToken || "";
        }
      } catch (err) {
        console.error("[Workable Strategy] Failed to parse raw JSON list:", err);
      }
    } else {
      // Parse from Next.js initialState script tag in HTML search page
      const scriptEl = $("script").filter((_, el) => {
        const text = $(el).html() || "";
        return text.includes("window.jobBoard =") && text.includes("initialState");
      });

      if (scriptEl.length > 0) {
        const scriptText = scriptEl.html() || "";
        const startKey = "initialState:";
        const startIdx = scriptText.indexOf(startKey);
        if (startIdx !== -1) {
          const jsonPart = scriptText.substring(startIdx + startKey.length).trim();
          
          let depth = 0;
          let jsonStr = "";
          const braceStart = jsonPart.indexOf("{");
          
          if (braceStart !== -1) {
            for (let i = braceStart; i < jsonPart.length; i++) {
              if (jsonPart[i] === "{") depth++;
              else if (jsonPart[i] === "}") {
                depth--;
                if (depth === 0) {
                  jsonStr = jsonPart.substring(braceStart, i + 1);
                  break;
                }
              }
            }
          }

          if (jsonStr) {
            try {
              const data = JSON.parse(jsonStr);
              const jobsKey = Object.keys(data).find((k) => k.endsWith("/jobs"));
              if (jobsKey && data[jobsKey]?.data?.jobs) {
                processJobs(data[jobsKey].data.jobs);
                nextPageToken = data[jobsKey].data.nextPageToken || "";
              }
            } catch (err) {
              console.error("[Workable Strategy] Failed to parse initialState script JSON:", err);
            }
          }
        }
      }
    }

    // Paginate until the last page
    const seenTokens = new Set<string>();

    let baseUrlObj: URL;
    try {
      baseUrlObj = new URL(ctx.searchUrl);
    } catch {
      return results;
    }

    const query = baseUrlObj.searchParams.get("query") || "";
    const workplace = baseUrlObj.searchParams.get("workplace") || "";
    const dayRange = baseUrlObj.searchParams.get("day_range") || "";

    while (nextPageToken && !seenTokens.has(nextPageToken)) {
      seenTokens.add(nextPageToken);
      try {
        const apiUrl = `https://jobs.workable.com/api/v1/jobs?query=${encodeURIComponent(query)}&workplace=${encodeURIComponent(workplace)}&day_range=${encodeURIComponent(dayRange)}&pageToken=${encodeURIComponent(nextPageToken)}`;

        // Rate limit delay: wait 1000ms between calls
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const responseText = await fetchHtml(apiUrl, ctx.userAgent);
        const data = JSON.parse(responseText);

        if (data.jobs && Array.isArray(data.jobs)) {
          processJobs(data.jobs);
          nextPageToken = data.nextPageToken || "";
        } else {
          break;
        }
      } catch (err) {
        console.error("[Workable Strategy] Pagination failed:", err);
        break;
      }
    }

    return results;
  },

  async extractDeep(html, $) {
    const descHtml = $('[data-ui="job-breakdown-description-parsed-html"]').html() || "";
    const reqsHtml = $('[data-ui="job-breakdown-requirements-parsed-html"]').html() || "";
    const benefitsHtml = $('[data-ui="job-breakdown-benefits-parsed-html"]').html() || "";

    let fullHtml = "";
    if (descHtml) {
      fullHtml += `<h3>Description</h3>${descHtml}`;
    }
    if (reqsHtml) {
      fullHtml += `<h3>Requirements</h3>${reqsHtml}`;
    }
    if (benefitsHtml) {
      fullHtml += `<h3>Benefits</h3>${benefitsHtml}`;
    }

    if (!fullHtml) {
      const breakdown = $(".jobBreakdown__job-breakdown--31MGR");
      if (breakdown.length > 0) {
        fullHtml = breakdown.html() || "";
      }
    }

    if (!fullHtml) {
      fullHtml = html;
    }

    return {
      fullDescription: convertHtmlToMarkdown(fullHtml),
    };
  },
};

// Auto-register strategy
registerStrategy(workableStrategy);
