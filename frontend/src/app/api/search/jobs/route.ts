import { NextRequest } from 'next/server';
import { createdResponse, handleApiError, ValidationError, UnauthorizedError } from '@/lib/api';
import { loggers } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCurrentUser } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { ScraperFactory } from '@/lib/scraping/factory';
import { ScraperSelectors } from '@/lib/scraping/types';
import { UrlBuilder } from '@/lib/scraping/url-builder';
import { ProcessingStatus, ExperienceLevel, SearchFrequency, PortalType } from '@prisma/client';

// POST - Start a new job search
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await getCurrentUser();
    if (!user || !user.id) {
      throw new UnauthorizedError('You must be logged in to search for jobs');
    }

    // 2. Check rate limit (job search category - 10 req/min)
    const { allowed, response } = await checkRateLimit('JOB_SEARCH', request);
    if (!allowed) {
      return response!;
    }

    // 3. Parse and validate body
    const body = await request.json();
    const {
      title,
      portalIds,
      keywords,
      targetTitles,
      hardSkills,
      softSkills,
      technologies,
      experienceLevel,
      remoteOnly,
      salaryMin,
      salaryMax,
      locations,
    } = body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      throw new ValidationError('Keywords array is required');
    }

    // 4. Create SearchQuery in database
    const searchQuery = await prisma.searchQuery.create({
      data: {
        userId: user.id,
        title: title || `Search: ${keywords.join(', ')}`,
        keywords,
        targetTitles: targetTitles || [],
        hardSkills: hardSkills || [],
        softSkills: softSkills || [],
        technologies: technologies || [],
        experienceLevel: (experienceLevel?.toUpperCase() as ExperienceLevel) || ExperienceLevel.MID,
        remoteOnly: remoteOnly ?? true,
        salaryMin: salaryMin || null,
        salaryMax: salaryMax || null,
        locations: locations || [],
        portalIds: portalIds || [],
        status: ProcessingStatus.PENDING,
        funnelStage: 0,
        frequency: SearchFrequency.MANUAL,
      },
    });

    loggers.api.info('Job search initiated', {
      searchId: searchQuery.id,
      userId: user.id,
      keywords: keywords.join(', '),
    });

    // 5. Trigger async scraping process (Fire and Forget for now)
    // In a real production environment, this would be a background job (BullMQ/Redis)
    triggerScraping(searchQuery.id, user.id).catch(err => {
      loggers.api.error('Failed to trigger background scraping', { searchId: searchQuery.id, error: err });
    });

    return createdResponse({
      searchId: searchQuery.id,
      status: ProcessingStatus.PENDING,
      message: 'Job search initiated successfully',
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Background task to handle scraping
 * Updates SearchQuery status and stores results
 */
async function triggerScraping(searchId: string, userId: string) {
  try {
    // Update status to PROCESSING
    await prisma.searchQuery.update({
      where: { id: searchId },
      data: { status: ProcessingStatus.PROCESSING },
    });

    const searchQuery = await prisma.searchQuery.findUnique({
      where: { id: searchId },
    });

    if (!searchQuery) return;

    // Fetch portal configs
    const portals = await prisma.portalConfig.findMany({
      where: {
        id: { in: searchQuery.portalIds },
        enabled: true,
      },
    });

    // If no portals specified, use all enabled portals for user
    const targetPortals = portals.length > 0 
      ? portals 
      : await prisma.portalConfig.findMany({
          where: { userId, enabled: true },
        });

    let totalFound = 0;
    
    for (const portal of targetPortals) {
      try {
        const scraper = ScraperFactory.getScraper(portal.type, portal.selectors as unknown as ScraperSelectors);
        
        // Build dynamic search URL
        const url = UrlBuilder.build(portal.type, portal.url || '', {
          keywords: searchQuery.keywords,
          location: searchQuery.locations[0], // Take first location if available
          remoteOnly: searchQuery.remoteOnly
        });
        
        loggers.scraping.info(`Starting scraper for ${portal.name}`, { searchId, portalId: portal.id, url });
        
        // Scrape with pagination for known providers
        const result = await scraper.scrape(url, { 
          timeout: 60000,
          maxPages: portal.type === PortalType.LINKEDIN ? 2 : 1, // Start with 2 pages for LinkedIn
          itemsPerPage: 25
        });
        
        totalFound += result.jobs.length;

        // Store job listings and create matches
        for (const jobData of result.jobs) {
          const job = await prisma.jobListing.upsert({
            where: {
              portalId_externalId: {
                portalId: portal.id,
                externalId: jobData.externalId,
              },
            },
            create: {
              portalId: portal.id,
              externalId: jobData.externalId,
              title: jobData.title,
              company: jobData.company,
              location: jobData.location,
              remote: jobData.remote,
              url: jobData.url,
              description: jobData.description || '',
              technologies: jobData.technologies || [],
              postedAt: jobData.postedAt,
              type: 'FULL_TIME', // Default
            },
            update: {
              title: jobData.title,
              company: jobData.company,
              location: jobData.location,
              remote: jobData.remote,
              url: jobData.url,
              postedAt: jobData.postedAt,
            },
          });

          // Create placeholder match
          await prisma.jobMatch.upsert({
            where: {
              userId_jobListingId: {
                userId,
                jobListingId: job.id,
              },
            },
            create: {
              userId,
              jobListingId: job.id,
              overallScore: 0, // Will be updated by AI pipeline
              algorithm: 'placeholder',
            },
            update: {},
          });
        }

        // Update progress
        await prisma.searchQuery.update({
          where: { id: searchId },
          data: { 
            totalFound,
            processedCount: totalFound, // Simple for now
          },
        });

      } catch (err) {
        loggers.api.error(`Scraper failed for portal ${portal.name}`, { portalId: portal.id, error: err });
      }
    }

    // Complete search
    await prisma.searchQuery.update({
      where: { id: searchId },
      data: { 
        status: ProcessingStatus.COMPLETED,
        lastRun: new Date(),
      },
    });

  } catch (error) {
    loggers.api.error('Scraping process failed', { searchId, error });
    await prisma.searchQuery.update({
      where: { id: searchId },
      data: { 
        status: ProcessingStatus.FAILED,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}
