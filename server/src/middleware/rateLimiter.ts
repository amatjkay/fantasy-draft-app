/**
 * Rate Limiting Middleware
 * 
 * Protects API endpoints from abuse and DDoS attacks
 * 
 * Limits:
 * - General API: 100 requests/min per IP
 * - Draft picks: 20 picks/min per user (prevents spam)
 * - Login attempts: 5 attempts/15min per IP (brute force protection)
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

/**
 * General API rate limiter
 * Applied to all /api/* routes
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '1 minute',
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    logger.warn('rate-limit', 'API rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    res.status(429).json({
      error: 'Превышен лимит запросов. Попробуйте снова через 1 минуту.',
      retryAfter: 60,
    });
  },
});

/**
 * Draft pick rate limiter
 * Applied to /api/draft/pick endpoint
 * Prevents users from spamming picks
 * 
 * Note: Only rate-limits authenticated users by userId
 * Unauthenticated requests are skipped (they fail auth anyway)
 */
export const pickLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 picks per minute (generous for normal use)
  keyGenerator: (req: Request) => {
    // ONLY rate limit by userId (no IP fallback to avoid IPv6 issues)
    const userId = (req.session as any)?.userId;
    if (!userId) {
      // This should never happen due to skip(), but just in case
      return 'unauthenticated';
    }
    return `user-${userId}`;
  },
  skip: (req: Request) => {
    // Skip rate limiting for unauthenticated requests
    // They will be rejected by auth middleware anyway
    return !(req.session as any)?.userId;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many pick attempts, please slow down.',
    retryAfter: '1 minute',
  },
  handler: (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    logger.warn('rate-limit', 'Pick rate limit exceeded', {
      userId,
      path: req.path,
    });
    res.status(429).json({
      error: 'Слишком много попыток выбора игроков. Пожалуйста, подождите.',
      retryAfter: 60,
    });
  },
});

/**
 * Login rate limiter
 * Applied to /api/auth/login and /api/auth/register
 * Prevents brute force attacks
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  skipSuccessfulRequests: true, // Don't count successful logins
  // Use default IP-based rate limiting (handles IPv6 correctly)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts, please try again later.',
    retryAfter: '15 minutes',
  },
  handler: (req: Request, res: Response) => {
    logger.warn('rate-limit', 'Auth rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      body: { login: req.body?.login }, // Log attempted username (not password!)
    });
    res.status(429).json({
      error: 'Слишком много попыток входа. Попробуйте снова через 15 минут.',
      retryAfter: 900,
    });
  },
});

/**
 * Strict rate limiter for sensitive operations
 * Can be applied to admin endpoints
 */
export const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Only 10 requests per minute
  message: {
    error: 'Too many requests to sensitive endpoint.',
    retryAfter: '1 minute',
  },
  handler: (req: Request, res: Response) => {
    logger.error('rate-limit', 'Strict rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userId: (req.session as any)?.userId,
    });
    res.status(429).json({
      error: 'Превышен лимит запросов к чувствительным операциям.',
      retryAfter: 60,
    });
  },
});

logger.info('rate-limiter', 'Rate limiting middleware initialized', {
  limits: {
    api: '100 req/min per IP',
    picks: '20 picks/min per user',
    auth: '5 attempts/15min per IP',
    strict: '10 req/min per IP',
  },
});
