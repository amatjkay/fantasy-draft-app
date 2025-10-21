/**
 * Structured Logger Utility
 * 
 * Provides consistent logging format with context and levels.
 * Set LOG_LEVEL env var: debug, info, warn, error (default: info)
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
const currentLevelValue = LOG_LEVELS[currentLevel] || LOG_LEVELS.info;

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= currentLevelValue;
}

function formatMessage(level: LogLevel, module: string, message: string, context?: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}${contextStr}`;
}

export const logger = {
  debug(module: string, message: string, context?: Record<string, any>) {
    if (shouldLog('debug')) {
      console.log(formatMessage('debug', module, message, context));
    }
  },

  info(module: string, message: string, context?: Record<string, any>) {
    if (shouldLog('info')) {
      console.log(formatMessage('info', module, message, context));
    }
  },

  warn(module: string, message: string, context?: Record<string, any>) {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', module, message, context));
    }
  },

  error(module: string, message: string, context?: Record<string, any>) {
    if (shouldLog('error')) {
      console.error(formatMessage('error', module, message, context));
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
