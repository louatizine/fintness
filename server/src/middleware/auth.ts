import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';

export interface AuthPayload { userId: string; email: string; }

declare global {
  namespace Express {
    interface Request { user?: AuthPayload; }
  }
}

function readPayload(header: string | undefined): AuthPayload | null {
  if (!header?.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), process.env.JWT_SECRET!) as AuthPayload;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const payload = readPayload(req.headers.authorization);
  if (!payload) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  req.user = payload;
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const payload = readPayload(req.headers.authorization);
  if (payload) req.user = payload;
  next();
}

export async function requireCoach(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId || !/^[a-fA-F0-9]{24}$/.test(userId)) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }
    const user = await getDb().collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user || user.role !== 'coach') {
      res.status(403).json({ error: 'Coach role required' });
      return;
    }
    next();
  } catch (err) {
    console.error('requireCoach error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
