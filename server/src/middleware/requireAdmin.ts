import { Request, Response, NextFunction } from 'express';
import { dataStore } from '../dataStore';

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId;
  
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = dataStore.getUser(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}
