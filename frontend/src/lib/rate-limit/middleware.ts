// Rate limiting middleware for Next.js API routes
import { NextRequest, NextResponse } from 'next/server';
import { consumeRateLimit, RateLimitResult, RateLimitCategory } from './limiter';
import { RATE_LIMIT_HEADERS } from './config';
import { RateLimitError } from '@/lib/api/errors';
import { loggers } from '@/lib/logging';

// Helper to add rate limit headers to response
function addRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult
): NextResponse {
  response.headers.set(RATE_LIMIT_HEADERS.LIMIT, String(result.limit));
  response.headers.set(RATE_LIMIT_HEADERS.REMAINING, String(result.remaining));

  if (result.resetTime) {
    response.headers.set(RATE_LIMIT_HEADERS.RESET, result.resetTime.toISOString());
  }

  if (result.retryAfter) {
    response.headers.set(RATE_LIMIT_HEADERS.RETRY_AFTER, String(result.retryAfter));
  }

  return response;
}

// Create a rate-limited handler wrapper
export function withRateLimit(
  category: RateLimitCategory,
  handler: (req: NextRequest) => Promise<NextResponse>,
  getUserId?: (req: NextRequest) => string | undefined
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const userId = getUserId?.(req);

    // Check rate limit
    const result = await consumeRateLimit(category, req, userId);

    if (!result.allowed) {
      // Log rate limit exceeded
      loggers.api.warn('Rate limit exceeded', {
        category,
        userId,
        ip: req.headers.get('x-forwarded-for') || 'unknown',
        path: req.nextUrl.pathname,
        retryAfter: result.retryAfter,
      });

      // Create error response
      const error = new RateLimitError(
        `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`
      );

      const response = NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
        },
        { status: error.statusCode }
      );

      return addRateLimitHeaders(response, result);
    }

    // Execute handler
    const response = await handler(req);

    // Add rate limit headers to successful response
    return addRateLimitHeaders(response, result);
  };
}

// Direct rate limit check for use in route handlers
export async function checkRateLimit(
  category: RateLimitCategory,
  req: NextRequest,
  userId?: string
): Promise<{ allowed: boolean; response?: NextResponse; result: RateLimitResult }> {
  const result = await consumeRateLimit(category, req, userId);

  if (!result.allowed) {
    const error = new RateLimitError(
      `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`
    );

    const response = NextResponse.json(
      {
        success: false,
        error: error.message,
        code: error.code,
      },
      { status: error.statusCode }
    );

    addRateLimitHeaders(response, result);

    // Log rate limit exceeded
    loggers.api.warn('Rate limit exceeded', {
      category,
      userId,
      ip: req.headers.get('x-forwarded-for') || 'unknown',
      path: req.nextUrl.pathname,
      retryAfter: result.retryAfter,
    });

    return { allowed: false, response, result };
  }

  return { allowed: true, result };
}

// Compose multiple middleware (rate limit + other middlewares)
export function composeMiddleware(
  ...middlewares: Array<(handler: (req: NextRequest) => Promise<NextResponse>) => (req: NextRequest) => Promise<NextResponse>>
) {
  return (handler: (req: NextRequest) => Promise<NextResponse>) => {
    return middlewares.reduceRight(
      (acc, middleware) => middleware(acc),
      handler
    );
  };
}
