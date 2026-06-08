import winston from 'winston';
import { loggerConfig } from './config';

// Create the default logger instance
const logger = winston.createLogger(loggerConfig);

// Child logger factory for contextual logging
export function createChildLogger(meta: Record<string, unknown>): winston.Logger {
  return logger.child(meta);
}

// Pre-configured loggers for common contexts
export const loggers = {
  // API request logging
  api: createChildLogger({ context: 'api' }),

  // Authentication logging
  auth: createChildLogger({ context: 'auth' }),

  // Database operations
  db: createChildLogger({ context: 'database' }),

  // AI processing pipeline
  ai: createChildLogger({ context: 'ai' }),

  // Job scraping
  scraping: createChildLogger({ context: 'scraping' }),

  // Email notifications
  email: createChildLogger({ context: 'email' }),

  // TensorFlow operations
  tensorflow: createChildLogger({ context: 'tensorflow' }),

  // General application logging
  app: createChildLogger({ context: 'application' }),
};

// Re-export the default logger
export default logger;

// Convenience re-exports from winston
export { winston };
