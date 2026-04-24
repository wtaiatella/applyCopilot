// Applications API Route
// POST /api/applications - Create new application or save job
// Based on API contract: specs/001-apply-copilot-system/contracts/api.md

import { NextRequest } from 'next/server';
import { createdResponse, successResponse, handleApiError, ValidationError, NotFoundError } from '@/lib/api';
import { loggers } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';
import prisma from '@/lib/prisma';

// GET - List user's applications
export async function GET(request: NextRequest) {
  try {
    const { allowed, response } = await checkRateLimit('PROFILE', request);
    if (!allowed) {
      return response!;
    }

    const userId = 'placeholder-user-id';

    const applications = await prisma.application.findMany({
      where: { userId },
      orderBy: { lastUpdated: 'desc' },
    });

    return successResponse(applications);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST - Create new application
export async function POST(request: NextRequest) {
  try {
    const { allowed, response } = await checkRateLimit('PROFILE', request);
    if (!allowed) {
      return response!;
    }

    const body = await request.json();
    const { jobListingId, status = 'SAVED', notes } = body;

    if (!jobListingId) {
      throw new ValidationError('Job Listing ID is required');
    }

    // Verify job exists
    const job = await prisma.jobListing.findUnique({
      where: { id: jobListingId },
    });

    if (!job) {
      throw new NotFoundError('Job Listing');
    }

    const userId = 'placeholder-user-id';

    const application = await prisma.application.create({
      data: {
        userId,
        jobListingId,
        status,
        notes,
      },
    });

    loggers.api.info('Application created', {
      applicationId: application.id,
      jobListingId,
      userId,
    });

    return createdResponse(application);
  } catch (error) {
    return handleApiError(error);
  }
}
