// Resend Email Service
// Task T025: Install and configure Resend API for email delivery
// Task T027: Create email service layer

import { Resend } from 'resend';
import { loggers } from '@/lib/logging';

// Initialize Resend client
const resendApiKey = process.env.RESEND_API_KEY;

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Check if Resend is configured
export function isResendConfigured(): boolean {
  return !!resend && !!resendApiKey;
}

// Email templates interface
export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// Send email interface
export interface SendEmailRequest {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
  }>;
}

// Send email response
export interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Send email using Resend
export async function sendEmail(request: SendEmailRequest): Promise<SendEmailResponse> {
  if (!resend) {
    loggers.email.error('Resend not configured');
    return {
      success: false,
      error: 'Email service not configured',
    };
  }

  try {
    const fromEmail = request.from || process.env.FROM_EMAIL || 'onboarding@resend.dev';

    // Ensure at least html or text is provided
    if (!request.html && !request.text) {
      return {
        success: false,
        error: 'Either html or text content is required',
      };
    }

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: request.to,
      subject: request.subject,
      html: request.html!,
      text: request.text!,
      replyTo: request.replyTo,
    } as { from: string; to: string | string[]; subject: string; html: string; text?: string; replyTo?: string });

    if (error) {
      loggers.email.error('Failed to send email', { error, to: request.to });
      return {
        success: false,
        error: error.message,
      };
    }

    loggers.email.info('Email sent successfully', {
      messageId: data?.id,
      to: request.to,
      subject: request.subject,
    });

    return {
      success: true,
      messageId: data?.id,
    };
  } catch (error) {
    loggers.email.error('Exception sending email', {
      error: (error as Error).message,
      to: request.to,
    });
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

// Send batch emails
export async function sendBatchEmails(requests: SendEmailRequest[]): Promise<SendEmailResponse[]> {
  return Promise.all(requests.map(sendEmail));
}

// Verify email address (domain verification check)
export async function verifyDomain(domain: string): Promise<boolean> {
  if (!resend) {
    return false;
  }

  try {
    const { data } = await resend.domains.list();
    if (!data || !Array.isArray(data)) return false;
    return data.some((d: { name: string; status: string }) =>
      d.name === domain && d.status === 'verified'
    );
  } catch {
    return false;
  }
}
