import { BrowserContext } from 'playwright';
import { browserManager } from '../browser';
import { IScraper, ScraperOptions, ScraperResult, JobData } from '../types';
import { loggers } from '@/lib/logging';

export class WWRScraper implements IScraper {
  public name = 'WeWorkRemotely';

  public async scrape(url: string, options: ScraperOptions = {}): Promise<ScraperResult> {
    const startTime = Date.now();
    let context: BrowserContext | null = null;
    let jobs: JobData[] = [];

    try {
      context = await browserManager.createContent();
      const page = await context.newPage();
      
      loggers.scraping.info(`WWR: Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: options.timeout || 30000 });

      // WWR specific: Wait for the jobs sections to appear
      await page.waitForSelector('section.jobs', { timeout: 10000 });

      // WWR specific: Extract data from all job items
      // We use page.evaluate to run complex extraction logic in the browser context
      // which is more efficient for large lists
      jobs = await page.evaluate(() => {
        const results: any[] = [];
        const items = document.querySelectorAll('section.jobs li');
        
        items.forEach(item => {
          // Identify if it's a job listing (it should have a title and company)
          const titleEl = item.querySelector('.new-listing__header__title__text');
          const companyEl = item.querySelector('.new-listing__company-name');
          const linkEl = item.querySelector('a[href^="/remote-jobs/"]');
          
          if (titleEl && companyEl && linkEl) {
            const tags = Array.from(item.querySelectorAll('.new-listing__categories__category')).map(el => (el as HTMLElement).innerText.trim());
            const dateEl = item.querySelector('.new-listing__header__icons__date');
            
            results.push({
              externalId: linkEl.getAttribute('href') || '',
              title: (titleEl as HTMLElement).innerText.trim(),
              company: (companyEl as HTMLElement).innerText.trim(),
              url: (linkEl as HTMLAnchorElement).href,
              location: tags[tags.length - 1] || 'Remote',
              remote: true,
              description: '',
              technologies: tags,
              postedAtRaw: dateEl ? (dateEl as HTMLElement).innerText.trim() : undefined,
              postedAt: new Date().toISOString() // Simplified for now
            });
          }
        });
        
        return results;
      });

      return {
        jobs,
        metadata: {
          totalFound: jobs.length,
          processedCount: jobs.length,
          duration: Date.now() - startTime,
          url
        }
      };
    } catch (error) {
      loggers.scraping.error('WWR Scraping failed', { url, error });
      throw error;
    } finally {
      if (context) {
        await context.close();
      }
    }
  }
}
