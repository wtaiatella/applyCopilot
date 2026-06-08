// Twilio WhatsApp Service
// Task T026: Install and configure Twilio WhatsApp Business API
// Task T027: Create email service layer

import twilio from 'twilio';
import { loggers } from '@/lib/logging';

// Twilio configuration
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

// Initialize Twilio client
export const twilioClient = accountSid && authToken
  ? twilio(accountSid, authToken)
  : null;

// Check if Twilio is configured
export function isTwilioConfigured(): boolean {
  return !!twilioClient && !!whatsappNumber;
}

// WhatsApp message interface
export interface WhatsAppMessage {
  to: string; // Format: whatsapp:+1234567890
  body: string;
  mediaUrl?: string[];
}

// Send WhatsApp message response
export interface WhatsAppResponse {
  success: boolean;
  messageSid?: string;
  error?: string;
}

// Send WhatsApp message
export async function sendWhatsAppMessage(message: WhatsAppMessage): Promise<WhatsAppResponse> {
  if (!twilioClient || !whatsappNumber) {
    loggers.email.error('Twilio not configured');
    return {
      success: false,
      error: 'WhatsApp service not configured',
    };
  }

  try {
    const result = await twilioClient.messages.create({
      from: `whatsapp:${whatsappNumber}`,
      to: message.to.startsWith('whatsapp:') ? message.to : `whatsapp:${message.to}`,
      body: message.body,
      mediaUrl: message.mediaUrl,
    });

    loggers.email.info('WhatsApp message sent', {
      messageSid: result.sid,
      to: message.to,
    });

    return {
      success: true,
      messageSid: result.sid,
    };
  } catch (error) {
    loggers.email.error('Failed to send WhatsApp message', {
      error: (error as Error).message,
      to: message.to,
    });
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

// Send critical alert via WhatsApp
export async function sendCriticalAlert(to: string, alert: string): Promise<WhatsAppResponse> {
  return sendWhatsAppMessage({
    to,
    body: `🚨 CRITICAL ALERT\n\n${alert}\n\n- ApplyCopilot System`,
  });
}

// Verify phone number format
export function formatWhatsAppNumber(phone: string): string {
  // Remove non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  // Add country code if missing (assume US/Canada +1)
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  return `+${cleaned}`;
}
