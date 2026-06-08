import { BrowserContext, Page } from 'playwright';
import { browserManager } from './browser';
import { ScraperSelectors } from './types';
import { ollamaClient } from '@/lib/ai/ollama';
import { loggers } from '@/lib/logging';

export class DiscoveryService {
  /**
   * Automatically discovers CSS selectors for a given job portal URL
   */
  public async discoverSelectors(url: string): Promise<ScraperSelectors> {
    let context: BrowserContext | null = null;
    try {
      context = await browserManager.createContent();
      const page = await context.newPage();
      
      loggers.scraping.info(`Discovery: Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      // Get a cleaned version of the HTML body to send to Ollama
      const htmlSnippet = await page.evaluate(() => {
        // Remove noise
        const clone = document.body.cloneNode(true) as HTMLElement;
        const toRemove = clone.querySelectorAll('script, style, svg, path, iframe, nav, footer, header, noscript');
        toRemove.forEach(el => el.remove());
        
        // Take a representative part of the body (first 10000 characters of cleaned text/html)
        return clone.innerHTML.substring(0, 15000);
      });

      loggers.scraping.info('Discovery: Analyzing DOM with Ollama...');

      const prompt = `You are an expert web scraper. Analyze this HTML snippet from a job board and identify the EXACT CSS selectors needed to extract jobs. 
      
      RULES:
      - The 'container' MUST be the unique parent element of all job items (e.g., 'table#jobsboard', 'ul.jobs', 'div.job-list').
      - The 'item' MUST be the repeating element for each job (e.g., 'tr.job', 'li.item', '.job-card').
      - All other selectors (title, company, url) MUST be relative to the 'item'.
      - For 'title', look for headings (h1, h2, h3, h4) or strong/bold tags.
      - For 'company', look for spans, divs or links near the title.
      - For 'url', find the <a> tag that links to the job details page.

      Identify these selectors:
      1. container
      2. item
      3. title
      4. company
      5. url
      6. location (optional)
      7. technologies (optional skill tags)
      8. postedAt (optional date)

      HTML Snippet:
      ${htmlSnippet}`;

      const schema = {
        type: "object",
        properties: {
          container: { type: "string", description: "CSS selector for the main list container" },
          item: { type: "string", description: "CSS selector for individual job items" },
          title: { type: "string", description: "CSS selector for job title" },
          company: { type: "string", description: "CSS selector for company name" },
          url: { type: "string", description: "CSS selector for job link" },
          location: { type: "string", description: "CSS selector for location" },
          technologies: { type: "string", description: "CSS selector for skill tags" },
          postedAt: { type: "string", description: "CSS selector for post date" }
        },
        required: ["container", "item", "title", "company", "url"]
      };

      const selectors = await ollamaClient.generateStructuredData<ScraperSelectors>(prompt, schema);
      
      loggers.scraping.info('Discovery: Verifying discovered selectors...', { selectors });

      // Simple verification in the page
      const verification = await page.evaluate((sel: ScraperSelectors) => {
        const container = document.querySelector(sel.container);
        if (!container) return { success: false, reason: 'Container not found' };
        
        const items = container.querySelectorAll(sel.item);
        if (items.length === 0) return { success: false, reason: 'Items not found inside container' };
        
        const firstItem = items[0];
        const title = firstItem.querySelector(sel.title);
        const company = firstItem.querySelector(sel.company);
        const link = firstItem.querySelector(sel.url);
        
        return { 
          success: !!(title && company && link),
          itemCount: items.length,
          foundFields: {
            title: !!title,
            company: !!company,
            url: !!link
          }
        };
      }, selectors);

      if (!verification.success) {
        loggers.scraping.warn('Discovery: Selectors found but verification failed', verification);
      } else {
        loggers.scraping.info(`Discovery: Success! Found ${verification.itemCount} items.`);
      }

      return selectors;
    } catch (error) {
      loggers.scraping.error('Discovery: Failed to discover selectors', { url, error });
      throw error;
    } finally {
      if (context) {
        await context.close();
      }
    }
  }
}

export const discoveryService = new DiscoveryService();
