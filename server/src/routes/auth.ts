import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import type { AuthPayload } from '../middleware/auth.js';
import { parseCoachProfile } from '../coachProfile.js';

export const authRouter = Router();

const googleClient = new OAuth2Client();

type UserDoc = {
  _id: ObjectId;
  email: string;
  password?: string;
  googleId?: string;
  name?: string;
  role?: string;
};

function signSession(user: UserDoc) {
  const payload: AuthPayload = { userId: user._id.toString(), email: user.email };
  const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '7d' });
  return {
    token,
    userId: payload.userId,
    role: user.role === 'coach' ? 'coach' as const : 'athlete' as const,
  };
}

function isDuplicateKey(err: unknown) {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function googleAudiences() {
  return [
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ].filter((value): value is string => Boolean(value));
}

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
    res.status(201).json(signSession({ _id: result.insertedId, email, role }));
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
    const user = await db.collection('users').findOne({ email }) as UserDoc | null;
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    if (typeof user.password !== 'string' || !user.password) {
      res.status(401).json({ error: 'This account uses Google sign-in' });
      return;
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    res.json(signSession(user));
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.post('/google', async (req: Request, res: Response) => {
  try {
    const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken.trim() : '';
    if (!idToken) {
      res.status(400).json({ error: 'idToken is required' });
      return;
    }
    const audiences = googleAudiences();
    if (!process.env.GOOGLE_WEB_CLIENT_ID || audiences.length === 0) {
      res.status(500).json({ error: 'Google sign-in is not configured' });
      return;
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: audiences.length === 1 ? audiences[0] : audiences,
      });
      payload = ticket.getPayload();
    } catch (err) {
      console.error('Google token verification failed:', err);
      res.status(401).json({ error: 'Invalid Google token' });
      return;
    }

    const googleId = payload?.sub;
    const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    const emailVerified = payload?.email_verified === true;

    if (!googleId || !email) {
      res.status(401).json({ error: 'Google token is missing email' });
      return;
    }
    if (!emailVerified) {
      res.status(403).json({ error: 'Google email is not verified' });
      return;
    }

    const db = getDb();
    const users = db.collection('users');
    let user = await users.findOne({ googleId }) as UserDoc | null;
    if (!user) {
      user = await users.findOne({ email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') } }) as UserDoc | null;
    }

    if (user) {
      if (user.googleId && user.googleId !== googleId) {
        res.status(409).json({ error: 'This email is already linked to a different Google account' });
        return;
      }
      const updates: Record<string, string> = {};
      if (!user.googleId) updates.googleId = googleId;
      if (name && !user.name) updates.name = name;
      if (typeof user.email === 'string' && user.email.toLowerCase() === email && user.email !== email) updates.email = email;
      if (Object.keys(updates).length > 0) {
        await users.updateOne({ _id: user._id }, { $set: updates });
        user = { ...user, ...updates };
      }
      res.json(signSession(user));
      return;
    }

    try {
      const result = await users.insertOne({
        email,
        googleId,
        ...(name ? { name } : {}),
        weightUnit: 'kg',
        role: 'athlete',
        createdAt: new Date().toISOString(),
      });
      res.status(201).json(signSession({
        _id: result.insertedId,
        email,
        googleId,
        name,
        role: 'athlete',
      }));
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      const existing = await users.findOne({
        $or: [{ googleId }, { email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') } }],
      }) as UserDoc | null;
      if (!existing) throw err;
      res.json(signSession(existing));
    }
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
