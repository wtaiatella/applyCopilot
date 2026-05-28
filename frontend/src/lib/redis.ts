import Redis from 'ioredis';
import { loggers } from '@/lib/logging';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const globalForRedis = global as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ||
  new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required for some queue systems like BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;

redis.on('connect', () => {
  loggers.app.info('Redis client connected');
});

redis.on('error', (err) => {
  loggers.app.error('Redis client error', { error: err.message });
});

/**
 * Cache utility for easy caching of data
 */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch (error) {
    loggers.app.error('Error reading from cache', { key, error });
    return null;
  }
}

export async function setCached(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
  try {
    const data = JSON.stringify(value);
    await redis.set(key, data, 'EX', ttlSeconds);
  } catch (error) {
    loggers.app.error('Error writing to cache', { key, error });
  }
}

export async function clearCache(keyPattern: string): Promise<void> {
  try {
    const keys = await redis.keys(keyPattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    loggers.app.error('Error clearing cache', { keyPattern, error });
  }
}
