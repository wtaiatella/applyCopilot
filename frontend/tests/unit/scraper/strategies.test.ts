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
        location: ["Remote"],
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

import "@/lib/scraper/portals/workable"; // ensure workable strategy is registered

describe("Scraper Strategies - Workable Strategy", () => {
  it("should successfully load the workable strategy from registry", () => {
    const strategy = getStrategy("workable");
    expect(strategy).toBeDefined();
    expect(strategy?.portalId).toBe("workable");
  });

  it("should extract jobs from script tag initialState inside workable html search results", async () => {
    const strategy = getStrategy("workable");
    expect(strategy).toBeDefined();

    const mockHtml = `
      <!doctype html>
      <html>
        <head><title>Search Results</title></head>
        <body>
          <script>
            window.jobBoard = {
              initialState: {
                "api/v1/jobs": {
                  "status": 200,
                  "data": {
                    "jobs": [
                      {
                        "id": "workable-1",
                        "title": "React Developer",
                        "description": "<p>A nice React job description</p>",
                        "url": "https://jobs.workable.com/view/workable-1/remote-react-dev",
                        "company": { "title": "Workable Company" },
                        "location": { "countryName": "United States" },
                        "workplace": "remote",
                        "employmentType": "Full-time",
                        "created": "2026-07-06T12:25:50.986Z"
                      }
                    ],
                    "nextPageToken": ""
                  }
                }
              }
            };
          </script>
        </body>
      </html>
    `;

    const $ = cheerio.load(mockHtml);
    const results = await strategy!.extractList(mockHtml, $, {
      searchUrl: "https://jobs.workable.com/search?query=React",
      userAgent: "TestAgent",
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      expect.objectContaining({
        externalJobId: "workable-1",
        title: "React Developer",
        company: "Workable Company",
        url: "https://jobs.workable.com/view/workable-1/remote-react-dev",
        location: ["United States"],
        locationType: "remote",
        countries: ["United States"],
        jobType: "Full-time",
        isFullDescriptionFetched: true,
        postedAt: new Date("2026-07-06T12:25:50.986Z"),
      })
    );
    expect(results[0].fullDescription).toContain("React job description");
  });

  it("should extract full description details from workable job detail html page", async () => {
    const strategy = getStrategy("workable");
    expect(strategy).toBeDefined();

    const mockHtml = `
      <div class="jobBreakdown__job-breakdown--31MGR">
        <section>
          <div data-ui="job-breakdown-description-parsed-html">
            <h3>About the job</h3>
            <p>This is the deep description text.</p>
          </div>
        </section>
        <section>
          <div data-ui="job-breakdown-requirements-parsed-html">
            <ul>
              <li>TypeScript skill</li>
            </ul>
          </div>
        </section>
      </div>
    `;

    const $ = cheerio.load(mockHtml);
    const result = await strategy!.extractDeep(mockHtml, $);

    expect(result.fullDescription).toBeDefined();
    expect(result.fullDescription).toContain("About the job");
    expect(result.fullDescription).toContain("This is the deep description text.");
    expect(result.fullDescription).toContain("TypeScript skill");
  });
});
