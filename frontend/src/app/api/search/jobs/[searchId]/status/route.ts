// Job Search Status API Route
// GET /api/search/jobs/:searchId/status - Get job search progress and results
// Based on API contract: specs/001-apply-copilot-system/contracts/api.md

import { NextRequest } from 'next/server';
import { successResponse, handleApiError } from '@/lib/api';
import { loggers } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(
  request: NextRequest,
  { params }: { params: { searchId: string } }
) {
  try {
    // Check rate limit (job search category - 10 req/min)
    const { allowed, response } = await checkRateLimit('JOB_SEARCH', request);
    if (!allowed) {
      return response!;
    }

    const { searchId } = params;

    // TODO: Fetch search status from database or cache
    // For now, return placeholder status

    loggers.api.info('Job search status requested', { searchId });

    return successResponse({
      searchId,
      status: 'COMPLETED',
      progress: 100,
      results: {
        found: 42,
        matched: 15,
        new: 8,
      },
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
