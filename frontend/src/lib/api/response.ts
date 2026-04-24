import { NextResponse } from 'next/server';
import { ApiResponse, HttpStatus, ErrorResponse, SuccessResponse } from './types';
import { ApiError } from './errors';

// Success response helper
export function successResponse<T>(data: T, status: HttpStatus = HttpStatus.OK): NextResponse<SuccessResponse<T>> {
  return NextResponse.json(
    { success: true, data },
    { status }
  );
}

// Created response helper (201)
export function createdResponse<T>(data: T): NextResponse<SuccessResponse<T>> {
  return successResponse(data, HttpStatus.CREATED);
}

// Error response helper
export function errorResponse(
  message: string,
  status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
  code?: string,
  details?: unknown
): NextResponse<ErrorResponse> {
  const response: ErrorResponse = {
    success: false,
    error: message,
  };

  if (code) {
    response.code = code;
  }

  if (details) {
    response.details = details;
  }

  return NextResponse.json(response, { status });
}

// Handle ApiError and convert to response
export function handleApiError(error: unknown): NextResponse<ErrorResponse> {
  if (error instanceof ApiError) {
    return errorResponse(error.message, error.statusCode, error.code, error.details);
  }

  // Handle generic errors
  if (error instanceof Error) {
    return errorResponse(error.message);
  }

  // Unknown error
  return errorResponse('An unexpected error occurred');
}

// Async handler wrapper for API routes
export function withErrorHandler<T>(
  handler: () => Promise<NextResponse<T>>
): Promise<NextResponse<ApiResponse<T>>> {
  return handler().catch((error) => handleApiError(error)) as Promise<NextResponse<ApiResponse<T>>>;
}

// Utility to wrap API route handlers with automatic error handling
export function createApiHandler<T>(
  handler: (req: Request) => Promise<NextResponse<T>>
) {
  return async (req: Request): Promise<NextResponse<ApiResponse<T>>> => {
    try {
      return await handler(req) as NextResponse<ApiResponse<T>>;
    } catch (error) {
      return handleApiError(error);
    }
  };
}
