/**
 * CSRF Protection Middleware
 * 
 * Protects against Cross-Site Request Forgery attacks
 * Requires CSRF token for all state-changing operations (POST, PUT, DELETE, PATCH)
 * 
 * Usage:
 * 1. GET /api/csrf-token to obtain token
 * 2. Include token in X-CSRF-Token header or _csrf body field
 */

import csrf from 'csurf';
import { Express, Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// CSRF protection middleware (session-based)
export const csrfProtection = csrf({
  cookie: false, // Use session instead of cookies
  sessionKey: 'session',
});

/**
 * Register CSRF routes and apply protection
 */
export function setupCsrfProtection(app: Express) {
  /**
   * Endpoint to get CSRF token
   * Frontend should call this on app initialization
   */
  app.get('/api/csrf-token', csrfProtection, (req: Request, res: Response) => {
    const token = req.csrfToken();
    logger.debug('csrf', 'CSRF token generated', {
      sessionId: req.sessionID,
      userId: (req.session as any)?.userId,
    });
    res.json({ csrfToken: token });
  });

  /**
   * Custom error handler for CSRF token validation failures
   */
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err.code === 'EBADCSRFTOKEN') {
      logger.warn('csrf', 'CSRF token validation failed', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userId: (req.session as any)?.userId,
      });

      res.status(403).json({
        error: 'Invalid or missing CSRF token',
        message: 'Недействительный или отсутствующий CSRF токен. Обновите страницу.',
        code: 'CSRF_TOKEN_INVALID',
      });
      return;
    }
    next(err);
  });

  logger.info('csrf', 'CSRF protection initialized', {
    tokenEndpoint: '/api/csrf-token',
    sessionBased: true,
  });
}

/**
 * Conditional CSRF protection
 * Skip CSRF for GET, HEAD, OPTIONS (safe methods)
 * Apply to POST, PUT, DELETE, PATCH (state-changing methods)
 */
export const conditionalCsrfProtection = (req: Request, res: Response, next: NextFunction) => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  
  if (safeMethods.includes(req.method)) {
    // Skip CSRF for safe methods
    return next();
  }

  // Apply CSRF protection for unsafe methods
  return csrfProtection(req, res, next);
};

/**
 * Development mode: Skip CSRF in development
 * WARNING: Only use in development! Never in production!
 */
export const csrfDevSkip = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_CSRF === '1') {
    logger.warn('csrf', 'CSRF protection SKIPPED (development mode)', {
      path: req.path,
      method: req.method,
    });
    return next();
  }
  return csrfProtection(req, res, next);
};
