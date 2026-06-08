import winston from 'winston';
import fs from 'fs';
import path from 'path';

// Log levels
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  VERBOSE = 'verbose',
  DEBUG = 'debug',
  SILLY = 'silly',
}

// Environment-based log level
const getDefaultLogLevel = (): LogLevel => {
  const env = process.env.NODE_ENV;
  const logLevel = process.env.LOG_LEVEL;

  if (logLevel && Object.values(LogLevel).includes(logLevel as LogLevel)) {
    return logLevel as LogLevel;
  }

  switch (env) {
    case 'production':
      return LogLevel.INFO;
    case 'test':
      return LogLevel.ERROR;
    default:
      return LogLevel.DEBUG;
  }
};

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// JSON format for structured logging (files, external services)
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Determine if file logging should be active
const isDebugFileLogging = (): boolean => {
  const logLevel = process.env.LOG_LEVEL;
  return logLevel === 'debug' || logLevel === 'verbose' || logLevel === 'silly';
};

// Create transports array
const createTransports = (): winston.transport[] => {
  const transports: winston.transport[] = [
    // Console transport - always enabled
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ];

  // File transports - in production OR in development with LOG_LEVEL=debug
  if (process.env.NODE_ENV === 'production') {
    transports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: jsonFormat,
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: jsonFormat,
      })
    );
  } else if (isDebugFileLogging()) {
    // Development debug mode: write all logs to session file
    transports.push(
      new winston.transports.File({
        filename: 'debug/combined.log',
        format: jsonFormat,
      }),
      new winston.transports.File({
        filename: 'debug/error.log',
        level: 'error',
        format: jsonFormat,
      })
    );
  }

  return transports;
};

// Default logger configuration
export const loggerConfig = {
  level: getDefaultLogLevel(),
  defaultMeta: {
    service: 'applycopilot',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: createTransports(),
  // Don't exit on error
  exitOnError: false,
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
};

// Create logs directory in production
if (process.env.NODE_ENV === 'production') {
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Create debug/ directory in development when LOG_LEVEL=debug
const debugLevel = process.env.LOG_LEVEL;
if (
  process.env.NODE_ENV !== 'production' &&
  (debugLevel === 'debug' || debugLevel === 'verbose' || debugLevel === 'silly')
) {
  const debugDir = path.join(process.cwd(), 'debug');
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }
}
