import { Worker, Job } from 'bullmq';
import { redisConnection, QUEUE_NAMES, RETRY_CONFIG } from './config';
import {
  NotificationJob,
  NotificationResult,
} from './types';
import { queueFallbackNotification, calculateNextRetry } from './queue';
import { sendEmail } from '../email';
import { sendWhatsAppMessage } from '../email/twilio';
import { prisma } from '../db';
import logger from '../logging/logger';

// Calculate exponential backoff delay

// Update notification status in database
async function updateNotificationStatus(
  jobId: string,
  status: 'PROCESSING' | 'DELIVERED' | 'FAILED',
  data: {
    attempts?: number;
    lastError?: string;
    nextRetryAt?: Date;
    deliveredAt?: Date;
  }
): Promise<void> {
  try {
    await prisma.notificationQueue.update({
      where: { id: jobId },
      data: {
        status,
        ...data,
      },
    });
  } catch (error) {
    logger.error('Failed to update notification status:', { jobId, status, error });
  }
}

// Log notification delivery
async function logNotification(
  job: NotificationJob,
  result: NotificationResult,
  isFallback: boolean = false
): Promise<void> {
  try {
    await prisma.notificationLog.create({
      data: {
        userId: job.userId,
        queueId: job.id,
        type: job.type,
        channel: isFallback && job.fallbackChannel ? job.fallbackChannel : job.channel,
        status: result.success ? (isFallback ? 'DELIVERED' : 'SENT') : 'FAILED',
        recipient: job.email || job.phone || '',
        subject: job.subject,
        bodyPreview: job.body.substring(0, 200),
        error: result.error,
        providerMessageId: result.messageId,
      },
    });
  } catch (error) {
    logger.error('Failed to log notification:', { jobId: job.id, error });
  }
}

// Process email notification
async function processEmail(jobData: NotificationJob): Promise<NotificationResult> {
  if (!jobData.email) {
    return {
      success: false,
      error: 'Email address is required',
      shouldRetry: false,
    };
  }

  try {
    const result = await sendEmail({
      to: jobData.email,
      subject: jobData.subject || 'Notification',
      html: jobData.body,
    });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const shouldRetry = errorMessage.includes('rate limit') || 
                       errorMessage.includes('timeout') ||
                       errorMessage.includes('temporary');

    return {
      success: false,
      error: errorMessage,
      shouldRetry,
      retryAfter: shouldRetry ? 60000 : undefined,
    };
  }
}

