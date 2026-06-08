import { Queue, Job } from 'bullmq';
import { redisConnection, QUEUE_NAMES, RETRY_CONFIG } from './config';
import { NotificationJob, NotificationChannel } from './types';
import { v4 as uuidv4 } from 'uuid';

// Queue instances
export const emailQueue = new Queue(QUEUE_NAMES.EMAIL, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: RETRY_CONFIG.MAX_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: RETRY_CONFIG.BACKOFF_DELAYS[0],
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const whatsappQueue = new Queue(QUEUE_NAMES.WHATSAPP, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: RETRY_CONFIG.MAX_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: RETRY_CONFIG.BACKOFF_DELAYS[0],
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const fallbackQueue = new Queue(QUEUE_NAMES.FALLBACK, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
    removeOnComplete: 50,
    removeOnFail: 25,
  },
});

/**
 * Add a notification job to the appropriate queue
 */
export async function queueNotification(
  jobData: Omit<NotificationJob, 'id' | 'attempts'>,
  options: { delay?: number; priority?: number } = {}
): Promise<Job<NotificationJob>> {
  const id = uuidv4();
  const fullJobData: NotificationJob = {
    ...jobData,
    id,
    attempts: 0,
  };

  const jobOptions = {
    jobId: id,
    delay: options.delay,
    priority: options.priority,
  };

  switch (jobData.channel) {
    case 'EMAIL':
      return emailQueue.add('send-email', fullJobData, jobOptions);
    case 'WHATSAPP':
      return whatsappQueue.add('send-whatsapp', fullJobData, jobOptions);
    case 'SMS':
      return fallbackQueue.add('send-sms', fullJobData, jobOptions);
    default:
      throw new Error(`Unsupported notification channel: ${jobData.channel}`);
  }
}

/**
 * Add a fallback notification job
 */
export async function queueFallbackNotification(
  originalJob: NotificationJob,
  fallbackChannel: NotificationChannel
): Promise<Job<NotificationJob>> {
  const fallbackJob: NotificationJob = {
    ...originalJob,
    id: uuidv4(),
    channel: fallbackChannel,
    attempts: 0,
    maxAttempts: 2,
  };

  return fallbackQueue.add('send-fallback', fallbackJob, {
    jobId: fallbackJob.id,
    priority: 1, // High priority for fallbacks
  });
}

/**
 * Calculate next retry time using exponential backoff
 */
export function calculateNextRetry(attempts: number): Date {
  const delay = RETRY_CONFIG.BACKOFF_DELAYS[Math.min(attempts, RETRY_CONFIG.BACKOFF_DELAYS.length - 1)];
  return new Date(Date.now() + delay);
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  email: { waiting: number; active: number; completed: number; failed: number };
  whatsapp: { waiting: number; active: number; completed: number; failed: number };
  fallback: { waiting: number; active: number; completed: number; failed: number };
}> {
  const [emailWaiting, emailActive, emailCompleted, emailFailed] = await Promise.all([
    emailQueue.getWaitingCount(),
    emailQueue.getActiveCount(),
    emailQueue.getCompletedCount(),
    emailQueue.getFailedCount(),
  ]);

  const [whatsappWaiting, whatsappActive, whatsappCompleted, whatsappFailed] = await Promise.all([
    whatsappQueue.getWaitingCount(),
    whatsappQueue.getActiveCount(),
    whatsappQueue.getCompletedCount(),
    whatsappQueue.getFailedCount(),
  ]);

  const [fallbackWaiting, fallbackActive, fallbackCompleted, fallbackFailed] = await Promise.all([
    fallbackQueue.getWaitingCount(),
    fallbackQueue.getActiveCount(),
    fallbackQueue.getCompletedCount(),
    fallbackQueue.getFailedCount(),
  ]);

  return {
    email: {
      waiting: emailWaiting,
      active: emailActive,
      completed: emailCompleted,
      failed: emailFailed,
    },
    whatsapp: {
      waiting: whatsappWaiting,
      active: whatsappActive,
      completed: whatsappCompleted,
      failed: whatsappFailed,
    },
    fallback: {
      waiting: fallbackWaiting,
      active: fallbackActive,
      completed: fallbackCompleted,
      failed: fallbackFailed,
    },
  };
}

/**
 * Close all queue connections
 */
export async function closeQueues(): Promise<void> {
  await Promise.all([
    emailQueue.close(),
    whatsappQueue.close(),
    fallbackQueue.close(),
  ]);
  await redisConnection.quit();
}
