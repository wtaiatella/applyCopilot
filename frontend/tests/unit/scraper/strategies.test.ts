/**
 * @jest-environment node
 */
import * as cheerio from "cheerio";
import { getStrategy } from "@/lib/scraper/registry";
import "@/lib/scraper/portals/example"; // ensure example strategy is registered

describe("Scraper Strategies - Example Strategy", () => {
  it("should successfully load the example strategy from registry", () => {
    const strategy = getStrategy("example");
    expect(strategy).toBeDefined();
    expect(strategy?.portalId).toBe("example");
  });

  it("should extract jobs from html list using example strategy", async () => {
    const strategy = getStrategy("example");
    expect(strategy).toBeDefined();

    const mockHtml = `
      <div class="job-list">
        <div class="job-card" data-job-id="job-1">
          <h2 class="title">Frontend Engineer</h2>
          <span class="company">Google</span>
          <a class="job-link" href="https://example.com/jobs/job-1">Apply</a>
          <span class="location">Remote</span>
        </div>
        <div class="job-card" data-job-id="job-2">
          <h2 class="title">Backend Developer</h2>
          <span class="company">DeepMind</span>
          <a class="job-link" href="https://example.com/jobs/job-2">Apply</a>
          <span class="location">London, UK</span>
        </div>
      </div>
    `;

    const $ = cheerio.load(mockHtml);
    const results = await strategy!.extractList(mockHtml, $, {
      searchUrl: "https://example.com/search",
      userAgent: "TestAgent",
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual(
      expect.objectContaining({
        externalJobId: "job-1",
        title: "Frontend Engineer",
        company: "Google",
        location: "Remote",
        url: "https://example.com/jobs/job-1",
      })
    );
  });

  it("should extract full description details using example strategy", async () => {
    const strategy = getStrategy("example");
    expect(strategy).toBeDefined();

    const mockHtml = `
      <div class="job-description">
        <h1>Role Description</h1>
        <p>We are looking for a Software Engineer to join our team.</p>
        <ul>
          <li>Skill 1</li>
          <li>Skill 2</li>
        </ul>
      </div>
    `;

    const $ = cheerio.load(mockHtml);
    const result = await strategy!.extractDeep(mockHtml, $);

    expect(result.fullDescription).toBeDefined();
    expect(result.fullDescription).toContain("Role Description");
    expect(result.fullDescription).toContain("We are looking for a Software Engineer");
  });
});
