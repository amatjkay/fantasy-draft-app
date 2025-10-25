/**
 * Structured Logger Utility
 * 
 * Provides consistent logging format with context and levels.
 * Set LOG_LEVEL env var: debug, info, warn, error (default: info)
 * Set ENABLE_FILE_LOGGING=1 to enable file output (production)
 * Set LOG_DIR to customize log directory (default: ./logs)
 */

import * as fs from 'fs';
import * as path from 'path';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
const currentLevelValue = LOG_LEVELS[currentLevel] || LOG_LEVELS.info;

// File logging configuration
const ENABLE_FILE_LOGGING = process.env.ENABLE_FILE_LOGGING === '1' || process.env.NODE_ENV === 'production';
const LOG_DIR = process.env.LOG_DIR || './logs';
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

// Create logs directory if it doesn't exist
if (ENABLE_FILE_LOGGING && !fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Log file streams
let errorLogStream: fs.WriteStream | null = null;
let combinedLogStream: fs.WriteStream | null = null;

if (ENABLE_FILE_LOGGING) {
  const errorLogPath = path.join(LOG_DIR, 'error.log');
  const combinedLogPath = path.join(LOG_DIR, 'combined.log');

  // Check file sizes and rotate if needed
  const rotateIfNeeded = (filePath: string) => {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > MAX_LOG_SIZE) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedPath = filePath.replace('.log', `-${timestamp}.log`);
        fs.renameSync(filePath, rotatedPath);
      }
    }
  };

  rotateIfNeeded(errorLogPath);
  rotateIfNeeded(combinedLogPath);

  errorLogStream = fs.createWriteStream(errorLogPath, { flags: 'a' });
  combinedLogStream = fs.createWriteStream(combinedLogPath, { flags: 'a' });
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= currentLevelValue;
}

function formatMessage(level: LogLevel, module: string, message: string, context?: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}${contextStr}`;
}

function writeToFile(level: LogLevel, formattedMessage: string) {
  if (!ENABLE_FILE_LOGGING) return;

  const logLine = formattedMessage + '\n';

  // Write to combined log
  if (combinedLogStream) {
    combinedLogStream.write(logLine);
  }

  // Write errors to error log
  if (level === 'error' && errorLogStream) {
    errorLogStream.write(logLine);
  }
}

export const logger = {
  debug(module: string, message: string, context?: Record<string, any>) {
    if (shouldLog('debug')) {
      const msg = formatMessage('debug', module, message, context);
      console.log(msg);
      writeToFile('debug', msg);
    }
  },

  info(module: string, message: string, context?: Record<string, any>) {
    if (shouldLog('info')) {
      const msg = formatMessage('info', module, message, context);
      console.log(msg);
      writeToFile('info', msg);
    }
  },

  warn(module: string, message: string, context?: Record<string, any>) {
    if (shouldLog('warn')) {
      const msg = formatMessage('warn', module, message, context);
      console.warn(msg);
      writeToFile('warn', msg);
    }
  },

  error(module: string, message: string, context?: Record<string, any>) {
    if (shouldLog('error')) {
      const msg = formatMessage('error', module, message, context);
      console.error(msg);
      writeToFile('error', msg);
    }
  },

  // Specialized loggers for common use cases
  timer: {
    tick(roomId: string, activeUserId: string, remainingMs: number) {
      logger.debug('timer', 'Timer tick', { roomId, activeUserId, remainingMs });
    },

    expired(roomId: string, activeUserId: string) {
      logger.info('timer', 'Timer expired, triggering autopick', { roomId, activeUserId });
    },
  },

  autopick: {
    success(roomId: string, userId: string, playerId: string, points: number) {
      logger.info('autopick', 'Autopick successful', { roomId, userId, playerId, points });
    },

    failed(roomId: string, userId: string, reason: string) {
      logger.error('autopick', 'Autopick failed', { roomId, userId, reason });
    },

    noEligible(roomId: string, userId: string) {
      logger.warn('autopick', 'No eligible players for autopick', { roomId, userId });
    },
  },

  draft: {
    started(roomId: string, pickOrder: string[], timerSec: number) {
      logger.info('draft', 'Draft started', { roomId, participants: pickOrder.length, timerSec });
    },

    pick(roomId: string, userId: string, playerId: string, autopick: boolean) {
      logger.info('draft', 'Player picked', { roomId, userId, playerId, autopick });
    },

    restored(roomId: string, picksRestored: number) {
      logger.info('draft', 'Draft restored from persistence', { roomId, picksRestored });
    },
  },

  persistence: {
    saved(type: 'room' | 'pick', id: string) {
      logger.debug('persistence', `${type} saved`, { type, id });
    },

    error(operation: string, error: Error) {
      logger.error('persistence', `Persistence error: ${operation}`, { error: error.message });
    },
  },
};
