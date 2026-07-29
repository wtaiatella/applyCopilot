import { ScraperStrategy, ListResult, DeepResult, convertHtmlToMarkdown } from "../engine";
import { registerStrategy } from "../registry";

export const exampleStrategy: ScraperStrategy = {
  portalId: "example",
  async extractList(html, $, ctx) {
    const results: ListResult[] = [];
    
    $(".job-card").each((_, el) => {
      const title = $(el).find(".title").text().trim();
      const company = $(el).find(".company").text().trim();
      const url = $(el).find("a.job-link").attr("href") || "";
      const externalJobId = $(el).attr("data-job-id") || url.split("/").pop() || "";
      
      if (title && company) {
        results.push({
          externalJobId,
          title,
          company,
          url,
          location: $(el).find(".location").text().trim() ? [$(el).find(".location").text().trim()] : [],
        });
      }
    });

    // Fallback static mock data for manual/integration verification if HTML has no cards
    if (results.length === 0) {
      results.push({
        externalJobId: "ex-1",
        title: "Software Engineer (Example)",
        company: "Example Corp",
        url: "https://example.com/jobs/ex-1",
        location: ["Remote, CA"],
        locationType: "Remote",
        countries: ["United States"],
        jobType: "Full-time",
        experienceLevel: "Senior",
        postedAt: new Date(),
      });
    }

    return results;
  },
  async extractDeep(html, $) {
    const rawContent = $(".job-description").html() || "<div><h1>Job Description</h1><p>This is a sample description for the Example strategy.</p></div>";
    return {
      fullDescription: convertHtmlToMarkdown(rawContent),
    };
  },
};

// Auto-register strategy
registerStrategy(exampleStrategy);
