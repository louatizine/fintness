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

// FOLLOW-UP (pre-public launch / App Store & Play compliance):
// Implement DELETE /users/me with full cascade — workouts, nutrition logs/goals/plans,
// coach relationships & requests, coach videos/views/reports, push tokens, programs
// owned or assigned, SecureStore session invalidation on client. Do not ship publicly
// without account deletion.

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

function parseSex(value: unknown): 'male' | 'female' | null {
  return value === 'male' || value === 'female' ? value : null;
}

function parseWeightUnit(value: unknown): 'kg' | 'lb' | null {
  return value === 'kg' || value === 'lb' ? value : null;
}

function hasPasswordSet(doc: { password?: unknown }): boolean {
  return typeof doc.password === 'string' && doc.password.length > 0;
}

function publicProfile(doc: {
  _id: ObjectId;
  email?: string;
  name?: string;
  password?: string;
  weightUnit?: string;
  weightKg?: number | null;
  age?: number | null;
  sex?: string | null;
  heightCm?: number | null;
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
    name: typeof doc.name === 'string' ? doc.name : '',
    weightUnit: doc.weightUnit === 'lb' ? 'lb' as const : 'kg' as const,
    weightKg: typeof doc.weightKg === 'number' ? doc.weightKg : null,
    age: typeof doc.age === 'number' ? doc.age : null,
    sex: doc.sex === 'male' || doc.sex === 'female' ? doc.sex : null,
    heightCm: typeof doc.heightCm === 'number' ? doc.heightCm : null,
    hasPassword: hasPasswordSet(doc),
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
    const hasName = body.name !== undefined;
    const hasUnit = body.weightUnit !== undefined;
    const hasAge = body.age !== undefined;
    const hasSex = body.sex !== undefined;
    const hasHeight = body.heightCm !== undefined;

    if (!hasWeight && !hasPrefs && !hasName && !hasUnit && !hasAge && !hasSex && !hasHeight) {
      res.status(400).json({
        error: 'Provide at least one of: name, weightKg, weightUnit, age, sex, heightCm, notificationPrefs',
      });
      return;
    }

    const $set: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if (hasName) {
      if (typeof body.name !== 'string') {
        res.status(400).json({ error: 'name must be a string' });
        return;
      }
      const name = body.name.trim();
      if (name.length > 80) {
        res.status(400).json({ error: 'name must be 80 characters or less' });
        return;
      }
      $set.name = name;
    }

    if (hasWeight) {
      const weightKg = asFiniteNumber(body.weightKg);
      if (weightKg === null || weightKg < 30 || weightKg > 400) {
        res.status(400).json({ error: 'weightKg must be a number between 30 and 400' });
        return;
      }
      $set.weightKg = weightKg;
    }

    if (hasUnit) {
      const weightUnit = parseWeightUnit(body.weightUnit);
      if (!weightUnit) {
        res.status(400).json({ error: 'weightUnit must be kg or lb' });
        return;
      }
      $set.weightUnit = weightUnit;
    }

    if (hasAge) {
      if (body.age === null || body.age === '') {
        $set.age = null;
      } else {
        const age = asFiniteNumber(body.age);
        if (age === null || !Number.isInteger(age) || age < 13 || age > 100) {
          res.status(400).json({ error: 'age must be an integer between 13 and 100' });
          return;
        }
        $set.age = age;
      }
    }

    if (hasSex) {
      if (body.sex === null || body.sex === '') {
        $set.sex = null;
      } else {
        const sex = parseSex(body.sex);
        if (!sex) {
          res.status(400).json({ error: 'sex must be male or female' });
          return;
        }
        $set.sex = sex;
      }
    }

    if (hasHeight) {
      if (body.heightCm === null || body.heightCm === '') {
        $set.heightCm = null;
      } else {
        const heightCm = asFiniteNumber(body.heightCm);
        if (heightCm === null || heightCm < 100 || heightCm > 250) {
          res.status(400).json({ error: 'heightCm must be a number between 100 and 250' });
          return;
        }
        $set.heightCm = heightCm;
      }
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
    const parsed = parseCoachProfile((req.body ?? {}) as Record<string, unknown>, user.email ?? '');
    if (parsed.error || !parsed.profile) {
      res.status(400).json({ error: parsed.error ?? 'Invalid coach profile' });
      return;
    }
    const result = await getDb().collection('users').findOneAndUpdate(
      { _id: id },
      {
        $set: {
          role: 'coach',
          coachProfile: parsed.profile,
          updatedAt: new Date().toISOString(),
        },
      },
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
