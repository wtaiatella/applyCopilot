// WhatsApp Critical Alerts Service
// Task T032: Create WhatsApp notification service for critical alerts
// Handles interview scheduling, deadline reminders, and other critical events

import { sendWhatsAppMessage, formatWhatsAppNumber, WhatsAppResponse } from '@/lib/email/twilio';
import { prisma } from '@/lib/db';
import logger from '@/lib/logging/logger';

// Types of critical alerts
export type CriticalAlertType = 'INTERVIEW_SCHEDULED' | 'DEADLINE_REMINDER' | 'OFFER_RECEIVED' | 'STATUS_CHANGE';

interface AlertTemplate {
  emoji: string;
  title: string;
  priority: 'high' | 'urgent';
}

const alertTemplates: Record<CriticalAlertType, AlertTemplate> = {
  INTERVIEW_SCHEDULED: {
    emoji: '🗓️',
    title: 'Interview Scheduled',
    priority: 'urgent',
  },
  DEADLINE_REMINDER: {
    emoji: '⏰',
    title: 'Deadline Approaching',
    priority: 'high',
  },
  OFFER_RECEIVED: {
    emoji: '🎉',
    title: 'Job Offer Received!',
    priority: 'urgent',
  },
  STATUS_CHANGE: {
    emoji: '📊',
    title: 'Application Update',
    priority: 'high',
  },
};

/**
 * Send critical alert via WhatsApp
 * Respects user notification preferences
 */
