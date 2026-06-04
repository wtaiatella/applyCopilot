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
      'email.bounced': 'BOUNCED',
      'email.complained': 'COMPLAINED',
    };

    const status = statusMap[type];

    if (status) {
      const user = await prisma.user.findUnique({
        where: { email: data.to[0] }
      });

      if (user) {
        await prisma.notificationLog.create({
          data: {
            userId: user.id,
            type: 'WELCOME', // Fallback default NotificationType
            channel: 'EMAIL',
            status: status as any,
            recipient: data.to[0] || user.email,
            bodyPreview: `Webhook status update: ${type}`,
            providerMessageId: data.email_id || null,
            providerResponse: data as any,
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
