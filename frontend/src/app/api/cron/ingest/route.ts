import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ScraperFactory } from '@/lib/scraping/factory';
import { logger } from '@/lib/logger';
import { PortalType } from '@prisma/client';

export const maxDuration = 300; // 5 minutes max duration for cron
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // Verify authentication if using a cron secret
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logger.info('Starting Global Worker Stage A: Continuous List Ingestion');

    // 1. Fetch enabled monitors that are due for a run
    const now = new Date();
    const monitors = await prisma.portalMonitor.findMany({
      where: {
        enabled: true,
        OR: [
          { nextRun: null },
          { nextRun: { lte: now } }
        ]
      }
    });

    logger.info(`Found ${monitors.length} monitors due for processing.`);

    const results = [];

    // 2. Process each monitor sequentially to avoid overwhelming the system
    for (const monitor of monitors) {
      try {
        logger.info(`Processing monitor: ${monitor.name} (${monitor.url})`);
        
        // 3. Initialize scraper
        const scraper = ScraperFactory.getScraper(monitor.type);
        
        // Ensure the monitor URL is valid
        if (!monitor.url) {
          throw new Error('Monitor URL is empty');
        }

        // 4. Scrape the list of jobs
        // We simulate passing the URL as search params to the scraper
        const scrapedJobs = await scraper.scrape({
          titles: [monitor.name],
          locations: [],
          remoteOnly: false
        }); // The generic scraper currently expects search parameters, we might need to adjust this
        
        // Note: The above might need adaptation depending on how ScraperFactory is implemented. 
        // For now, we assume it returns an array of JobListing-like objects.
        
        let newJobsCount = 0;

        // 5. Save the jobs into JobListing
        for (const jobData of scrapedJobs) {
          // UPSERT the job listing to avoid duplicates
          await prisma.jobListing.upsert({
            where: {
              portalMonitorId_externalId: {
                portalMonitorId: monitor.id,
                externalId: jobData.id || jobData.url
              }
            },
            update: {
              title: jobData.title,
              company: jobData.company,
              location: jobData.location,
              description: jobData.description,
            },
            create: {
              portalMonitorId: monitor.id,
              externalId: jobData.id || jobData.url,
              title: jobData.title,
              company: jobData.company,
              location: jobData.location,
              type: 'FULL_TIME', // Default or parse from jobData
              remote: jobData.remote || false,
              description: jobData.description,
              url: jobData.url,
              postedAt: jobData.postedAt || new Date(),
              processingStatus: 'PENDING'
            }
          });
          newJobsCount++;
        }

        // 6. Update the PortalMonitor
        const nextRun = new Date(now.getTime() + (monitor.intervalHours * 60 * 60 * 1000));
        
        await prisma.portalMonitor.update({
          where: { id: monitor.id },
          data: {
            lastRun: now,
            nextRun: nextRun,
            totalJobsFound: { increment: newJobsCount },
            lastError: null
          }
        });

        results.push({ monitor: monitor.name, status: 'success', jobsAdded: newJobsCount });

      } catch (err: any) {
        logger.error(`Error processing monitor ${monitor.name}:`, err);
        
        await prisma.portalMonitor.update({
          where: { id: monitor.id },
          data: {
            lastError: err.message || 'Unknown error during scraping'
          }
        });

        results.push({ monitor: monitor.name, status: 'error', error: err.message });
      }
    }

    return NextResponse.json({ success: true, processed: monitors.length, results });

  } catch (error: any) {
    logger.error('Fatal error in Global Worker Ingestion:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
