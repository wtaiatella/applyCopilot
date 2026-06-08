// Dashboard Applications API Route
// GET /api/dashboard/applications - Get user's applications with status
// Based on API contract: specs/001-apply-copilot-system/contracts/api.md

import { NextRequest } from 'next/server';
import { successResponse, handleApiError } from '@/lib/api';
import { loggers } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';
import prisma from '@/lib/prisma';
import type { ApplicationStatus } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    // Check rate limit (profile management - 100 req/min)
    const { allowed, response } = await checkRateLimit('PROFILE', request);
    if (!allowed) {
      return response!;
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    // TODO: Get user ID from session
    const userId = 'placeholder-user-id';

    // Build query filter
    const where: { userId: string; status?: ApplicationStatus | { not: ApplicationStatus } } = { userId };
    if (status !== 'all') {
      where.status = status as ApplicationStatus;
    }

    // Fetch applications with pagination
    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where,
        include: {
          jobListing: {
            select: {
              title: true,
              company: true,
              location: true,
              technologies: true,
            },
          },
        },
        orderBy: { lastUpdated: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.application.count({ where }),
    ]);

    loggers.api.info('Dashboard applications retrieved', {
      userId,
      count: applications.length,
      total,
    });

    return successResponse({
      applications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
