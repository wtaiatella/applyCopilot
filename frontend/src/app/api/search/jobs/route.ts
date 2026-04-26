// Job Search API Route
// POST /api/search/jobs - Initiate job search across configured portals
// Based on API contract: specs/001-apply-copilot-system/contracts/api.md

import { NextRequest } from 'next/server';
import { createdResponse, handleApiError, ValidationError } from '@/lib/api';
import { loggers } from '@/lib/logging';
import { checkRateLimit } from '@/lib/rate-limit';

// POST - Start a new job search
export async function POST(request: NextRequest) {
  try {
    // Check rate limit (job search category - 10 req/min)
    const { allowed, response } = await checkRateLimit('JOB_SEARCH', request);
    if (!allowed) {
      return response!;
    }

    const body = await request.json();
    const {
      portals,
      keywords,
    } = body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      throw new ValidationError('Keywords array is required');
    }

    // Generate search ID
    const searchId = `search-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // TODO: Trigger async job search process
    // This would queue jobs for scraping in background

    loggers.api.info('Job search initiated', {
      searchId,
      keywords: keywords.join(', '),
      portals: portals?.length || 'all',
    });

    return createdResponse({
      searchId,
      status: 'PENDING',
      estimatedTime: '30-60 seconds',
      progress: 0,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
