import { NotificationType, NotificationChannel, QueueStatus } from '@prisma/client';

export { NotificationType, NotificationChannel, QueueStatus };

export const NotificationChannelConst = {
  EMAIL: 'EMAIL',
  WHATSAPP: 'WHATSAPP',
  SMS: 'SMS',
} as const;

export interface NotificationJob {
  id: string;
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  email?: string;
  phone?: string;
  subject?: string;
  body: string;
  template?: string;
  variables?: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  fallbackChannel?: NotificationChannel;
  scheduledAt?: Date;
  processedAt?: Date;
  deliveredAt?: Date;
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
  shouldRetry?: boolean;
  retryAfter?: number;
}

export interface FallbackConfig {
  primaryChannel: NotificationChannel;
  fallbackChannel: NotificationChannel;
  maxRetriesBeforeFallback: number;
}

export const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  primaryChannel: NotificationChannelConst.WHATSAPP,
  fallbackChannel: NotificationChannelConst.EMAIL,
  maxRetriesBeforeFallback: 2,
};

export type QueueEventType =
  | 'completed'
  | 'failed'
  | 'stalled'
  | 'progress'
  | 'waiting'
  | 'active'
  | 'delayed';
