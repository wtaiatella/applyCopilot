import { BrowserContext, Page } from 'playwright';
import { browserManager } from '../browser';
import { IScraper, ScraperOptions, ScraperResult, JobData } from '../types';
import { loggers } from '@/lib/logging';

export class LinkedInScraper implements IScraper {
  public name = 'LinkedIn';

  public async scrape(url: string, options: ScraperOptions = {}): Promise<ScraperResult> {
    const startTime = Date.now();
    let context: BrowserContext | null = null;
    let allJobs: JobData[] = [];
    const maxPages = options.maxPages || 1;
    const itemsPerPage = options.itemsPerPage || 25;

    try {
      context = await browserManager.createContent();
      const page = await context.newPage();
      
      for (let currentPage = 0; currentPage < maxPages; currentPage++) {
        const offset = currentPage * itemsPerPage;
        const pageUrl = this.buildPageUrl(url, offset);
        
        loggers.scraping.info(`LinkedIn: Scraping page ${currentPage + 1}/${maxPages}`, { url: pageUrl });
        
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: options.timeout || 60000 });

        // LinkedIn often has a "Dismiss" button for sign-in prompts in guest view
        await page.click('button[aria-label="Dismiss"]', { timeout: 2000 }).catch(() => {});

        // Scroll to ensure lazy-loaded items are present
        await page.evaluate(() => window.scrollBy(0, 1000));
        await page.waitForTimeout(1000);

        const pageJobs = await this.extractJobsFromPage(page);
        
        if (pageJobs.length === 0) {
          loggers.scraping.info('LinkedIn: No more jobs found, stopping pagination');
          break;
        }

        allJobs = [...allJobs, ...pageJobs];
        
        // Anti-bot: small delay between pages
        if (currentPage < maxPages - 1) {
          await page.waitForTimeout(Math.random() * 2000 + 1000);
        }
      }

      return {
        jobs: allJobs,
        metadata: {
          totalFound: allJobs.length,
          processedCount: allJobs.length,
          duration: Date.now() - startTime,
          url,
          pagesProcessed: maxPages
        }
      };
    } catch (error) {
      loggers.scraping.error('LinkedIn Scraping failed', { url, error });
      throw error;
    } finally {
      if (context) {
        await context.close();
      }
    }
  }

  private buildPageUrl(baseUrl: string, offset: number): string {
    const url = new URL(baseUrl);
    url.searchParams.set('start', offset.toString());
    return url.toString();
  }

  private async extractJobsFromPage(page: Page): Promise<JobData[]> {
    return await page.evaluate(() => {
      const results: any[] = [];
      const items = document.querySelectorAll('.jobs-search__results-list li');
      
      items.forEach(item => {
        const titleEl = item.querySelector('.base-search-card__title');
        const companyEl = item.querySelector('.base-search-card__subtitle');
        const linkEl = item.querySelector('.base-card__full-link');
        const locationEl = item.querySelector('.job-search-card__location');
        const dateEl = item.querySelector('time');
        
        if (titleEl && companyEl && linkEl) {
          results.push({
            externalId: linkEl.getAttribute('href')?.split('?')[0] || '',
            title: (titleEl as HTMLElement).innerText.trim(),
            company: (companyEl as HTMLElement).innerText.trim(),
            url: (linkEl as HTMLAnchorElement).href,
            location: locationEl ? (locationEl as HTMLElement).innerText.trim() : 'Remote',
            remote: true,
            description: '',
            technologies: [],
            postedAtRaw: dateEl ? dateEl.getAttribute('datetime') || dateEl.innerText.trim() : undefined,
            postedAt: dateEl ? dateEl.getAttribute('datetime') : new Date().toISOString()
          });
        }
      });
      
      return results;
    });
  }
}
