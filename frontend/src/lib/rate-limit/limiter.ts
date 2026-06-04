// Rate limiter factory and consumption logic
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import {
  RateLimitConfig,
  RATE_LIMITS,
  PREMIUM_AI_LIMITS,
  RateLimitCategory,
  PremiumAILimitCategory,
} from './config';

// Cache for rate limiter instances
const limiterCache = new Map<string, RateLimiterMemory>();

// Create or retrieve a rate limiter instance
function getLimiter(config: RateLimitConfig): RateLimiterMemory {
  const cacheKey = `${config.keyPrefix}_${config.points}_${config.duration}`;

  // Return cached instance if available
  const cached = limiterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Create new limiter instance
  const limiter = new RateLimiterMemory({
    keyPrefix: config.keyPrefix,
    points: config.points,
    duration: config.duration,
  });

  // Cache it
  limiterCache.set(cacheKey, limiter);

  return limiter;
}

// Get client identifier from request
function getClientIdentifier(req: Request, userId?: string): string {
  // Prefer authenticated user ID
  if (userId) {
    return userId;
  }

  // Fall back to IP address
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0].trim() || 'unknown';

  return ip;
}

// Rate limit check result
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: Date | null;
  retryAfter: number | null;
}

// Consume a point from the rate limiter
export async function consumeRateLimit(
  category: RateLimitCategory | PremiumAILimitCategory,
  req: Request,
  userId?: string,
  pointsToConsume: number = 1
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[category as RateLimitCategory] ||
                 PREMIUM_AI_LIMITS[category as PremiumAILimitCategory];

  if (!config) {
    throw new Error(`Unknown rate limit category: ${category}`);
  }

  const identifier = getClientIdentifier(req, userId);
  const limiter = getLimiter(config);

  try {
    const res = await limiter.consume(identifier, pointsToConsume);

    return {
      allowed: true,
      limit: config.points,
      remaining: res.remainingPoints,
      resetTime: new Date(Date.now() + res.msBeforeNext),
      retryAfter: null,
    };
  } catch (rej) {
    // Rate limit exceeded
    const rejection = rej as RateLimiterRes;

    return {
      allowed: false,
      limit: config.points,
      remaining: 0,
      resetTime: new Date(Date.now() + rejection.msBeforeNext),
      retryAfter: Math.ceil(rejection.msBeforeNext / 1000),
    };
  }
}

// Check rate limit without consuming (for pre-flight checks)
export async function checkRateLimit(
  category: RateLimitCategory | PremiumAILimitCategory,
  req: Request,
  userId?: string
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[category as RateLimitCategory] ||
                 PREMIUM_AI_LIMITS[category as PremiumAILimitCategory];

  if (!config) {
    throw new Error(`Unknown rate limit category: ${category}`);
  }

  const identifier = getClientIdentifier(req, userId);
  const limiter = getLimiter(config);

  try {
    const res = await limiter.get(identifier);

    if (!res) {
      // No record yet, full quota available
      return {
        allowed: true,
        limit: config.points,
        remaining: config.points,
        resetTime: null,
        retryAfter: null,
      };
    }

    return {
      allowed: res.remainingPoints > 0,
      limit: config.points,
      remaining: res.remainingPoints,
      resetTime: new Date(res.msBeforeNext > 0 ? Date.now() + res.msBeforeNext : Date.now()),
      retryAfter: res.msBeforeNext > 0 ? Math.ceil(res.msBeforeNext / 1000) : null,
    };
  } catch {
    // On error, allow the request but log it
    return {
      allowed: true,
      limit: config.points,
      remaining: config.points,
      resetTime: null,
      retryAfter: null,
    };
  }
}

// Reset rate limit for a user (useful for admin operations or testing)
export async function resetRateLimit(
  category: RateLimitCategory | PremiumAILimitCategory,
  req: Request,
  userId?: string
): Promise<void> {
  const config = RATE_LIMITS[category as RateLimitCategory] ||
                 PREMIUM_AI_LIMITS[category as PremiumAILimitCategory];

  if (!config) {
    throw new Error(`Unknown rate limit category: ${category}`);
  }

  const identifier = getClientIdentifier(req, userId);
  const limiter = getLimiter(config);

  await limiter.delete(identifier);
}

export { RATE_LIMITS, PREMIUM_AI_LIMITS };
export type { RateLimitCategory, PremiumAILimitCategory };
