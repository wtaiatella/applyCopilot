/**
 * @jest-environment node
 */
import * as cheerio from "cheerio";
import { getStrategy } from "@/lib/scraper/registry";
import {
  parseListDate,
  parseAnnualSalary,
} from "@/lib/scraper/portals/jobspresso";

const listFragment = `
<li id="job_listing-164845" class="job_listing" data-href="https://jobspresso.co/job/veterinary-dentist-dental-annotator/">
  <a href="https://jobspresso.co/job/veterinary-dentist-dental-annotator/" class="job_listing-clickbox"></a>
  <h3 class="job_listing-title">Veterinary Dentist / Dental Annotator</h3>
  <div class="job_listing-company"><strong>Mindy Support</strong></div>
  <div class="jobspresso-card-salary"><span>US$80k - US$100k/yr</span></div>
  <div class="job_listing-location"><a>Worldwide</a></div>
  <ul><li class="job_listing-type">AI &amp; Data</li><li class="job_listing-date">Yesterday</li></ul>
</li>`;

describe("Scraper Strategies - Jobspresso Strategy", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("registers the strategy", () => {
    expect(getStrategy("jobspresso")?.portalId).toBe("jobspresso");
  });

  it("extracts jobs from the AJAX listing and paginates", async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      calls.push(String(init?.body));
      const page = new URLSearchParams(String(init?.body)).get("page");
      const html = page === "1" ? listFragment : listFragment.replace(/164845/g, "164846");
      return new Response(JSON.stringify({ html, max_num_pages: 2 }), { status: 200 });
    }) as unknown as typeof fetch;

    const timeoutSpy = jest
      .spyOn(global, "setTimeout")
      .mockImplementation(((fn: () => void) => {
        fn();
        return 0;
      }) as unknown as typeof setTimeout);
    const strategy = getStrategy("jobspresso")!;
    const results = await strategy.extractList("", cheerio.load(""), {
      searchUrl: "https://jobspresso.co/remote-non-tech-jobs/#types=ai-data,developer",
      userAgent: "Test",
    });
    timeoutSpy.mockRestore();

    expect(calls).toHaveLength(2);
    expect(new URLSearchParams(calls[0]).getAll("filter_job_type[]")).toEqual(["ai-data", "developer"]);
    expect(results.map((r) => r.externalJobId)).toEqual(["164845", "164846"]);
    expect(results[0]).toEqual(
      expect.objectContaining({
        title: "Veterinary Dentist / Dental Annotator",
        company: "Mindy Support",
        location: ["Worldwide"],
        locationType: "remote",
        salaryMin: 80000,
        salaryMax: 100000,
        currency: "USD",
        isFullDescriptionFetched: false,
      }),
    );
  });

  it("extracts the full description from JSON-LD on the job page", async () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      description: "<p>About the role</p><ul><li>Annotate X-rays</li></ul>",
    })}</script>`;
    const result = await getStrategy("jobspresso")!.extractDeep(html, cheerio.load(html));
    expect(result.fullDescription).toContain("About the role");
    expect(result.fullDescription).toContain("Annotate X-rays");
  });

  it("parses list dates and annual salaries", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    expect(parseListDate("Today", now)).toEqual(new Date("2026-11-02T00:00:00Z"));
    expect(parseListDate("Yesterday", now)).toEqual(new Date("2026-11-01T00:00:00Z"));
    expect(parseListDate("October 31", now)).toEqual(new Date("2026-10-31T00:00:00Z"));
    expect(parseListDate("December 5", now)).toEqual(new Date("2025-12-05T00:00:00Z"));
    expect(parseAnnualSalary("US$24 - US$25/hr")).toEqual({});
  });
});
