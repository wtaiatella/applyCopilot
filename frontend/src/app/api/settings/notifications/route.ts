import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import logger from '@/lib/logging/logger';
import { authOptions } from '@/lib/auth/config';

// Validation schema for notification preferences
const notificationPreferencesSchema = z.object({
  // Channel preferences
  emailEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  whatsappNumber: z.string().optional().nullable(),

  // Frequency settings
  jobMatchFrequency: z.enum(['IMMEDIATE', 'DIGEST', 'DAILY', 'WEEKLY', 'NEVER']).optional(),
  digestDay: z.number().min(0).max(6).optional().nullable(),
  digestTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().nullable(),

  // Notification types
  notifyOnJobMatches: z.boolean().optional(),
  notifyOnApplicationUpdates: z.boolean().optional(),
  notifyOnInterviewScheduled: z.boolean().optional(),
  notifyOnDeadline: z.boolean().optional(),
  notifyOnSecurityAlert: z.boolean().optional(),

  // Quiet hours
  quietHoursStart: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().nullable(),
  quietHoursEnd: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().nullable(),
  timezone: z.string().optional(),
});

/**
 * GET /api/settings/notifications
 * Get user's notification preferences
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

    // Get or create notification preferences
    let prefs = await prisma.userNotificationPreferences.findUnique({
      where: { userId },
    });

    // If no preferences exist, create default ones
    if (!prefs) {
      prefs = await prisma.userNotificationPreferences.create({
        data: {
          userId,
          emailEnabled: true,
          whatsappEnabled: false,
          jobMatchFrequency: 'DIGEST',
          notifyOnJobMatches: true,
          notifyOnApplicationUpdates: true,
          notifyOnInterviewScheduled: true,
          notifyOnDeadline: true,
          notifyOnSecurityAlert: true,
          timezone: 'America/Sao_Paulo',
        },
      });

      logger.info('Created default notification preferences', { userId });
    }

    return NextResponse.json(
      {
        emailEnabled: prefs.emailEnabled,
        whatsappEnabled: prefs.whatsappEnabled,
        whatsappNumber: prefs.whatsappNumber,
        jobMatchFrequency: prefs.jobMatchFrequency,
        digestDay: prefs.digestDay,
        digestTime: prefs.digestTime,
        notifyOnJobMatches: prefs.notifyOnJobMatches,
        notifyOnApplicationUpdates: prefs.notifyOnApplicationUpdates,
        notifyOnInterviewScheduled: prefs.notifyOnInterviewScheduled,
        notifyOnDeadline: prefs.notifyOnDeadline,
        notifyOnSecurityAlert: prefs.notifyOnSecurityAlert,
        quietHoursStart: prefs.quietHoursStart,
        quietHoursEnd: prefs.quietHoursEnd,
        timezone: prefs.timezone,
        updatedAt: prefs.updatedAt,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Get notification preferences error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings/notifications
 * Update user's notification preferences
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
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
    const validation = notificationPreferencesSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const updateData = validation.data;

    // Update or create preferences
    const prefs = await prisma.userNotificationPreferences.upsert({
      where: { userId },
      update: {
        ...updateData,
        updatedAt: new Date(),
      },
      create: {
        userId,
        emailEnabled: true,
        whatsappEnabled: false,
        jobMatchFrequency: 'DIGEST',
        notifyOnJobMatches: true,
        notifyOnApplicationUpdates: true,
        notifyOnInterviewScheduled: true,
        notifyOnDeadline: true,
        notifyOnSecurityAlert: true,
        timezone: 'America/Sao_Paulo',
        ...updateData,
      },
    });

    logger.info('Updated notification preferences', {
      userId,
      updates: Object.keys(updateData),
    });

    return NextResponse.json(
      {
        message: 'Notification preferences updated successfully',
        emailEnabled: prefs.emailEnabled,
        whatsappEnabled: prefs.whatsappEnabled,
        whatsappNumber: prefs.whatsappNumber,
        jobMatchFrequency: prefs.jobMatchFrequency,
        digestDay: prefs.digestDay,
        digestTime: prefs.digestTime,
        notifyOnJobMatches: prefs.notifyOnJobMatches,
        notifyOnApplicationUpdates: prefs.notifyOnApplicationUpdates,
        notifyOnInterviewScheduled: prefs.notifyOnInterviewScheduled,
        notifyOnDeadline: prefs.notifyOnDeadline,
        notifyOnSecurityAlert: prefs.notifyOnSecurityAlert,
        quietHoursStart: prefs.quietHoursStart,
        quietHoursEnd: prefs.quietHoursEnd,
        timezone: prefs.timezone,
        updatedAt: prefs.updatedAt,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Update notification preferences error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/settings/notifications
 * Reset notification preferences to defaults
 */
export async function DELETE(): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Delete existing preferences (will be recreated with defaults on next GET)
    await prisma.userNotificationPreferences.deleteMany({
      where: { userId },
    });

    logger.info('Reset notification preferences', { userId });

    return NextResponse.json(
      { message: 'Notification preferences reset to defaults' },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Reset notification preferences error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
