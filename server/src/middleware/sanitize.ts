/**
 * Input Sanitization Middleware
 * 
 * Protects against XSS, SQL injection, and other injection attacks
 * Sanitizes all user inputs in req.body, req.query, req.params
 * 
 * Features:
 * - HTML escape to prevent XSS
 * - Trim whitespace
 * - Normalize unicode characters
 * - Remove null bytes
 */

import validator from 'validator';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Recursively sanitize an object
 * Handles strings, arrays, and nested objects
 */
function sanitizeValue(value: any, depth = 0): any {
  // Prevent deep recursion attacks
  if (depth > 10) {
    logger.warn('sanitize', 'Max sanitization depth exceeded', { depth });
    return value;
  }

  // Handle null/undefined
  if (value === null || value === undefined) {
    return value;
  }

  // Handle strings
  if (typeof value === 'string') {
    // Remove null bytes (potential SQLi/path traversal)
    let sanitized = value.replace(/\0/g, '');
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Normalize unicode (prevent homograph attacks)
    sanitized = sanitized.normalize('NFKC');
    
    // HTML escape (prevent XSS)
    // Note: validator.escape() converts < > & " ' to HTML entities
    sanitized = validator.escape(sanitized);
    
    return sanitized;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item, depth + 1));
  }

  // Handle objects
  if (typeof value === 'object') {
    const sanitized: any = {};
    for (const [key, val] of Object.entries(value)) {
      // Also sanitize keys (prevent prototype pollution)
      const sanitizedKey = typeof key === 'string' 
        ? validator.escape(key.trim()) 
        : key;
      
      // Skip __proto__, constructor, prototype to prevent prototype pollution
      if (['__proto__', 'constructor', 'prototype'].includes(sanitizedKey)) {
        logger.warn('sanitize', 'Blocked prototype pollution attempt', { key });
        continue;
      }
      
      sanitized[sanitizedKey] = sanitizeValue(val, depth + 1);
    }
    return sanitized;
  }

  // Return other types unchanged (numbers, booleans, etc.)
  return value;
}

/**
 * Main sanitization middleware
 * Automatically sanitizes req.body, req.query, req.params
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  // Skip sanitization for Socket.IO requests (they use binary protocol)
  if (req.path.startsWith('/socket.io')) {
    return next();
  }

  try {
    // Track if anything was sanitized for logging
    let sanitizedCount = 0;

    // Sanitize body
    if (req.body && typeof req.body === 'object') {
      const originalBody = JSON.stringify(req.body);
      req.body = sanitizeValue(req.body);
      if (JSON.stringify(req.body) !== originalBody) {
        sanitizedCount++;
      }
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      const originalQuery = JSON.stringify(req.query);
      req.query = sanitizeValue(req.query);
      if (JSON.stringify(req.query) !== originalQuery) {
        sanitizedCount++;
      }
    }

    // Sanitize URL parameters
    if (req.params && typeof req.params === 'object') {
      const originalParams = JSON.stringify(req.params);
      req.params = sanitizeValue(req.params);
      if (JSON.stringify(req.params) !== originalParams) {
        sanitizedCount++;
      }
    }

    // Log if sanitization occurred
    if (sanitizedCount > 0) {
      logger.debug('sanitize', 'Input sanitized', {
        method: req.method,
        path: req.path,
        sanitizedParts: sanitizedCount,
      });
    }

    next();
  } catch (err) {
    logger.error('sanitize', 'Sanitization error', {
      error: err instanceof Error ? err.message : String(err),
      path: req.path,
    });
    // Don't block the request on sanitization errors
    next();
  }
}

/**
 * Validate and sanitize specific fields
 * Use for custom validation logic beyond general sanitization
 */
export function validateField(value: string, fieldName: string, options: {
  minLength?: number;
  maxLength?: number;
  alphanumeric?: boolean;
  email?: boolean;
  url?: boolean;
}): { valid: boolean; sanitized: string; error?: string } {
  // First sanitize
  let sanitized = sanitizeValue(value);

  // Length validation
  if (options.minLength && sanitized.length < options.minLength) {
    return {
      valid: false,
      sanitized,
      error: `${fieldName} must be at least ${options.minLength} characters`,
    };
  }

  if (options.maxLength && sanitized.length > options.maxLength) {
    return {
      valid: false,
      sanitized,
      error: `${fieldName} must be at most ${options.maxLength} characters`,
    };
  }

  // Alphanumeric validation
  if (options.alphanumeric && !validator.isAlphanumeric(sanitized, 'en-US', { ignore: '-_' })) {
    return {
      valid: false,
      sanitized,
      error: `${fieldName} must contain only letters, numbers, hyphens, and underscores`,
    };
  }

  // Email validation
  if (options.email && !validator.isEmail(sanitized)) {
    return {
      valid: false,
      sanitized,
      error: `${fieldName} must be a valid email address`,
    };
  }

  // URL validation
  if (options.url && !validator.isURL(sanitized)) {
    return {
      valid: false,
      sanitized,
      error: `${fieldName} must be a valid URL`,
    };
  }

  return { valid: true, sanitized };
}

logger.info('sanitize', 'Input sanitization middleware initialized', {
  features: ['XSS protection', 'Null byte removal', 'Unicode normalization', 'Prototype pollution prevention'],
});
