/**
 * @jest-environment node
 */
import * as cheerio from "cheerio";
import { getStrategy } from "@/lib/scraper/registry";

jest.mock("@/lib/scraper/engine", () => {
  const original = jest.requireActual("@/lib/scraper/engine");
  return {
    ...original,
    fetchHtml: jest.fn().mockImplementation(() => Promise.resolve("<html></html>")),
  };
});

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
                        "employmentType": "Full-time"
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
        location: "United States",
        locationType: "remote",
        jobType: "Full-time",
        isFullDescriptionFetched: true,
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

import "@/lib/scraper/portals/wellfound"; // ensure wellfound strategy is registered
import * as fs from "fs";
import * as path from "path";

describe("Scraper Strategies - Wellfound Strategy", () => {
  it("should successfully load the wellfound strategy from registry", () => {
    const strategy = getStrategy("wellfound");
    expect(strategy).toBeDefined();
    expect(strategy?.portalId).toBe("wellfound");
  });

  it("should extract jobs from real wellfound HTML list markup", async () => {
    const strategy = getStrategy("wellfound");
    expect(strategy).toBeDefined();

    const filePath = path.join(__dirname, "../../../../debug/portals/wellfound/joblist.html");
    const html = fs.readFileSync(filePath, "utf8");
    const $ = cheerio.load(html);

    const results = await strategy!.extractList(html, $, {
      searchUrl: "https://wellfound.com/role/r/backend-engineer",
      userAgent: "TestAgent",
    });

    expect(results.length).toBeGreaterThan(0);
    // There are 43 jobs inside that HTML snippet
    expect(results).toHaveLength(43);

    // Assert first job is "Senior Engineer" from Elaborate
    expect(results[0]).toEqual(
      expect.objectContaining({
        title: "Senior Engineer",
        company: "Elaborate",
        externalJobId: "4121876",
        url: "https://wellfound.com/jobs/4121876-software-engineer",
        location: "Remote only • United States",
        locationType: "remote",
        jobType: "Full-time",
        experienceLevel: "5 years of exp",
        salaryMin: 150000,
        salaryMax: 175000,
        currency: "USD",
        isFullDescriptionFetched: false,
      })
    );

    // Assert second job is "Backend Engineer" from Elaborate
    expect(results[1]).toEqual(
      expect.objectContaining({
        title: "Backend Engineer",
        company: "Elaborate",
        externalJobId: "3137067",
        url: "https://wellfound.com/jobs/3137067-backend-engineer",
        location: "Remote only • United States",
        locationType: "remote",
        jobType: "Full-time",
        experienceLevel: "4 years of exp",
        salaryMin: 130000,
        salaryMax: 160000,
        currency: "USD",
        isFullDescriptionFetched: false,
      })
    );
  });

  it("should extract full description from JSON-LD block in wellfound deep page", async () => {
    const strategy = getStrategy("wellfound");
    expect(strategy).toBeDefined();

    const mockHtml = `
      <!doctype html>
      <html>
        <body>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "JobPosting",
              "title": "Backend Dev",
              "description": "<div><h3>Responsibilities</h3><p>Design APIs</p></div>"
            }
          </script>
        </body>
      </html>
    `;

    const $ = cheerio.load(mockHtml);
    const result = await strategy!.extractDeep(mockHtml, $);

    expect(result.fullDescription).toBeDefined();
    expect(result.fullDescription).toContain("Responsibilities");
    expect(result.fullDescription).toContain("Design APIs");
  });

  it("should fall back to HTML description selector when JSON-LD is not present", async () => {
    const strategy = getStrategy("wellfound");
    expect(strategy).toBeDefined();

    const mockHtml = `
      <!doctype html>
      <html>
        <body>
          <div id="job-description">
            <h3>Job Description Fallback</h3>
            <p>Develop microservices</p>
          </div>
        </body>
      </html>
    `;

    const $ = cheerio.load(mockHtml);
    const result = await strategy!.extractDeep(mockHtml, $);

    expect(result.fullDescription).toBeDefined();
    expect(result.fullDescription).toContain("Job Description Fallback");
    expect(result.fullDescription).toContain("Develop microservices");
  });
});
