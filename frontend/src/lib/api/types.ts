// API Response Types - Based on API Contract specs/001-apply-copilot-system/contracts/api.md

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: unknown;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
}

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
}

// HTTP Status codes used across the API
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
}

// Error codes for client-side handling
export enum ErrorCode {
  // Authentication errors
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_SESSION_EXPIRED = 'AUTH_SESSION_EXPIRED',
  AUTH_UNAUTHORIZED = 'AUTH_UNAUTHORIZED',
  AUTH_FORBIDDEN = 'AUTH_FORBIDDEN',

  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Resource errors
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',

  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // File upload errors
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  FILE_UPLOAD_FAILED = 'FILE_UPLOAD_FAILED',

  // AI processing errors
  AI_PROCESSING_FAILED = 'AI_PROCESSING_FAILED',
  AI_SERVICE_UNAVAILABLE = 'AI_SERVICE_UNAVAILABLE',

  // Database errors
  DATABASE_ERROR = 'DATABASE_ERROR',

  // Generic errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}
