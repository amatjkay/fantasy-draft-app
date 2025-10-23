import bcrypt from 'bcrypt';
import { Request, Response, NextFunction } from 'express';
import { dataStore } from './dataStore';

const SALT_ROUNDS = 10;

// ============================================================================
// Password hashing
// ============================================================================

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ============================================================================
// Auth middleware
// ============================================================================

// Расширяем Express Request для включения userId
declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = dataStore.getUser(userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }

  next();
}

// Optional: middleware для получения текущего userId (без обязательной авторизации)
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  // userId будет доступен в req.session.userId если залогинен, иначе undefined
  next();
}
