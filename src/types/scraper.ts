export type ScrapeTaskType = 'LIST' | 'DEEP';
export type ScrapeTaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type PortalStatus = 'ACTIVE' | 'BROKEN' | 'DISABLED';

export interface ScrapeTaskDTO {
  id: string;
  type: ScrapeTaskType;
  portalId: string;
  status: ScrapeTaskStatus;
  progress: number;
  resultsCount: number;
  attempts: number;
  errorMessage: string | null;
  searchUrl: string | null;
  keywords: string | null;
  location: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalSearchUrlDTO {
  id: string;
  portalId: string;
  url: string;
  name: string;
  isActive: boolean;
  status: PortalStatus;
  isRobotsBlocked: boolean;
}

export interface JobListingDTO {
  id: string;
  portalId: string;
  externalJobId: string;
  title: string;
  company: string;
  location: string[];
  url: string;
  isFullDescriptionFetched: boolean;
  fullDescription: string | null;
  locationType: string | null;
  countries: string[];
  jobType: string | null;
  experienceLevel: string | null;
  postedAt: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
}

export interface SystemConfigDTO {
  globalScrapeInterval: number;
  maxConcurrency: number;
  rateLimitDelay: number;
  maxExtractionRetries: number;
  userAgent: string;
}