// Process WhatsApp notification
async function processWhatsApp(jobData: NotificationJob): Promise<NotificationResult> {
  if (!jobData.phone) {
    return {
      success: false,
      error: 'Phone number is required',
      shouldRetry: false,
    };
  }

  try {
    const result = await sendWhatsAppMessage({
      to: jobData.phone,
      body: jobData.body,
    });

    return {
      success: true,
      messageId: result.messageSid,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // WhatsApp API might be temporarily unavailable
    const shouldRetry = errorMessage.includes('rate limit') ||
                       errorMessage.includes('timeout') ||
                       errorMessage.includes('unavailable') ||
                       errorMessage.includes('503');

    return {
      success: false,
      error: errorMessage,
      shouldRetry,
      retryAfter: shouldRetry ? 120000 : undefined,
    };
  }
}

// Create email worker
export const emailWorker = new Worker<NotificationJob>(
  QUEUE_NAMES.EMAIL,
  async (job: Job<NotificationJob>) => {
    const jobData = job.data;

    logger.info('Processing email job:', { jobId: job.id, userId: jobData.userId });

    // Update status to processing
    await updateNotificationStatus(jobData.id, 'PROCESSING', {
      attempts: jobData.attempts + 1,
    });

    const result = await processEmail(jobData);

    if (result.success) {
      await updateNotificationStatus(jobData.id, 'DELIVERED', {
        deliveredAt: new Date(),
      });
      await logNotification(jobData, result);
      logger.info('Email sent successfully:', { jobId: job.id });
    } else {
      await updateNotificationStatus(jobData.id, 'FAILED', {
        lastError: result.error,
        nextRetryAt: result.shouldRetry ? calculateNextRetry(jobData.attempts + 1) : undefined,
      });
      await logNotification(jobData, result);
      logger.error('Email failed:', { jobId: job.id, error: result.error });

      if (result.shouldRetry && jobData.attempts < jobData.maxAttempts) {
        throw new Error(result.error); // Let BullMQ retry
      }
    }

    return result;
  },
  {
    connection: redisConnection,
    concurrency: 5,
    limiter: {
      max: RETRY_CONFIG.RATE_LIMIT_EMAIL,
      duration: 60000, // per minute
    },
  }
);

// Create WhatsApp worker
export const whatsappWorker = new Worker<NotificationJob>(
  QUEUE_NAMES.WHATSAPP,
  async (job: Job<NotificationJob>) => {
    const jobData = job.data;

    logger.info('Processing WhatsApp job:', { jobId: job.id, userId: jobData.userId });

    // Update status to processing
    await updateNotificationStatus(jobData.id, 'PROCESSING', {
      attempts: jobData.attempts + 1,
    });

    const result = await processWhatsApp(jobData);

    if (result.success) {
      await updateNotificationStatus(jobData.id, 'DELIVERED', {
        deliveredAt: new Date(),
      });
      await logNotification(jobData, result);
      logger.info('WhatsApp sent successfully:', { jobId: job.id });
    } else {
      await updateNotificationStatus(jobData.id, 'FAILED', {
        lastError: result.error,
        nextRetryAt: result.shouldRetry ? calculateNextRetry(jobData.attempts + 1) : undefined,
      });
      await logNotification(jobData, result);
      logger.error('WhatsApp failed:', { jobId: job.id, error: result.error });

      // Trigger fallback to email after max retries or non-retryable error
      if (jobData.attempts >= jobData.maxAttempts - 1 || !result.shouldRetry) {
        if (jobData.email && jobData.fallbackChannel !== 'EMAIL') {
          logger.info('Triggering fallback to email:', { jobId: job.id });
          await queueFallbackNotification(jobData, 'EMAIL');
        }
      }

      if (result.shouldRetry && jobData.attempts < jobData.maxAttempts) {
        throw new Error(result.error); // Let BullMQ retry
      }
    }

    return result;
  },
  {
    connection: redisConnection,
    concurrency: 3,
    limiter: {
      max: RETRY_CONFIG.RATE_LIMIT_WHATSAPP,
      duration: 60000, // per minute
    },
  }
);

// Create fallback worker
export const fallbackWorker = new Worker<NotificationJob>(
  QUEUE_NAMES.FALLBACK,
  async (job: Job<NotificationJob>) => {
    const jobData = job.data;

    logger.info('Processing fallback job:', { 
      jobId: job.id, 
      userId: jobData.userId, 
      channel: jobData.channel 
    });

    let result: NotificationResult;

    if (jobData.channel === 'EMAIL') {
      result = await processEmail(jobData);
    } else if (jobData.channel === 'WHATSAPP') {
      result = await processWhatsApp(jobData);
    } else {
      result = {
        success: false,
        error: `Unsupported fallback channel: ${jobData.channel}`,
        shouldRetry: false,
      };
    }

    if (result.success) {
      await logNotification(jobData, result, true);
      logger.info('Fallback notification sent successfully:', { jobId: job.id });
    } else {
      await logNotification(jobData, result, true);
      logger.error('Fallback notification failed:', { jobId: job.id, error: result.error });
    }

    return result;
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

// Worker event handlers
emailWorker.on('completed', (job: Job<NotificationJob>) => {
  logger.info('Email job completed:', { jobId: job.id });
});

emailWorker.on('failed', (job: Job<NotificationJob> | undefined, error: Error) => {
  logger.error('Email job failed:', { jobId: job?.id, error: error.message });
});

whatsappWorker.on('completed', (job: Job<NotificationJob>) => {
  logger.info('WhatsApp job completed:', { jobId: job.id });
});

whatsappWorker.on('failed', (job: Job<NotificationJob> | undefined, error: Error) => {
  logger.error('WhatsApp job failed:', { jobId: job?.id, error: error.message });
});

fallbackWorker.on('completed', (job: Job<NotificationJob>) => {
  logger.info('Fallback job completed:', { jobId: job.id });
});

fallbackWorker.on('failed', (job: Job<NotificationJob> | undefined, error: Error) => {
  logger.error('Fallback job failed:', { jobId: job?.id, error: error.message });
});

/**
 * Close all worker connections
 */
export async function closeWorkers(): Promise<void> {
  await Promise.all([
    emailWorker.close(),
    whatsappWorker.close(),
    fallbackWorker.close(),
  ]);
}
