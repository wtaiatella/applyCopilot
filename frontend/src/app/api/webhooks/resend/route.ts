import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { loggers } from '@/lib/logging';

export async function POST(request: NextRequest) {
  try {
    // Basic verification - in production you should use svix to verify Resend signatures
    const body = await request.json();
    
    // Resend webhook format usually includes type and data
    const { type, data } = body;
    
    if (!type || !data) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    loggers.email.info('Received Resend Webhook', { type, messageId: data.email_id });

    const statusMap: Record<string, string> = {
      'email.sent': 'SENT',
      'email.delivered': 'DELIVERED',
      'email.bounced': 'FAILED',
      'email.complained': 'FAILED',
    };

    const status = statusMap[type];

    if (status) {
      // Create a notification log entry since we might not have a direct link to the user
      // without looking up the email, or we can just log it if NotificationLog schema supports it.
      // Since NotificationLog in Prisma schema might require a userId, we'll try to find the user.
      const user = await prisma.user.findUnique({
        where: { email: data.to[0] }
      });

      if (user) {
        await prisma.notificationLog.create({
          data: {
            userId: user.id,
            type: 'EMAIL',
            channel: 'EMAIL',
            status: status as any,
            metadata: {
              messageId: data.email_id,
              event: type,
              reason: data.reason || null,
            }
          }
        });
      } else {
        loggers.email.warn('Received webhook for unknown user email', { email: data.to[0] });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    loggers.email.error('Error processing Resend webhook', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
