import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

export const QUEUE_NAMES = {
  EMAIL: 'email-notifications',
  WHATSAPP: 'whatsapp-notifications',
  FALLBACK: 'fallback-notifications',
} as const;

export const RETRY_CONFIG = {
  // Exponential backoff: 1min, 5min, 15min, 1h
  BACKOFF_DELAYS: [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000],
  MAX_ATTEMPTS: 4,
  RATE_LIMIT_EMAIL: 5,      // 5 emails per minute per user
  RATE_LIMIT_WHATSAPP: 3,   // 3 WhatsApp messages per minute per user
} as const;
