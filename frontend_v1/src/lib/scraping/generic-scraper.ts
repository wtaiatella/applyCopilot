import { Page, BrowserContext, ElementHandle } from 'playwright';
import { browserManager } from './browser';
import { IScraper, ScraperOptions, ScraperResult, JobData, ScraperSelectors } from './types';
import { loggers } from '@/lib/logging';

export class GenericScraper implements IScraper {
  public name = 'Generic Scraper';
  private selectors: ScraperSelectors;

  constructor(selectors: ScraperSelectors) {
    this.selectors = selectors;
  }

  public async scrape(url: string, options: ScraperOptions = {}): Promise<ScraperResult> {
    const startTime = Date.now();
    let context: BrowserContext | null = null;
    const jobs: JobData[] = [];

    try {
      context = await browserManager.createContent();
      const page = await context.newPage();
      
      loggers.api.info(`Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: options.timeout || 30000 });

      // Wait for container
      await page.waitForSelector(this.selectors.container, { timeout: 15000 });

      // Extract items
      const items = await page.$$(this.selectors.item);
      loggers.api.info(`Found ${items.length} potential job items`);

      for (const item of items) {
        try {
          const job = await this.extractJobData(item, page.url());
          if (job) {
            jobs.push(job);
          } else {
            // Optional: log why it was skipped if needed for debugging
          }
        } catch (err) {
          loggers.api.error('Error extracting individual job item', { error: err });
        }
      }

      return {
        jobs,
        metadata: {
          totalFound: items.length,
          processedCount: jobs.length,
          duration: Date.now() - startTime,
          url
        }
      };
    } catch (error) {
      loggers.api.error('Scraping failed', { url, error });
      throw error;
    } finally {
      if (context) {
        await context.close();
      }
    }
  }

  private async extractJobData(item: ElementHandle, baseUrl: string): Promise<JobData | null> {
    // Basic extraction logic using selectors
    const title = await item.$eval(this.selectors.title, (el: HTMLElement) => el.innerText.trim()).catch(() => null);
    const company = await item.$eval(this.selectors.company, (el: HTMLElement) => el.innerText.trim()).catch(() => null);
    const url = await item.$eval(this.selectors.url, (el: HTMLAnchorElement) => el.href).catch(() => null);
    
    if (!title || !company || !url) return null;

    const location = this.selectors.location 
      ? await item.$eval(this.selectors.location, (el: HTMLElement) => el.innerText.trim()).catch(() => 'Remote')
      : 'Remote';

    const externalId = this.selectors.externalId
      ? await item.$eval(this.selectors.externalId, (el: HTMLElement) => el.getAttribute('data-job-id') || el.id).catch(() => url)
      : url;

    // Extract Skills/Technologies
    let technologies: string[] = [];
    if (this.selectors.technologies) {
      technologies = await item.$$eval(this.selectors.technologies, (elements: HTMLElement[]) => 
        elements.map(el => el.innerText.trim()).filter(Boolean)
      ).catch(() => []);
    }

    // Extract Posted Date
    let postedAtRaw: string | undefined;
    if (this.selectors.postedAt) {
      postedAtRaw = await item.$eval(this.selectors.postedAt, (el: HTMLElement) => 
        el.getAttribute('datetime') || el.innerText.trim()
      ).catch(() => undefined);
    }

    return {
      externalId,
      title,
      company,
      location,
      remote: true,
      url,
      description: '', 
      technologies,
      postedAtRaw,
      postedAt: postedAtRaw ? new Date(postedAtRaw) : new Date(),
    };
  }
}
