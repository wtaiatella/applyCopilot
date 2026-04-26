import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import {
  sendInterviewAlert,
  sendDeadlineAlert,
  sendOfferAlert,
  sendStatusChangeAlert,
} from '@/lib/notification';
import { authOptions } from '@/lib/auth/config';
import logger from '@/lib/logging/logger';

// Schema for sending WhatsApp alert
const alertSchema = z.object({
  alertType: z.enum(['INTERVIEW_SCHEDULED', 'DEADLINE_REMINDER', 'OFFER_RECEIVED', 'STATUS_CHANGE']),
  jobTitle: z.string().min(1),
  company: z.string().min(1),
  datetime: z.string().optional(),
  deadline: z.string().optional(),
  newStatus: z.string().optional(),
  actionUrl: z.string().url().optional(),
});

/**
 * POST /api/notifications/whatsapp-alerts
 * Send WhatsApp critical alert
 * Requires authentication
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Parse and validate request body
    const body = await request.json();
    const validation = alertSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { alertType, jobTitle, company, datetime, deadline, newStatus, actionUrl } =
      validation.data;

    let result: { success: boolean; error?: string };

    // Send appropriate alert based on type
    switch (alertType) {
      case 'INTERVIEW_SCHEDULED':
        if (!datetime) {
          return NextResponse.json(
            { error: 'datetime is required for interview alerts' },
            { status: 400 }
          );
        }
        result = await sendInterviewAlert(userId, jobTitle, company, datetime, actionUrl);
        break;

      case 'DEADLINE_REMINDER':
        if (!deadline) {
          return NextResponse.json(
            { error: 'deadline is required for deadline alerts' },
            { status: 400 }
          );
        }
        result = await sendDeadlineAlert(userId, jobTitle, company, deadline, actionUrl);
        break;

      case 'OFFER_RECEIVED':
        result = await sendOfferAlert(userId, jobTitle, company, actionUrl);
        break;

      case 'STATUS_CHANGE':
        if (!newStatus) {
          return NextResponse.json(
            { error: 'newStatus is required for status change alerts' },
            { status: 400 }
          );
        }
        result = await sendStatusChangeAlert(userId, jobTitle, company, newStatus, actionUrl);
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid alert type' },
          { status: 400 }
        );
    }

    if (result.success) {
      logger.info('WhatsApp alert sent via API', {
        userId,
        alertType,
        jobTitle,
        company,
      });

      return NextResponse.json(
        { message: 'WhatsApp alert sent successfully' },
        { status: 200 }
      );
    } else {
      logger.warn('WhatsApp alert failed via API', {
        userId,
        alertType,
        error: result.error,
      });

      return NextResponse.json(
        { error: result.error || 'Failed to send WhatsApp alert' },
        { status: 400 }
      );
    }
  } catch (error) {
    logger.error('WhatsApp alert API error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/notifications/whatsapp-alerts
 * Get WhatsApp alert configuration status
 */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Import prisma here to avoid circular dependency
    const { prisma } = await import('@/lib/db');

    // Get user's WhatsApp notification preferences
    const prefs = await prisma.userNotificationPreferences.findUnique({
      where: { userId },
    });

    return NextResponse.json(
      {
        whatsappEnabled: prefs?.whatsappEnabled || false,
        whatsappNumber: prefs?.whatsappNumber || null,
        notifyOnInterviewScheduled: prefs?.notifyOnInterviewScheduled ?? true,
        notifyOnDeadline: prefs?.notifyOnDeadline ?? true,
        supportedAlertTypes: [
          'INTERVIEW_SCHEDULED',
          'DEADLINE_REMINDER',
          'OFFER_RECEIVED',
          'STATUS_CHANGE',
        ],
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Get WhatsApp status error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
