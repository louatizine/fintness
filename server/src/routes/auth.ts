import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getDb } from '../db.js';
import type { AuthPayload } from '../middleware/auth.js';
import { parseCoachProfile } from '../coachProfile.js';

export const authRouter = Router();

authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    const role = req.body?.role === 'coach' ? 'coach' : 'athlete';
    let coachProfile: Record<string, unknown> | undefined;
    if (role === 'coach') {
      const parsed = parseCoachProfile((req.body?.coachProfile ?? req.body ?? {}) as Record<string, unknown>, email);
      if (parsed.error || !parsed.profile) {
        res.status(400).json({ error: parsed.error ?? 'Coach profile is required' });
        return;
      }
      coachProfile = parsed.profile;
    }
    const db = getDb();
    const existing = await db.collection('users').findOne({ email });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    const hash = await bcrypt.hash(password, 12);
    const result = await db.collection('users').insertOne({
      email,
      password: hash,
      weightUnit: 'kg',
      role,
      ...(coachProfile ? { coachProfile } : {}),
      createdAt: new Date().toISOString(),
    });
    const payload: AuthPayload = { userId: result.insertedId.toString(), email };
    const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '7d' });
    res.status(201).json({ token, userId: payload.userId, role });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    const db = getDb();
    const user = await db.collection('users').findOne({ email });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const payload: AuthPayload = { userId: user._id.toString(), email };
    const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '7d' });
    res.json({ token, userId: payload.userId, role: user.role === 'coach' ? 'coach' : 'athlete' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
