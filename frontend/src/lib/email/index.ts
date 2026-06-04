// Email Service Layer
// Task T027: Create email service layer in frontend/src/lib/email/
// Combines Resend (email) and Twilio (WhatsApp) services

// Resend exports
export {
  resend,
  isResendConfigured,
  sendEmail,
  sendBatchEmails,
  verifyDomain,
} from './resend';

export type {
  EmailTemplate,
  SendEmailRequest,
  SendEmailResponse,
} from './resend';

// Twilio exports
export {
  twilioClient,
  isTwilioConfigured,
  sendWhatsAppMessage,
  sendCriticalAlert,
  formatWhatsAppNumber,
} from './twilio';

export type {
  WhatsAppMessage,
  WhatsAppResponse,
} from './twilio';

// Email templates
export * from './templates';

import { loggers } from '@/lib/logging';
import { sendEmail, SendEmailRequest, isResendConfigured } from './resend';
import { sendWhatsAppMessage, WhatsAppMessage, isTwilioConfigured } from './twilio';

// Notification preferences type
export interface NotificationPreferences {
  email: boolean;
  whatsapp: boolean;
  jobAlerts: boolean;
  applicationUpdates: boolean;
  marketingEmails: boolean;
}

// Send notification through preferred channels
export async function sendNotification(
  userId: string,
  preferences: NotificationPreferences,
  emailData: SendEmailRequest,
  whatsappData?: Omit<WhatsAppMessage, 'to'>,
  phoneNumber?: string
): Promise<{ email?: boolean; whatsapp?: boolean; errors: string[] }> {
  const results: { email?: boolean; whatsapp?: boolean; errors: string[] } = {
    errors: [],
  };

  // Send email if enabled
  if (preferences.email) {
    const emailResult = await sendEmail(emailData);
    if (emailResult.success) {
      results.email = true;
    } else {
      results.errors.push(`Email failed: ${emailResult.error}`);
    }
  }

  // Send WhatsApp if enabled and phone number provided
  if (preferences.whatsapp && whatsappData && phoneNumber) {
    const waResult = await sendWhatsAppMessage({
      ...whatsappData,
      to: phoneNumber,
    });
    if (waResult.success) {
      results.whatsapp = true;
    } else {
      results.errors.push(`WhatsApp failed: ${waResult.error}`);
    }
  }

  loggers.email.info('Notification sent', {
    userId,
    email: results.email,
    whatsapp: results.whatsapp,
    errors: results.errors.length,
  });

  return results;
}

// Check overall notification service health
export function checkNotificationHealth(): {
  email: boolean;
  whatsapp: boolean;
} {
  return {
    email: isResendConfigured(),
    whatsapp: isTwilioConfigured(),
  };
}
