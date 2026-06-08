import { IScraper, ScraperSelectors } from './types';
import { GenericScraper } from './generic-scraper';
import { WWRScraper } from './providers/wwr';
import { LinkedInScraper } from './providers/linkedin';
import { PortalType } from '@prisma/client';

export class ScraperFactory {
  /**
   * Get the appropriate scraper for a portal type
   */
  public static getScraper(type: PortalType, selectors?: ScraperSelectors): IScraper {
    switch (type) {
      case PortalType.WEREMOTE:
        return new WWRScraper();
      case PortalType.LINKEDIN:
        return new LinkedInScraper();
      case PortalType.CUSTOM:
        if (!selectors) {
          throw new Error('Selectors are required for CUSTOM portal type');
        }
        return new GenericScraper(selectors);
      default:
        // Fallback to generic if selectors are provided, otherwise throw
        if (selectors) {
          return new GenericScraper(selectors);
        }
        throw new Error(`No scraper implemented for portal type: ${type}`);
    }
  }
}
