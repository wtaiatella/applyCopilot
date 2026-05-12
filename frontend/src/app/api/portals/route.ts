// Job Portals API Route
// GET /api/portals - Get available job portals
// POST /api/portals - Configure job portal
// Based on API contract: specs/001-apply-copilot-system/contracts/api.md

import { NextRequest } from 'next/server';
import { successResponse, createdResponse, handleApiError, ValidationError } from '@/lib/api';
import { loggers } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';
import prisma from '@/lib/prisma';

// GET - List available job portals
export async function GET(request: NextRequest) {
  try {
    // Check rate limit (job search category - 10 req/min)
    const { allowed, response } = await checkRateLimit('JOB_SEARCH', request);
    if (!allowed) {
      return response!;
    }

    // Get configured portals from database
    const portals = await prisma.portalConfig.findMany({
      orderBy: { name: 'asc' },
    });

    loggers.api.info('Job portals retrieved', { count: portals.length });

    return successResponse(portals);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST - Configure new job portal
export async function POST(request: NextRequest) {
  try {
    // Check rate limit (profile management - 100 req/min)
    const { allowed, response } = await checkRateLimit('PROFILE', request);
    if (!allowed) {
      return response!;
    }

    const body = await request.json();
    const { name, url, type = 'GENERIC', enabled = true, selectors, headers, rateLimit } = body;

    if (!name) {
      throw new ValidationError('Name is required');
    }

    // Get user from session (simplified - should use auth)
    const userId = body.userId; // TODO: Get from authenticated session
    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    // Create new portal configuration
    const portal = await prisma.portalConfig.create({
      data: {
        name,
        url,
        type,
        enabled,
        userId,
        selectors,
        headers,
        rateLimit,
      },
    });

    loggers.api.info('Job portal created', { portalId: portal.id, name });

    return createdResponse(portal);
  } catch (error) {
    return handleApiError(error);
  }
}
