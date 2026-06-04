import { HttpStatus, ErrorCode } from './types';

// Base API Error class
export class ApiError extends Error {
  public readonly statusCode: HttpStatus;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

// Authentication errors
export class AuthError extends ApiError {
  constructor(
    message: string = 'Authentication failed',
    code: ErrorCode = ErrorCode.AUTH_INVALID_CREDENTIALS,
    statusCode: HttpStatus = HttpStatus.UNAUTHORIZED
  ) {
    super(message, statusCode, code);
    this.name = 'AuthError';
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message: string = 'Unauthorized') {
    super(message, ErrorCode.AUTH_UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AuthError {
  constructor(message: string = 'Forbidden') {
    super(message, ErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN);
    this.name = 'ForbiddenError';
  }
}

// Validation errors
export class ValidationError extends ApiError {
  constructor(
    message: string = 'Validation failed',
    details?: Record<string, string[]>
  ) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_ERROR, details);
    this.name = 'ValidationError';
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string = 'Bad request', details?: unknown) {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.INVALID_INPUT, details);
    this.name = 'BadRequestError';
  }
}

// Resource errors
export class NotFoundError extends ApiError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, HttpStatus.NOT_FOUND, ErrorCode.RESOURCE_NOT_FOUND);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string = 'Resource conflict') {
    super(message, HttpStatus.CONFLICT, ErrorCode.RESOURCE_CONFLICT);
    this.name = 'ConflictError';
  }
}

export class AlreadyExistsError extends ApiError {
  constructor(resource: string = 'Resource') {
    super(`${resource} already exists`, HttpStatus.CONFLICT, ErrorCode.RESOURCE_ALREADY_EXISTS);
    this.name = 'AlreadyExistsError';
  }
}

// Rate limiting
export class RateLimitError extends ApiError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMIT_EXCEEDED);
    this.name = 'RateLimitError';
  }
}

// File upload errors
export class FileUploadError extends ApiError {
  constructor(
    message: string = 'File upload failed',
    code: ErrorCode = ErrorCode.FILE_UPLOAD_FAILED
  ) {
    super(message, HttpStatus.BAD_REQUEST, code);
    this.name = 'FileUploadError';
  }
}

export class FileTooLargeError extends FileUploadError {
  constructor(maxSize: string = '10MB') {
    super(`File too large. Maximum size is ${maxSize}`, ErrorCode.FILE_TOO_LARGE);
    this.name = 'FileTooLargeError';
  }
}

export class InvalidFileTypeError extends FileUploadError {
  constructor(allowedTypes: string[] = ['PDF', 'DOCX']) {
    super(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`, ErrorCode.INVALID_FILE_TYPE);
    this.name = 'InvalidFileTypeError';
  }
}

// AI processing errors
export class AIProcessingError extends ApiError {
  constructor(message: string = 'AI processing failed') {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.AI_PROCESSING_FAILED);
    this.name = 'AIProcessingError';
  }
}

export class AIServiceUnavailableError extends ApiError {
  constructor(message: string = 'AI service unavailable') {
    super(message, HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.AI_SERVICE_UNAVAILABLE);
    this.name = 'AIServiceUnavailableError';
  }
}

// Database errors
export class DatabaseError extends ApiError {
  constructor(message: string = 'Database operation failed') {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.DATABASE_ERROR);
    this.name = 'DatabaseError';
  }
}
