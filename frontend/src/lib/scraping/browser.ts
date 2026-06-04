import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { loggers } from '@/lib/logging';

/**
 * Browser Manager for Playwright
 * Handles initialization, reuse, and cleanup of browser instances
 */
export class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;

  private constructor() {}

  public static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  /**
   * Initialize or get the browser instance
   */
  public async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      loggers.api.info('Launching new browser instance');
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  /**
   * Create a new browser context with standard settings
   */
  public async createContent(): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    return await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
  }

  /**
   * Close the browser instance
   */
  public async close(): Promise<void> {
    if (this.browser) {
      loggers.api.info('Closing browser instance');
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const browserManager = BrowserManager.getInstance();
