import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import {
  queueJobMatchNotification,
  triggerJobMatchNotification,
  getBatchStats,
} from '@/lib/notification';
import { JobMatchInfo } from '@/lib/email/templates';
import logger from '@/lib/logging/logger';
import { authOptions } from '@/lib/auth/config';

// Schema for manual job match trigger
const manualTriggerSchema = z.object({
  jobMatches: z.array(
    z.object({
      jobId: z.string(),
      jobTitle: z.string(),
      company: z.string(),
      compatibilityScore: z.number().min(0).max(100),
    })
  ).min(1),
});

/**
 * POST /api/notifications/job-matches
 * Trigger job match notification (used by job matching system)
 * Requires authentication
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Parse and validate request body
    const body = await request.json();
    const validation = manualTriggerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { jobMatches } = validation.data;

    // Queue each job match for batching
    for (const match of jobMatches) {
      const matchInfo: JobMatchInfo = {
        jobId: match.jobId,
        jobTitle: match.jobTitle,
        company: match.company,
        compatibilityScore: match.compatibilityScore,
      };

      await queueJobMatchNotification(userId, matchInfo);
    }

    logger.info('Job matches queued for notification', {
      userId,
      matchCount: jobMatches.length,
    });

    // If we have 3+ matches, the batch will flush immediately
    // Otherwise, return info about the batch window
    const batchStats = getBatchStats();

    return NextResponse.json(
      {
        message: `${jobMatches.length} job match(es) queued for notification`,
        batchStats,
        willSendEmail: jobMatches.length >= 3,
        windowMinutes: 5,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Job match notification error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/notifications/job-matches
 * Get current batch status for the user
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Get pending job matches from database that haven't been notified yet
    const pendingMatches = await prisma.jobMatch.findMany({
      where: {
        userId,
        // Only get matches that haven't been notified in the last batch
        calculatedAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
        },
      },
      include: {
        jobListing: {
          select: {
            id: true,
            title: true,
            company: true,
          },
        },
      },
      orderBy: {
        overallScore: 'desc',
      },
      take: 10,
    });

    const batchStats = getBatchStats();

    return NextResponse.json(
      {
        pendingMatches: pendingMatches.map((match) => ({
          jobId: match.jobListing.id,
          jobTitle: match.jobListing.title,
          company: match.jobListing.company,
          compatibilityScore: Math.round(match.overallScore),
          calculatedAt: match.calculatedAt,
        })),
        batchStats,
        threshold: 3,
        windowMinutes: 5,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Get job match status error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/notifications/job-matches
 * Force flush pending batch for immediate notification
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const result = await triggerJobMatchNotification(userId, true);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error('Force flush job matches error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
