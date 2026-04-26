// Notification Queue System
// Task T028: Create notification queue system for retry logic

export { 
  emailQueue, 
  whatsappQueue, 
  fallbackQueue,
  queueNotification, 
  queueFallbackNotification,
  calculateNextRetry,
  getQueueStats,
  closeQueues,
} from './queue';

export {
  emailWorker,
  whatsappWorker,
  fallbackWorker,
  closeWorkers,
} from './worker';

export {
  redisConnection,
  QUEUE_NAMES,
  RETRY_CONFIG,
} from './config';

export type {
  NotificationJob,
  NotificationResult,
  NotificationType,
  NotificationChannel,
  QueueStatus,
  FallbackConfig,
  QueueEventType,
} from './types';

export {
  NotificationChannelConst,
  DEFAULT_FALLBACK_CONFIG,
} from './types';
