import { NextRequest } from 'next/server';
import { successResponse, handleApiError, UnauthorizedError, NotFoundError, ForbiddenError } from '@/lib/api';
import { loggers } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCurrentUser } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { ProcessingStatus, JobListing } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ searchId: string }> }
) {
  try {
    // 1. Authenticate user
    const user = await getCurrentUser();
    if (!user || !user.id) {
      throw new UnauthorizedError('You must be logged in to check search status');
    }

    // 2. Check rate limit
    const { allowed, response } = await checkRateLimit('JOB_SEARCH', request);
    if (!allowed) {
      return response!;
    }

    const { searchId } = await params;

    // 3. Fetch search query from database
    const searchQuery = await prisma.searchQuery.findUnique({
      where: { id: searchId },
      include: {
        user: {
          select: { id: true }
        }
      }
    });

    if (!searchQuery) {
      throw new NotFoundError('Search session');
    }

    // 4. Verify ownership
    if (searchQuery.userId !== user.id) {
      throw new ForbiddenError('You do not have access to this search session');
    }

    loggers.api.info('Job search status requested', { searchId, status: searchQuery.status });
    
    interface SearchStatusData {
      searchId: string;
      status: string;
      progress: number;
      totalFound: number;
      processedCount: number;
      results?: JobListing[];
      completedAt?: Date | null;
      error?: string;
    }

    // 5. Build response based on status
    const responseData: SearchStatusData = {
      searchId,
      status: searchQuery.status.toLowerCase(),
      progress: searchQuery.status === ProcessingStatus.COMPLETED ? 100 : (searchQuery.status === ProcessingStatus.PENDING ? 0 : 50), // Simplified progress
      totalFound: searchQuery.totalFound,
      processedCount: searchQuery.processedCount,
    };

    if (searchQuery.status === ProcessingStatus.COMPLETED) {
      // Fetch some results to show immediate value
      const matches = await prisma.jobMatch.findMany({
        where: {
          userId: user.id,
          jobListing: {
            portalId: { in: searchQuery.portalIds.length > 0 ? searchQuery.portalIds : undefined }
          }
        },
        include: {
          jobListing: true
        },
        orderBy: {
          calculatedAt: 'desc'
        },
        take: 10
      });

      responseData.results = matches.map(m => m.jobListing);
      responseData.completedAt = searchQuery.lastRun;
    }

    if (searchQuery.status === ProcessingStatus.FAILED) {
      responseData.error = searchQuery.error || 'Search failed due to an internal error';
    }

    return successResponse(responseData);
  } catch (error) {
    return handleApiError(error);
  }
}