export async function sendCriticalWhatsAppAlert(
  userId: string,
  alertType: CriticalAlertType,
  message: string,
  details?: {
    jobTitle?: string;
    company?: string;
    datetime?: string;
    deadline?: string;
    actionUrl?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get user with notification preferences
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { notificationPreferences: true },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const prefs = user.notificationPreferences;

    // Check if WhatsApp is enabled for this user
    if (!prefs?.whatsappEnabled || !prefs?.whatsappNumber) {
      logger.info('WhatsApp alert skipped - not enabled or no number', {
        userId,
        alertType,
      });
      return {
        success: false,
        error: 'WhatsApp not enabled or phone number not set',
      };
    }

    // Check if this alert type is enabled
    if (!shouldSendAlert(prefs, alertType)) {
      logger.info('WhatsApp alert skipped - user disabled this alert type', {
        userId,
        alertType,
      });
      return { success: false, error: 'Alert type disabled by user' };
    }

    // Format phone number
    const formattedPhone = formatWhatsAppNumber(prefs.whatsappNumber);

    // Build alert message
    const template = alertTemplates[alertType];
    const body = buildAlertMessage(template, message, details);

    // Send WhatsApp message
    const result = await sendWhatsAppMessage({
      to: formattedPhone,
      body,
    });

    if (result.success) {
      logger.info('Critical WhatsApp alert sent', {
        userId,
        alertType,
        messageSid: result.messageSid,
      });

      // Log to notification log for tracking
      // Map CriticalAlertType to Prisma NotificationType
      const notificationType = mapAlertTypeToNotificationType(alertType);
      await prisma.notificationLog.create({
        data: {
          userId,
          type: notificationType,
          channel: 'WHATSAPP',
          status: 'SENT',
          recipient: formattedPhone,
          bodyPreview: body.substring(0, 200),
          providerMessageId: result.messageSid,
        },
      });
    } else {
      logger.error('Failed to send WhatsApp alert', {
        userId,
        alertType,
        error: result.error,
      });
    }

    return {
      success: result.success,
      error: result.error,
    };
  } catch (error) {
    logger.error('WhatsApp alert service error', {
      userId,
      alertType,
      error: (error as Error).message,
    });
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Map CriticalAlertType to Prisma NotificationType
 */
function mapAlertTypeToNotificationType(
  alertType: CriticalAlertType
): 'INTERVIEW_SCHEDULED' | 'DEADLINE_REMINDER' | 'JOB_MATCH' | 'APPLICATION_STATUS' {
  switch (alertType) {
    case 'INTERVIEW_SCHEDULED':
      return 'INTERVIEW_SCHEDULED';
    case 'DEADLINE_REMINDER':
      return 'DEADLINE_REMINDER';
    case 'OFFER_RECEIVED':
    case 'STATUS_CHANGE':
      return 'APPLICATION_STATUS';
    default:
      return 'JOB_MATCH';
  }
}

/**
 * Check if alert should be sent based on user preferences
 */
function shouldSendAlert(
  prefs: {
    notifyOnInterviewScheduled?: boolean;
    notifyOnDeadline?: boolean;
  },
  alertType: CriticalAlertType
): boolean {
  switch (alertType) {
    case 'INTERVIEW_SCHEDULED':
      return prefs.notifyOnInterviewScheduled !== false; // default true
    case 'DEADLINE_REMINDER':
      return prefs.notifyOnDeadline !== false; // default true
    case 'OFFER_RECEIVED':
    case 'STATUS_CHANGE':
      return true; // Always send these critical alerts
    default:
      return true;
  }
}

/**
 * Build formatted alert message for WhatsApp
 */
function buildAlertMessage(
  template: AlertTemplate,
  message: string,
  details?: {
    jobTitle?: string;
    company?: string;
    datetime?: string;
    deadline?: string;
    actionUrl?: string;
  }
): string {
  const lines: string[] = [
    `${template.emoji} *${template.title}*`,
    '',
    message,
  ];

  if (details?.jobTitle && details?.company) {
    lines.push('', `📍 *Position:* ${details.jobTitle} at ${details.company}`);
  }

  if (details?.datetime) {
    lines.push('', `📅 *When:* ${details.datetime}`);
  }

  if (details?.deadline) {
    lines.push('', `⏰ *Deadline:* ${details.deadline}`);
  }

  if (details?.actionUrl) {
    lines.push('', `🔗 *View details:* ${details.actionUrl}`);
  }

  lines.push('', '---', '_ApplyCopilot System_');

  return lines.join('\n');
}

/**
 * Send interview scheduled alert
 */
export async function sendInterviewAlert(
  userId: string,
  jobTitle: string,
  company: string,
  interviewDateTime: string,
  actionUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const message = `Your interview has been scheduled! Time to prepare and ace it! 💪`;

  return sendCriticalWhatsAppAlert(userId, 'INTERVIEW_SCHEDULED', message, {
    jobTitle,
    company,
    datetime: interviewDateTime,
    actionUrl,
  });
}

/**
 * Send deadline reminder alert
 */
export async function sendDeadlineAlert(
  userId: string,
  jobTitle: string,
  company: string,
  deadline: string,
  actionUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const message = `Don't miss the deadline for this opportunity!`;

  return sendCriticalWhatsAppAlert(userId, 'DEADLINE_REMINDER', message, {
    jobTitle,
    company,
    deadline,
    actionUrl,
  });
}

/**
 * Send job offer received alert
 */
export async function sendOfferAlert(
  userId: string,
  jobTitle: string,
  company: string,
  actionUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const message = `Congratulations! You've received a job offer! This is a major milestone in your job search. 🎊`;

  return sendCriticalWhatsAppAlert(userId, 'OFFER_RECEIVED', message, {
    jobTitle,
    company,
    actionUrl,
  });
}

/**
 * Send application status change alert
 */
export async function sendStatusChangeAlert(
  userId: string,
  jobTitle: string,
  company: string,
  newStatus: string,
  actionUrl?: string
): Promise<{ success: boolean; error?: string }> {
  const message = `Your application status has been updated to: *${newStatus}*`;

  return sendCriticalWhatsAppAlert(userId, 'STATUS_CHANGE', message, {
    jobTitle,
    company,
    actionUrl,
  });
}

/**
 * Bulk send critical alert to multiple users
 * Returns summary of successes and failures
 */
export async function sendBulkCriticalAlert(
  userIds: string[],
  alertType: CriticalAlertType,
  message: string
): Promise<{
  total: number;
  sent: number;
  failed: number;
  errors: Array<{ userId: string; error: string }>;
}> {
  const results = {
    total: userIds.length,
    sent: 0,
    failed: 0,
    errors: [] as Array<{ userId: string; error: string }>,
  };

  // Send in parallel with rate limiting
  const promises = userIds.map(async (userId) => {
    const result = await sendCriticalWhatsAppAlert(userId, alertType, message);
    return { userId, result };
  });

  const settled = await Promise.allSettled(promises);

  settled.forEach((settledResult) => {
    if (settledResult.status === 'fulfilled') {
      const { userId, result } = settledResult.value;
      if (result.success) {
        results.sent++;
      } else {
        results.failed++;
        results.errors.push({ userId, error: result.error || 'Unknown error' });
      }
    } else {
      results.failed++;
      results.errors.push({
        userId: 'unknown',
        error: settledResult.reason?.message || 'Promise rejected',
      });
    }
  });

  logger.info('Bulk WhatsApp alert completed', {
    alertType,
    ...results,
  });

  return results;
}
