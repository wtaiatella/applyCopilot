import { PortalType } from '@prisma/client';

interface SearchFilters {
  keywords: string[];
  location?: string;
  remoteOnly?: boolean;
}

export class UrlBuilder {
  /**
   * Builds a search URL for a specific portal type and filters
   */
  public static build(type: PortalType, baseUrl: string, filters: SearchFilters): string {
    const { keywords, location, remoteOnly } = filters;
    const searchString = keywords.join(' ');

    switch (type) {
      case PortalType.WEREMOTE:
        // WWR uses path-based search or categories
        // Example: https://weworkremotely.com/remote-jobs/search?term=python
        const wwrUrl = new URL('https://weworkremotely.com/remote-jobs/search');
        wwrUrl.searchParams.set('term', searchString);
        return wwrUrl.toString();

      case PortalType.LINKEDIN:
        // LinkedIn Search URL
        // f_WT=2 is the filter for Remote
        const linkedinUrl = new URL('https://www.linkedin.com/jobs/search');
        linkedinUrl.searchParams.set('keywords', searchString);
        if (location) linkedinUrl.searchParams.set('location', location);
        if (remoteOnly) linkedinUrl.searchParams.set('f_WT', '2');
        return linkedinUrl.toString();

      case PortalType.CUSTOM:
      default:
        // For custom portals, we might just append the keywords as a query param 'q' 
        // if the URL doesn't already have search parameters.
        try {
          const url = new URL(baseUrl);
          if (keywords.length > 0) {
            // Most sites use 'q', 'query', or 's'
            url.searchParams.set('q', searchString);
          }
          return url.toString();
        } catch (e) {
          return baseUrl;
        }
    }
  }
}
