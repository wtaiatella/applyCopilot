import { NextRequest, NextResponse } from 'next/server';
import { loggers } from './logger';
import { v4 as uuidv4 } from 'uuid';

// Request context for tracking requests across the application
export interface RequestContext {
  requestId: string;
  startTime: number;
  path: string;
  method: string;
  userId?: string;
}

// Generate request ID
export function generateRequestId(): string {
  return uuidv4().split('-')[0];
}

// Start request context
export function startRequestContext(req: NextRequest): RequestContext {
  return {
    requestId: req.headers.get('x-request-id') || generateRequestId(),
    startTime: Date.now(),
    path: req.nextUrl.pathname,
    method: req.method,
    userId: undefined, // Will be populated by auth middleware
  };
}

// Log incoming request
export function logRequest(context: RequestContext, req: NextRequest): void {
  loggers.api.info('Incoming request', {
    requestId: context.requestId,
    method: context.method,
    path: context.path,
    query: Object.fromEntries(req.nextUrl.searchParams),
    userAgent: req.headers.get('user-agent'),
    ip: req.headers.get('x-forwarded-for') || 'unknown',
  });
}

// Log response
export function logResponse(
  context: RequestContext,
  res: NextResponse,
  error?: Error
): void {
  const duration = Date.now() - context.startTime;
  const status = res.status;

  const logData = {
    requestId: context.requestId,
    method: context.method,
    path: context.path,
    status,
    duration: `${duration}ms`,
    userId: context.userId,
  };

  if (error) {
    loggers.api.error('Request failed', {
      ...logData,
      error: error.message,
      stack: error.stack,
    });
  } else if (status >= 400) {
    loggers.api.warn('Request completed with error', logData);
  } else {
    loggers.api.info('Request completed', logData);
  }
}

// Next.js middleware wrapper for API routes
export function withLogging(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const context = startRequestContext(req);

    // Add request ID to response headers
    const requestId = context.requestId;

    try {
      logRequest(context, req);

      const response = await handler(req);

      // Attach request ID header
      response.headers.set('x-request-id', requestId);

      logResponse(context, response);

      return response;
    } catch (error) {
      const errorResponse = NextResponse.json(
        { error: 'Internal server error', requestId },
        { status: 500 }
      );

      logResponse(context, errorResponse, error as Error);

      return errorResponse;
    }
  };
}

// Simple request logger for non-middleware usage
export function logApiRequest(
  method: string,
  path: string,
  status: number,
  duration: number,
  error?: Error
): void {
  const logData = {
    method,
    path,
    status,
    duration: `${duration}ms`,
  };

  if (error) {
    loggers.api.error('API request failed', { ...logData, error: error.message });
  } else if (status >= 400) {
    loggers.api.warn('API request completed with error', logData);
  } else {
    loggers.api.info('API request completed', logData);
  }
}
