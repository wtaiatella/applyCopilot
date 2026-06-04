import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ScraperFactory } from '@/lib/scraping/factory';
import { loggers } from '@/lib/logging';

async function checkAdmin(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return false;
  }
  return true;
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    if (!(await checkAdmin(request))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await props.params;
    const monitor = await prisma.portalMonitor.findUnique({
      where: { id }
    });

    if (!monitor) {
      return NextResponse.json({ success: false, error: 'Monitor not found' }, { status: 404 });
    }

    // Run scraping synchronously for the admin panel trigger
    loggers.api.info(`Manual Trigger: Processing monitor: ${monitor.name} (${monitor.url})`);
    
    const scraper = ScraperFactory.getScraper(monitor.type);
    
    if (!monitor.url) {
      throw new Error('Monitor URL is empty');
    }

    const result = await scraper.scrape(monitor.url, { timeout: 30000 });
    const scrapedJobs = result.jobs;
    
    let newJobsCount = 0;

    for (const jobData of scrapedJobs) {
      await prisma.jobListing.upsert({
        where: {
          portalMonitorId_externalId: {
            portalMonitorId: monitor.id,
            externalId: jobData.externalId || jobData.url
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
          externalId: jobData.externalId || jobData.url,
          title: jobData.title,
          company: jobData.company,
          location: jobData.location,
          type: 'FULL_TIME',
          remote: jobData.remote || false,
          description: jobData.description,
          url: jobData.url,
          postedAt: jobData.postedAt || new Date(),
          processingStatus: 'PENDING'
        }
      });
      newJobsCount++;
    }

    const now = new Date();
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

    return NextResponse.json({ success: true, message: `Scraped ${newJobsCount} jobs.` });

  } catch (error: any) {
    const { id } = await props.params;
    loggers.api.error(`Manual Trigger Error for monitor ${id}:`, error);
    
    await prisma.portalMonitor.update({
      where: { id: id },
      data: {
        lastError: error.message || 'Unknown error during scraping'
      }
    });

    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
