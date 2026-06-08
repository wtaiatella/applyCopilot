import { Page } from 'playwright';

export interface ScraperOptions {
  headless?: boolean;
  timeout?: number;
  proxy?: string;
  userAgent?: string;
  maxPages?: number; // Added for pagination support
  itemsPerPage?: number; // For portals that use start/offset
}

export interface JobData {
  externalId: string;
  title: string;
  company: string;
  location?: string;
  remote: boolean;
  url: string;
  description: string;
  postedAt?: Date;
  postedAtRaw?: string;
  salary?: {
    min?: number;
    max?: number;
    currency: string;
    period: 'yearly' | 'monthly' | 'hourly';
  };
  technologies: string[];
}

export interface ScraperResult {
  jobs: JobData[];
  metadata: {
    totalFound: number;
    processedCount: number;
    duration: number;
    url: string;
    pagesProcessed?: number;
  };
}

export interface IScraper {
  name: string;
  scrape(url: string, options?: ScraperOptions): Promise<ScraperResult>;
}

export interface ScraperSelectors {
  container: string;
  item: string;
  title: string;
  company: string;
  location?: string;
  description?: string;
  url: string;
  externalId?: string;
  postedAt?: string;
  technologies?: string;
}
