import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { suggestRestSeconds } from '../restSuggestion.js';
import { isMetBasis } from '../metValues.js';
import { EQUIPMENT, type Equipment, type ExerciseKind, type NutritionGoalKind } from '../types.js';

export const exercisesRouter = Router();
exercisesRouter.use(requireAuth);

const KINDS = ['strength', 'cardio'] as const;
const GOALS = ['cut', 'maintain', 'bulk'] as const;

function isKind(value: unknown): value is ExerciseKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

function isEquipment(value: unknown): value is Equipment {
  return typeof value === 'string' && (EQUIPMENT as readonly string[]).includes(value);
}

function defaultEquipment(type: ExerciseKind, value: unknown): Equipment {
  if (isEquipment(value)) return value;
  return type === 'cardio' ? 'none' : 'barbell';
}

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

function isOwner(doc: { createdBy?: string | null; userId?: string }, userId: string) {
  return doc.createdBy === userId || (!doc.createdBy && doc.userId === userId);
}

async function resolveGoal(userId: string): Promise<NutritionGoalKind | null> {
  const doc = await getDb().collection('nutritionGoals').findOne({ userId });
  const goal = doc?.goal;
  return typeof goal === 'string' && (GOALS as readonly string[]).includes(goal) ? (goal as NutritionGoalKind) : null;
}

function publicExercise(
  doc: Record<string, unknown> & { _id: ObjectId },
  userId: string,
  rest: { restSeconds: number | null; restSuggested: number | null; restOverridden: boolean }
) {
  const createdBy = (doc.createdBy as string | null | undefined) ?? null;
  const type = isKind(doc.type) ? doc.type : 'strength';
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    type,
    muscleGroup: doc.muscleGroup ?? '',
    notes: doc.notes ?? '',
    targetSets: doc.targetSets ?? null,
    targetRepMin: doc.targetRepMin ?? null,
    targetRepMax: doc.targetRepMax ?? null,
    unit: doc.unit ?? 'kg',
    equipment: defaultEquipment(type, doc.equipment),
    progressionPath: Array.isArray(doc.progressionPath) ? doc.progressionPath.filter((id): id is string => typeof id === 'string') : [],
    createdBy,
    isCustom: isOwner(doc as { createdBy?: string | null; userId?: string }, userId),
    seedKey: typeof doc.seedKey === 'string' ? doc.seedKey : null,
    metBasis: typeof doc.metBasis === 'string' ? doc.metBasis : null,
    archived: Boolean(doc.archived),
    referenceImageUrl: typeof doc.referenceImageUrl === 'string' && doc.referenceImageUrl.trim()
      ? doc.referenceImageUrl.trim()
      : null,
    referenceInstructions: Array.isArray(doc.referenceInstructions)
      ? doc.referenceInstructions.filter((step): step is string => typeof step === 'string' && step.trim().length > 0)
      : [],
    restSeconds: rest.restSeconds,
    restSuggested: rest.restSuggested,
    restOverridden: rest.restOverridden,
  };
}

exercisesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const db = getDb();
    const [docs, prefs, goal] = await Promise.all([
      (async () => {
        const assigned = await db.collection('programs').find({ assignedToUserId: userId }).toArray();
        const extraIds = assigned.flatMap((program) => {
          const days = Array.isArray(program.days) ? program.days : [];
          return days.flatMap((day) => {
            const exercises = Array.isArray((day as { exercises?: { exerciseId?: string }[] }).exercises)
              ? (day as { exercises: { exerciseId?: string }[] }).exercises
              : [];
            return exercises.map((item) => asObjectId(String(item.exerciseId ?? ''))).filter((id): id is ObjectId => Boolean(id));
          });
        });
        return db.collection('exercises').find({
          archived: { $ne: true },
          $or: [
            { seedKey: { $exists: true } },
            { createdBy: userId },
            { userId },
            ...(extraIds.length ? [{ _id: { $in: extraIds } }] : []),
          ],
        }).toArray();
      })(),
      db.collection('exercisePreferences').find({ userId }).toArray(),
      resolveGoal(userId),
    ]);
    docs.sort((a, b) => {
      const typeRank = (type: unknown) => (type === 'cardio' ? 1 : 0);
      const byType = typeRank(a.type) - typeRank(b.type);
      return byType !== 0 ? byType : String(a.name).localeCompare(String(b.name));
    });
    const prefMap = new Map(prefs.map((p) => [String(p.exerciseId), Number(p.restSeconds)]));
    res.json(docs.map((doc) => {
      const type = isKind(doc.type) ? doc.type : 'strength';
      const suggested = suggestRestSeconds({
        type,
        targetRepMin: typeof doc.targetRepMin === 'number' ? doc.targetRepMin : undefined,
        targetRepMax: typeof doc.targetRepMax === 'number' ? doc.targetRepMax : undefined,
        goal,
      });
      const override = prefMap.get(doc._id.toHexString());
      const restOverridden = type === 'strength' && Number.isFinite(override);
      return publicExercise(doc as typeof doc & { _id: ObjectId }, userId, {
        restSuggested: suggested,
        restSeconds: restOverridden ? override! : suggested,
        restOverridden,
      });
    }));
  } catch (err) {
    console.error('Get exercises error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

exercisesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const type = req.body?.type ?? 'strength';
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (!isKind(type)) {
      res.status(400).json({ error: 'type must be strength or cardio' });
      return;
    }
    const userId = req.user!.userId;
    const metBasis = type === 'cardio' && isMetBasis(req.body?.metBasis) ? req.body.metBasis : null;
    const data = {
      name,
      type,
      muscleGroup: typeof req.body?.muscleGroup === 'string' ? req.body.muscleGroup.trim() : (type === 'cardio' ? 'cardio' : ''),
      notes: typeof req.body?.notes === 'string' ? req.body.notes.trim() : '',
      targetSets: type === 'strength' ? asFiniteNumber(req.body?.targetSets) ?? 3 : null,
      targetRepMin: type === 'strength' ? asFiniteNumber(req.body?.targetRepMin) ?? 8 : null,
      targetRepMax: type === 'strength' ? asFiniteNumber(req.body?.targetRepMax) ?? 12 : null,
      equipment: defaultEquipment(type, req.body?.equipment),
      progressionPath: [],
      metBasis,
      unit: 'kg',
      referenceImageUrl: null,
      referenceInstructions: [],
      createdBy: userId,
      archived: false,
      createdAt: new Date().toISOString(),
    };
    const result = await getDb().collection('exercises').insertOne(data);
    const goal = await resolveGoal(userId);
    const suggested = suggestRestSeconds({
      type,
      targetRepMin: data.targetRepMin ?? undefined,
      targetRepMax: data.targetRepMax ?? undefined,
      goal,
    });
    res.status(201).json(publicExercise({ ...data, _id: result.insertedId }, userId, {
      restSeconds: suggested,
      restSuggested: suggested,
      restOverridden: false,
    }));
  } catch (err) {
    console.error('Create exercise error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

exercisesRouter.patch('/:id/rest', async (req: Request, res: Response) => {
  try {
    const id = asObjectId(String(req.params.id));
    const restSeconds = asFiniteNumber(req.body?.restSeconds);
    if (!id || restSeconds === null || restSeconds < 15 || restSeconds > 600) {
      res.status(400).json({ error: 'Valid exercise id and restSeconds (15-600) are required' });
      return;
    }
    const userId = req.user!.userId;
    const exercise = await getDb().collection('exercises').findOne({ _id: id, archived: { $ne: true } });
    if (!exercise) {
      res.status(404).json({ error: 'Exercise not found' });
      return;
    }
    const type = isKind(exercise.type) ? exercise.type : 'strength';
    if (type === 'cardio') {
      res.status(400).json({ error: 'Cardio exercises do not use a rest timer' });
      return;
    }
    await getDb().collection('exercisePreferences').updateOne(
      { userId, exerciseId: id.toHexString() },
      { $set: { userId, exerciseId: id.toHexString(), restSeconds: Math.round(restSeconds), updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
    res.json({ exerciseId: id.toHexString(), restSeconds: Math.round(restSeconds), restOverridden: true });
  } catch (err) {
    console.error('Save rest preference error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

exercisesRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const id = asObjectId(String(req.params.id));
    if (!id) {
      res.status(400).json({ error: 'Invalid exercise id' });
      return;
    }
    const userId = req.user!.userId;
    const existing = await getDb().collection('exercises').findOne({ _id: id });
    if (!existing) {
      res.status(404).json({ error: 'Exercise not found' });
      return;
    }
    if (!isOwner(existing as { createdBy?: string | null; userId?: string }, userId)) {
      res.status(403).json({ error: 'You can only edit your own custom exercises' });
      return;
    }
    const $set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (typeof req.body?.name === 'string' && req.body.name.trim()) $set.name = req.body.name.trim();
    if (isKind(req.body?.type)) $set.type = req.body.type;
    if (typeof req.body?.muscleGroup === 'string') $set.muscleGroup = req.body.muscleGroup.trim();
    if (typeof req.body?.notes === 'string') $set.notes = req.body.notes.trim();
    if (isEquipment(req.body?.equipment)) $set.equipment = req.body.equipment;
    if (req.body?.metBasis === null || req.body?.metBasis === '') $set.metBasis = null;
    else if (isMetBasis(req.body?.metBasis)) $set.metBasis = req.body.metBasis;
    const targetSets = asFiniteNumber(req.body?.targetSets);
    const targetRepMin = asFiniteNumber(req.body?.targetRepMin);
    const targetRepMax = asFiniteNumber(req.body?.targetRepMax);
    if (targetSets !== null) $set.targetSets = targetSets;
    if (targetRepMin !== null) $set.targetRepMin = targetRepMin;
    if (targetRepMax !== null) $set.targetRepMax = targetRepMax;
    await getDb().collection('exercises').updateOne({ _id: id }, { $set });
    const doc = await getDb().collection('exercises').findOne({ _id: id });
    const type = isKind(doc?.type) ? doc!.type : 'strength';
    const goal = await resolveGoal(userId);
    const suggested = suggestRestSeconds({
      type,
      targetRepMin: typeof doc?.targetRepMin === 'number' ? doc.targetRepMin : undefined,
      targetRepMax: typeof doc?.targetRepMax === 'number' ? doc.targetRepMax : undefined,
      goal,
    });
    const pref = await getDb().collection('exercisePreferences').findOne({ userId, exerciseId: id.toHexString() });
    const restOverridden = type === 'strength' && typeof pref?.restSeconds === 'number';
    res.json(publicExercise(doc as typeof doc & { _id: ObjectId }, userId, {
      restSuggested: suggested,
      restSeconds: restOverridden ? pref!.restSeconds : suggested,
      restOverridden,
    }));
  } catch (err) {
    console.error('Update exercise error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

exercisesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = asObjectId(String(req.params.id));
    if (!id) {
      res.status(400).json({ error: 'Invalid exercise id' });
      return;
    }
    const userId = req.user!.userId;
    const existing = await getDb().collection('exercises').findOne({ _id: id });
    if (!existing) {
      res.status(404).json({ error: 'Exercise not found' });
      return;
    }
    if (!isOwner(existing as { createdBy?: string | null; userId?: string }, userId)) {
      res.status(403).json({ error: 'You can only delete your own custom exercises' });
      return;
    }
    await getDb().collection('exercises').updateOne(
      { _id: id },
      { $set: { archived: true, updatedAt: new Date().toISOString() } }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete exercise error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
