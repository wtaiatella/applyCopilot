// Dashboard Stats API Route
// GET /api/dashboard/stats - Get user's dashboard statistics
// Based on API contract: specs/001-apply-copilot-system/contracts/api.md

import { NextRequest } from 'next/server';
import { successResponse, handleApiError } from '@/lib/api';
import { loggers } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Check rate limit (profile management - 100 req/min)
    const { allowed, response } = await checkRateLimit('PROFILE', request);
    if (!allowed) {
      return response!;
    }

    // TODO: Get user ID from session
    const userId = 'placeholder-user-id';

    // Fetch dashboard statistics
    const [
      totalApplications,
      savedJobs,
      activeApplications,
      interviews,
      offers,
      recentMatches,
    ] = await Promise.all([
      prisma.application.count({ where: { userId } }),
      prisma.application.count({ where: { userId, status: 'SAVED' } }),
      prisma.application.count({
        where: {
          userId,
          status: { in: ['APPLIED', 'INTERVIEW'] },
        },
      }),
      prisma.application.count({
        where: { userId, status: 'INTERVIEW' },
      }),
      prisma.application.count({ where: { userId, status: 'OFFER' } }),
      prisma.jobMatch.count({
        where: { userId },
        take: 5,
      }),
    ]);

    loggers.api.info('Dashboard stats retrieved', { userId });

    return successResponse({
      overview: {
        totalApplications,
        savedJobs,
        activeApplications,
        interviews,
        offers,
      },
      recentMatches,
      responseRate: totalApplications > 0
        ? Math.round((interviews / totalApplications) * 100)
        : 0,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
