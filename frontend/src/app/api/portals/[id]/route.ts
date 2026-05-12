// Job Portals API Route
// GET /api/portals/[id] - Get specific job portal
// PATCH /api/portals/[id] - Update job portal configuration
// DELETE /api/portals/[id] - Remove job portal configuration

import { NextRequest } from 'next/server';
import { successResponse, handleApiError, ValidationError, notFoundResponse, noContentResponse } from '@/lib/api';
import { loggers } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Get specific portal
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    // Check rate limit
    const { allowed, response } = await checkRateLimit('JOB_SEARCH', request);
    if (!allowed) {
      return response!;
    }

    const portal = await prisma.portalConfig.findUnique({
      where: { id },
    });

    if (!portal) {
      return notFoundResponse('Job portal not found');
    }

    return successResponse(portal);
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH - Update portal configuration
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    // Check rate limit
    const { allowed, response } = await checkRateLimit('PROFILE', request);
    if (!allowed) {
      return response!;
    }

    const body = await request.json();
    const { name, url, type, enabled, selectors, headers, rateLimit } = body;

    // Verify existence
    const existing = await prisma.portalConfig.findUnique({
      where: { id },
    });

    if (!existing) {
      return notFoundResponse('Job portal not found');
    }

    // Update portal configuration
    const portal = await prisma.portalConfig.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(url !== undefined && { url }),
        ...(type && { type }),
        ...(enabled !== undefined && { enabled }),
        ...(selectors && { selectors }),
        ...(headers && { headers }),
        ...(rateLimit !== undefined && { rateLimit }),
      },
    });

    loggers.api.info('Job portal updated', { portalId: portal.id });

    return successResponse(portal);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE - Remove portal configuration
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    // Check rate limit
    const { allowed, response } = await checkRateLimit('PROFILE', request);
    if (!allowed) {
      return response!;
    }

    // Verify existence
    const existing = await prisma.portalConfig.findUnique({
      where: { id },
    });

    if (!existing) {
      return notFoundResponse('Job portal not found');
    }

    await prisma.portalConfig.delete({
      where: { id },
    });

    loggers.api.info('Job portal deleted', { portalId: id });

    return noContentResponse();
  } catch (error) {
    return handleApiError(error);
  }
}
