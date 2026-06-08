// Rate limiting configuration based on API contracts
// Source: specs/001-apply-copilot-system/contracts/api.md

import { RateLimiterAbstract } from 'rate-limiter-flexible';

// Rate limit tiers per specification
export interface RateLimitConfig {
  points: number;      // Number of requests allowed
  duration: number;  // Duration in seconds
  keyPrefix?: string;  // Prefix for rate limit keys
}

// Standard endpoint rate limits
export const RATE_LIMITS = {
  // Authentication: 5 requests per minute
  AUTH: {
    points: 5,
    duration: 60,
    keyPrefix: 'auth',
  } as RateLimitConfig,

  // Profile management: 100 requests per minute
  PROFILE: {
    points: 100,
    duration: 60,
    keyPrefix: 'profile',
  } as RateLimitConfig,

  // Job search: 10 requests per minute per user
  JOB_SEARCH: {
    points: 10,
    duration: 60,
    keyPrefix: 'job_search',
  } as RateLimitConfig,

  // AI processing: 20 requests per minute per user
  AI_PROCESSING: {
    points: 20,
    duration: 60,
    keyPrefix: 'ai',
  } as RateLimitConfig,

  // File upload: 5 requests per minute per user
  FILE_UPLOAD: {
    points: 5,
    duration: 60,
    keyPrefix: 'upload',
  } as RateLimitConfig,

  // Password reset: 3 requests per hour
  PASSWORD_RESET: {
    points: 3,
    duration: 3600, // 1 hour
    keyPrefix: 'password_reset',
  } as RateLimitConfig,

  // Email notifications: 5 per minute per user
  EMAIL_NOTIFICATION: {
    points: 5,
    duration: 60,
    keyPrefix: 'email',
  } as RateLimitConfig,
} as const;

// Premium AI rate limits (per hour)
export const PREMIUM_AI_LIMITS = {
  // Cover letter generation: 10 per hour
  COVER_LETTER: {
    points: 10,
    duration: 3600,
    keyPrefix: 'premium_cover_letter',
  } as RateLimitConfig,

  // CV suggestions: 20 per hour
  CV_SUGGESTIONS: {
    points: 20,
    duration: 3600,
    keyPrefix: 'premium_cv_suggestions',
  } as RateLimitConfig,

  // Job compatibility analysis: 50 per hour
  COMPATIBILITY_ANALYSIS: {
    points: 50,
    duration: 3600,
    keyPrefix: 'premium_compatibility',
  } as RateLimitConfig,
} as const;

// Type for rate limit categories
export type RateLimitCategory = keyof typeof RATE_LIMITS;
export type PremiumAILimitCategory = keyof typeof PREMIUM_AI_LIMITS;

// Headers sent to client
export const RATE_LIMIT_HEADERS = {
  LIMIT: 'X-RateLimit-Limit',
  REMAINING: 'X-RateLimit-Remaining',
  RESET: 'X-RateLimit-Reset',
  RETRY_AFTER: 'Retry-After',
} as const;

// In-memory store for rate limiters (can be replaced with Redis in production)
const rateLimiterStore = new Map<string, RateLimiterAbstract>();

export { rateLimiterStore };
