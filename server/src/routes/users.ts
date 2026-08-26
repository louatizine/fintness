import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { parseCoachProfile } from '../coachProfile.js';
import {
  mergeNotificationPrefsPatch,
  normalizeNotificationPrefs,
  type NotificationPrefs,
} from '../notificationPrefs.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

function asObjectId(value: string): ObjectId | null {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) return null;
  try {
    return new ObjectId(value);
  } catch {
    return null;
  }
}

function asFiniteNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function isExpoPushToken(token: string): boolean {
  return (
    token.startsWith('ExponentPushToken[') ||
    token.startsWith('ExpoPushToken[')
  );
}

function publicProfile(doc: {
  _id: ObjectId;
  email?: string;
  weightUnit?: string;
  weightKg?: number | null;
  createdAt?: string;
  role?: string;
  coachProfile?: {
    displayName?: string;
    bio?: string;
    specialties?: string[];
    certifications?: string;
    contactPreference?: string;
    email?: string;
    phone?: string;
  };
  notificationPrefs?: unknown;
}) {
  const role = doc.role === 'coach' ? 'coach' as const : 'athlete' as const;
  const raw = doc.coachProfile;
  return {
    id: doc._id.toHexString(),
    email: doc.email ?? '',
    weightUnit: doc.weightUnit ?? 'kg',
    weightKg: typeof doc.weightKg === 'number' ? doc.weightKg : null,
    createdAt: doc.createdAt ?? '',
    role,
    coachProfile: role === 'coach' && raw
      ? {
        displayName: raw.displayName ?? '',
        bio: raw.bio ?? '',
        specialties: Array.isArray(raw.specialties) ? raw.specialties : [],
        certifications: raw.certifications ?? '',
        contactPreference: raw.contactPreference === 'email' || raw.contactPreference === 'phone' ? raw.contactPreference : 'app',
        email: raw.email ?? '',
        phone: raw.phone ?? '',
      }
      : null,
    notificationPrefs: normalizeNotificationPrefs(doc.notificationPrefs) as NotificationPrefs,
  };
}

usersRouter.get('/me', async (req: Request, res: Response) => {
  try {
    const id = asObjectId(req.user!.userId);
    if (!id) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const user = await getDb().collection('users').findOne({ _id: id });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(publicProfile(user as typeof user & { _id: ObjectId }));
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

usersRouter.patch('/me', async (req: Request, res: Response) => {
  try {
    const id = asObjectId(req.user!.userId);
    if (!id) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }

    const body = req.body ?? {};
    const hasWeight = body.weightKg !== undefined && body.weightKg !== null && body.weightKg !== '';
    const hasPrefs = body.notificationPrefs !== undefined;
    if (!hasWeight && !hasPrefs) {
      res.status(400).json({ error: 'Provide weightKg and/or notificationPrefs' });
      return;
    }

    const $set: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if (hasWeight) {
      const weightKg = asFiniteNumber(body.weightKg);
      if (weightKg === null || weightKg < 30 || weightKg > 400) {
        res.status(400).json({ error: 'weightKg must be a number between 30 and 400' });
        return;
      }
      $set.weightKg = weightKg;
    }

    if (hasPrefs) {
      const existing = await getDb().collection('users').findOne({ _id: id }, { projection: { notificationPrefs: 1 } });
      if (!existing) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      const merged = mergeNotificationPrefsPatch(existing.notificationPrefs, body.notificationPrefs);
      if (!merged) {
        res.status(400).json({ error: 'Invalid notificationPrefs' });
        return;
      }
      $set.notificationPrefs = merged;
    }

    const result = await getDb().collection('users').findOneAndUpdate(
      { _id: id },
      { $set },
      { returnDocument: 'after' }
    );
    if (!result) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(publicProfile(result as typeof result & { _id: ObjectId }));
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

usersRouter.post('/me/push-token', async (req: Request, res: Response) => {
  try {
    const id = asObjectId(req.user!.userId);
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!id) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    if (!token || !isExpoPushToken(token)) {
      res.status(400).json({ error: 'Invalid Expo push token' });
      return;
    }
    await getDb().collection('users').updateOne(
      { _id: id },
      {
        $addToSet: { expoPushTokens: token },
        $set: { updatedAt: new Date().toISOString() },
      }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Register push token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

usersRouter.delete('/me/push-token', async (req: Request, res: Response) => {
  try {
    const id = asObjectId(req.user!.userId);
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!id) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    if (!token) {
      res.status(400).json({ error: 'token is required' });
      return;
    }
    await getDb().collection('users').updateOne(
      { _id: id },
      {
        $pull: { expoPushTokens: token },
        $set: { updatedAt: new Date().toISOString() },
      } as object
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Unregister push token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

usersRouter.post('/become-coach', async (req: Request, res: Response) => {
  try {
    const id = asObjectId(req.user!.userId);
    if (!id) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const user = await getDb().collection('users').findOne({ _id: id });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (user.role !== 'coach') {
      res.status(403).json({ error: 'Create a coach account at sign up to list as a coach' });
      return;
    }
    const parsed = parseCoachProfile((req.body ?? {}) as Record<string, unknown>, user.email ?? '');
    if (parsed.error || !parsed.profile) {
      res.status(400).json({ error: parsed.error ?? 'Invalid coach profile' });
      return;
    }
    const result = await getDb().collection('users').findOneAndUpdate(
      { _id: id },
      { $set: { coachProfile: parsed.profile, updatedAt: new Date().toISOString() } },
      { returnDocument: 'after' }
    );
    if (!result) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(publicProfile(result as typeof result & { _id: ObjectId }));
  } catch (err) {
    console.error('Become coach error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
