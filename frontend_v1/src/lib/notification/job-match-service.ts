// Job Match Notification Service
// Task T031: Implement job match notification email service
// Handles batching of job match notifications (3+ matches within 5 min window)

import { prisma } from '@/lib/db';
import { queueNotification } from './queue';
import { getJobMatchBatchTemplate, JobMatchInfo } from '@/lib/email/templates';
import logger from '@/lib/logging/logger';

// Configuration
const BATCH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MIN_MATCHES_FOR_BATCH = 3;
const MAX_MATCHES_PER_EMAIL = 10;

// In-memory batch storage (use Redis in production for multi-instance)
interface MatchBatch {
  userId: string;
  matches: JobMatchInfo[];
  timer: NodeJS.Timeout | null;
}

const activeBatches = new Map<string, MatchBatch>();

/**
 * Add a job match to the user's batch queue
 * Triggers email when batch reaches threshold or window expires
 */
export async function queueJobMatchNotification(
  userId: string,
  match: JobMatchInfo
): Promise<void> {
  const batchKey = `job-match:${userId}`;

  // Get or create batch for user
  let batch = activeBatches.get(batchKey);

  if (!batch) {
    batch = {
      userId,
      matches: [],
      timer: null,
    };
    activeBatches.set(batchKey, batch);

    // Set timer to flush batch after window expires
    batch.timer = setTimeout(() => {
      void flushBatch(userId);
    }, BATCH_WINDOW_MS);
  }

  // Add match to batch
  batch.matches.push(match);

  logger.info('Job match added to batch', {
    userId,
    jobId: match.jobId,
    currentBatchSize: batch.matches.length,
  });

  // If we reached threshold, flush immediately
  if (batch.matches.length >= MIN_MATCHES_FOR_BATCH) {
    await flushBatch(userId);
  }
}

/**
 * Flush the batch and send notification
 */
async function flushBatch(userId: string): Promise<void> {
  const batchKey = `job-match:${userId}`;
  const batch = activeBatches.get(batchKey);

  if (!batch || batch.matches.length === 0) {
    return;
  }

  // Clear timer and remove batch
  if (batch.timer) {
    clearTimeout(batch.timer);
  }
  activeBatches.delete(batchKey);

  // Get user info
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { notificationPreferences: true },
  });

  if (!user) {
    logger.warn('Cannot send job match notification - user not found', { userId });
    return;
  }

  // Check user notification preferences
  const prefs = user.notificationPreferences;
  if (prefs && !prefs.notifyOnJobMatches) {
    logger.info('Job match notification skipped - user disabled', { userId });
    return;
  }

  // Limit matches per email
  const matchesToSend = batch.matches.slice(0, MAX_MATCHES_PER_EMAIL);

  // Get first name
  const firstName = user.name.split(' ')[0];

  // Generate email content
  const emailTemplate = getJobMatchBatchTemplate(firstName, matchesToSend);

  // Queue notification
  await queueNotification(
    {
      userId: user.id,
      type: 'JOB_MATCH',
      channel: 'EMAIL',
      email: user.email,
      subject: emailTemplate.subject,
      body: emailTemplate.html || emailTemplate.text,
      maxAttempts: 3,
    },
    { priority: 2 } // Lower priority than password reset, higher than digests
  );

  logger.info('Job match batch notification queued', {
    userId,
    matchCount: matchesToSend.length,
    totalInBatch: batch.matches.length,
  });

  // If there are more matches, create a new batch with remaining
  if (batch.matches.length > MAX_MATCHES_PER_EMAIL) {
    const remaining = batch.matches.slice(MAX_MATCHES_PER_EMAIL);
    const newBatch: MatchBatch = {
      userId,
      matches: remaining,
      timer: setTimeout(() => {
        void flushBatch(userId);
      }, BATCH_WINDOW_MS),
    };
    activeBatches.set(batchKey, newBatch);
  }
}

/**
 * Force flush all pending batches (useful for shutdown or testing)
 */
export async function flushAllBatches(): Promise<void> {
  const promises: Promise<void>[] = [];

  for (const [key, batch] of activeBatches.entries()) {
    if (batch.timer) {
      clearTimeout(batch.timer);
    }
    const userId = key.replace('job-match:', '');
    promises.push(flushBatch(userId));
  }

  await Promise.all(promises);
  activeBatches.clear();
}

/**
 * Get pending batch stats (for monitoring)
 */
export function getBatchStats(): {
  activeBatches: number;
  totalPendingMatches: number;
} {
  let totalPendingMatches = 0;

  for (const batch of activeBatches.values()) {
    totalPendingMatches += batch.matches.length;
  }

  return {
    activeBatches: activeBatches.size,
    totalPendingMatches,
  };
}

/**
 * Trigger job match notification immediately for a user
 * Use this when explicitly requesting notification (e.g., from UI)
 */
export async function triggerJobMatchNotification(
  userId: string,
  force: boolean = false
): Promise<{ success: boolean; message: string }> {
  const batchKey = `job-match:${userId}`;
  const batch = activeBatches.get(batchKey);

  if (!batch || batch.matches.length === 0) {
    return { success: false, message: 'No pending job matches to notify' };
  }

  // Only force flush if we have matches or force is true
  if (force || batch.matches.length > 0) {
    await flushBatch(userId);
    return {
      success: true,
      message: `Notification sent for ${batch.matches.length} job matches`,
    };
  }

  return { success: false, message: 'Not enough matches for notification' };
}
