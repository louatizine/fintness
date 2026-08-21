import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import type { CardioIntensity, ExerciseKind } from '../types.js';
import { estimateCaloriesBurned } from '../metValues.js';

export const workoutsRouter = Router();
workoutsRouter.use(requireAuth);

const KINDS = ['strength', 'cardio'] as const;
const INTENSITIES = ['low', 'moderate', 'high'] as const;

function isKind(value: unknown): value is ExerciseKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

function isIntensity(value: unknown): value is CardioIntensity {
  return typeof value === 'string' && (INTENSITIES as readonly string[]).includes(value);
}

function asObjectId(value: unknown): ObjectId | null {
  if (typeof value !== 'string' || !/^[a-fA-F0-9]{24}$/.test(value)) return null;
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

function sessionIdOf(id: ObjectId) {
  return id.toHexString();
}

async function loadExercises(ids: string[]) {
  const objectIds = ids.map(asObjectId).filter((id): id is ObjectId => Boolean(id));
  if (objectIds.length === 0) return new Map<string, Record<string, unknown>>();
  const docs = await getDb().collection('exercises').find({ _id: { $in: objectIds } }).toArray();
  return new Map(docs.map((doc) => [doc._id.toHexString(), doc as Record<string, unknown>]));
}

function normalizeSet(
  raw: Record<string, unknown>,
  index: number,
  exercise: Record<string, unknown> | undefined,
  userId: string,
  sessionId: string,
  weightKg: number | null
) {
  const kind: ExerciseKind = isKind(raw.kind) ? raw.kind : isKind(exercise?.type) ? exercise.type : 'strength';
  const exerciseId = typeof raw.exerciseId === 'string' ? raw.exerciseId : '';
  const exerciseName = typeof raw.exerciseName === 'string' && raw.exerciseName.trim()
    ? raw.exerciseName.trim()
    : typeof exercise?.name === 'string' ? exercise.name : 'Exercise';
  const completedAt = typeof raw.completedAt === 'string' ? raw.completedAt : new Date().toISOString();
  const base = {
    userId,
    sessionId,
    exerciseId,
    exerciseName,
    kind,
    setNumber: asFiniteNumber(raw.setNumber) ?? index + 1,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    completedAt,
  };

  if (kind === 'cardio') {
    const durationMin = asFiniteNumber(raw.durationMin);
    if (durationMin === null || durationMin <= 0) return { error: 'Cardio logs need a duration in minutes' as const };
    const distanceKm = asFiniteNumber(raw.distanceKm);
    const intensity = isIntensity(raw.intensity) ? raw.intensity : null;
    const avgHeartRate = asFiniteNumber(raw.avgHeartRate);
    const metKey = typeof exercise?.seedKey === 'string'
      ? exercise.seedKey
      : typeof exercise?.metBasis === 'string'
        ? exercise.metBasis
        : null;
    return {
      doc: {
        ...base,
        durationMin,
        distanceKm: distanceKm !== null && distanceKm >= 0 ? distanceKm : null,
        intensity,
        caloriesBurned: estimateCaloriesBurned({ metKey, intensity, weightKg, durationMin }),
        avgHeartRate: avgHeartRate !== null && avgHeartRate > 0 ? avgHeartRate : null,
      },
    };
  }

  const weight = asFiniteNumber(raw.weight) ?? 0;
  const reps = asFiniteNumber(raw.reps);
  if (reps === null || reps <= 0 || weight < 0) return { error: 'Strength sets need non-negative weight and positive reps' as const };
  return { doc: { ...base, weight, reps } };
}

function setVolume(set: { kind?: string; weight?: number; reps?: number }) {
  if (set.kind === 'cardio') return 0;
  return (set.weight || 0) * (set.reps || 0);
}

async function attachSets<T extends { _id: ObjectId }>(sessions: T[]) {
  if (sessions.length === 0) return [];
  const ids = sessions.map((s) => sessionIdOf(s._id));
  const logs = await getDb().collection('setLogs').find({ sessionId: { $in: ids } }).sort({ completedAt: 1 }).toArray();
  const grouped = new Map<string, typeof logs>();
  for (const log of logs) {
    const list = grouped.get(String(log.sessionId)) ?? [];
    list.push(log);
    grouped.set(String(log.sessionId), list);
  }
  return sessions.map((session) => {
    const sets = grouped.get(sessionIdOf(session._id)) ?? [];
    const kinds = new Set(sets.map((s) => s.kind === 'cardio' ? 'cardio' : 'strength'));
    const cardioSets = sets.filter((s) => s.kind === 'cardio');
    const cardioCalories = cardioSets.reduce((sum, s) => sum + (typeof s.caloriesBurned === 'number' ? s.caloriesBurned : 0), 0);
    const cardioDurationMin = cardioSets.reduce((sum, s) => sum + (Number(s.durationMin) || 0), 0);
    return {
      ...session,
      _id: sessionIdOf(session._id),
      sets,
      exerciseNames: [...new Set(sets.map((s) => String(s.exerciseName || 'Exercise')))],
      kinds: [...kinds],
      cardioDurationMin,
      cardioCaloriesBurned: cardioSets.some((s) => typeof s.caloriesBurned === 'number') ? cardioCalories : null,
    };
  });
}

async function insertSets(rawSets: unknown[], userId: string, sessionId: string, startIndex: number) {
  if (!Array.isArray(rawSets) || rawSets.length === 0) return { sets: [] as Record<string, unknown>[], volume: 0 };
  const exerciseIds = [...new Set(rawSets.map((s) => (s as { exerciseId?: string }).exerciseId).filter(Boolean) as string[])];
  const userObjectId = asObjectId(userId);
  const [exercises, user] = await Promise.all([
    loadExercises(exerciseIds),
    userObjectId ? getDb().collection('users').findOne({ _id: userObjectId }) : Promise.resolve(null),
  ]);
  const weightKg = typeof user?.weightKg === 'number' ? user.weightKg : null;
  const docs: Record<string, unknown>[] = [];
  let volume = 0;
  for (let i = 0; i < rawSets.length; i++) {
    const raw = rawSets[i] as Record<string, unknown>;
    const exerciseId = typeof raw.exerciseId === 'string' ? raw.exerciseId : '';
    const normalized = normalizeSet(raw, startIndex + i, exercises.get(exerciseId), userId, sessionId, weightKg);
    if ('error' in normalized && normalized.error) return { error: normalized.error };
    const doc = (normalized as { doc: Record<string, unknown> }).doc;
    docs.push(doc);
    volume += setVolume(doc as { kind?: string; weight?: number; reps?: number });
  }
  if (docs.length) await getDb().collection('setLogs').insertMany(docs);
  return { sets: docs, volume };
}

workoutsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const startedAt = typeof req.body?.startedAt === 'string' ? req.body.startedAt : new Date().toISOString();
    const rawSets = Array.isArray(req.body?.sets) ? req.body.sets : [];
    const userProgramId = typeof req.body?.userProgramId === 'string' ? req.body.userProgramId : null;
    const programId = typeof req.body?.programId === 'string' ? req.body.programId : null;
    const dayIndex = asFiniteNumber(req.body?.dayIndex);
    const dayLabel = typeof req.body?.dayLabel === 'string' ? req.body.dayLabel.trim() : '';
    const session = {
      userId,
      startedAt,
      notes: typeof req.body?.notes === 'string' ? req.body.notes : '',
      totalVolume: 0,
      ...(userProgramId ? { userProgramId } : {}),
      ...(programId ? { programId } : {}),
      ...(dayIndex !== null && dayIndex >= 0 ? { dayIndex } : {}),
      ...(dayLabel ? { dayLabel } : {}),
    };
    const result = await getDb().collection('workoutSessions').insertOne(session);
    const sessionId = sessionIdOf(result.insertedId);
    const inserted = await insertSets(rawSets, userId, sessionId, 0);
    if ('error' in inserted && inserted.error) {
      await getDb().collection('workoutSessions').deleteOne({ _id: result.insertedId });
      res.status(400).json({ error: inserted.error });
      return;
    }
    if (inserted.volume) {
      await getDb().collection('workoutSessions').updateOne({ _id: result.insertedId }, { $set: { totalVolume: inserted.volume } });
    }
    res.status(201).json({ _id: sessionId, ...session, totalVolume: inserted.volume, sets: inserted.sets });
  } catch (err) {
    console.error('Create workout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

workoutsRouter.post('/:id/sets', async (req: Request, res: Response) => {
  try {
    const id = asObjectId(String(req.params.id));
    if (!id) {
      res.status(400).json({ error: 'Invalid session id' });
      return;
    }
    const userId = req.user!.userId;
    const session = await getDb().collection('workoutSessions').findOne({ _id: id, userId });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const rawSets = Array.isArray(req.body?.sets) ? req.body.sets : req.body?.exerciseId ? [req.body] : [];
    const existingCount = await getDb().collection('setLogs').countDocuments({ sessionId: sessionIdOf(id) });
    const inserted = await insertSets(rawSets, userId, sessionIdOf(id), existingCount);
    if ('error' in inserted && inserted.error) {
      res.status(400).json({ error: inserted.error });
      return;
    }
    if (inserted.volume) {
      await getDb().collection('workoutSessions').updateOne({ _id: id }, { $inc: { totalVolume: inserted.volume } });
    }
    res.status(201).json({ sets: inserted.sets });
  } catch (err) {
    console.error('Add set error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

workoutsRouter.get('/summary', async (req: Request, res: Response) => {
  try {
    const weekFrom = typeof req.query.weekFrom === 'string' ? req.query.weekFrom : '';
    const weekTo = typeof req.query.weekTo === 'string' ? req.query.weekTo : '';
    const monthFrom = typeof req.query.monthFrom === 'string' ? req.query.monthFrom : '';
    const monthTo = typeof req.query.monthTo === 'string' ? req.query.monthTo : '';
    if (!weekFrom || !weekTo || !monthFrom || !monthTo) {
      res.status(400).json({ error: 'weekFrom, weekTo, monthFrom and monthTo (ISO datetimes) are required' });
      return;
    }
    const userId = req.user!.userId;
    const logs = getDb().collection('setLogs');
    async function totals(from: string, to: string) {
      const rows = await logs.find({
        userId,
        kind: 'cardio',
        completedAt: { $gte: from, $lt: to },
      }).toArray();
      return {
        from,
        to,
        durationMin: rows.reduce((sum, row) => sum + (Number(row.durationMin) || 0), 0),
        caloriesBurned: rows.reduce((sum, row) => sum + (typeof row.caloriesBurned === 'number' ? row.caloriesBurned : 0), 0),
        sessions: new Set(rows.map((row) => String(row.sessionId))).size,
      };
    }
    const [week, month] = await Promise.all([totals(weekFrom, weekTo), totals(monthFrom, monthTo)]);
    res.json({ week, month });
  } catch (err) {
    console.error('Get workout summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

workoutsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const sessions = await getDb()
      .collection('workoutSessions')
      .find({ userId: req.user!.userId })
      .sort({ startedAt: -1 })
      .limit(limit)
      .toArray();
    res.json(await attachSets(sessions));
  } catch (err) {
    console.error('Get workouts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

workoutsRouter.get('/progress/:exerciseId', async (req: Request, res: Response) => {
  try {
    const exerciseId = String(req.params.exerciseId);
    const db = getDb();
    const objectId = asObjectId(exerciseId);
    const exercise = objectId ? await db.collection('exercises').findOne({ _id: objectId }) : null;
    const type: ExerciseKind = isKind(exercise?.type) ? exercise.type : 'strength';

    const sets = await db
      .collection('setLogs')
      .find({ userId: req.user!.userId, exerciseId })
      .sort({ completedAt: 1 })
      .toArray();

    if (type === 'cardio') {
      const points = sets
        .filter((s) => s.kind === 'cardio' || s.durationMin)
        .map((s) => {
          const durationMin = Number(s.durationMin) || 0;
          const distanceKm = Number(s.distanceKm) || 0;
          return {
            date: s.completedAt || s.createdAt || '',
            durationMin,
            distanceKm,
            paceMinPerKm: distanceKm > 0 ? durationMin / distanceKm : null,
            caloriesBurned: s.caloriesBurned ?? null,
          };
        });
      res.json({ type: 'cardio', points });
      return;
    }

    const sessionMap = new Map<string, { date: string; maxWeight: number; maxVolume: number; totalVolume: number }>();
    for (const s of sets) {
      if (s.kind === 'cardio') continue;
      const volume = (s.weight || 0) * (s.reps || 0);
      const existing = sessionMap.get(s.sessionId);
      if (!existing) {
        sessionMap.set(s.sessionId, {
          date: s.completedAt || s.createdAt || '',
          maxWeight: s.weight || 0,
          maxVolume: volume,
          totalVolume: volume,
        });
      } else {
        existing.maxWeight = Math.max(existing.maxWeight, s.weight || 0);
        existing.maxVolume = Math.max(existing.maxVolume, volume);
        existing.totalVolume += volume;
      }
    }
    const points = Array.from(sessionMap.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    res.json({ type: 'strength', points });
  } catch (err) {
    console.error('Get progress error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
