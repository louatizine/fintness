import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAcceptedCoaching } from '../coachAccess.js';
import { suggestBodyweightReps } from '../bodyweightSuggestion.js';
import { EQUIPMENT, PROGRAM_TYPES, type Equipment, type ExerciseKind, type NutritionGoalKind, type ProgramType } from '../types.js';

export const programsRouter = Router();
programsRouter.use(requireAuth);

const GOALS = ['cut', 'maintain', 'bulk'] as const;
const KINDS = ['strength', 'cardio'] as const;

function isProgramType(value: unknown): value is ProgramType {
  return typeof value === 'string' && (PROGRAM_TYPES as readonly string[]).includes(value);
}

function isEquipment(value: unknown): value is Equipment {
  return typeof value === 'string' && (EQUIPMENT as readonly string[]).includes(value);
}

function isKind(value: unknown): value is ExerciseKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
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

function asPositiveInt(value: unknown): number | null {
  const n = asFiniteNumber(value);
  if (n === null || n < 1 || !Number.isInteger(n)) return null;
  return n;
}

function isBodyweightExercise(doc: { type?: unknown; equipment?: unknown } | null | undefined) {
  if (!doc) return false;
  return isKind(doc.type) && doc.type === 'strength' && (doc.equipment === 'bodyweight' || doc.equipment === 'none');
}

function programVisible(doc: { createdBy?: string | null; assignedToUserId?: string | null; createdByCoachId?: string | null }, userId: string) {
  if (!doc.createdBy || doc.createdBy === userId || doc.assignedToUserId === userId) return true;
  return Boolean(doc.createdByCoachId) && !doc.assignedToUserId;
}

function publicProgram(doc: Record<string, unknown> & { _id: ObjectId }, names?: Map<string, string>, coachNames?: Map<string, string>) {
  const createdBy = (doc.createdBy as string | null | undefined) ?? null;
  const days = Array.isArray(doc.days) ? doc.days.map((day) => {
    const raw = day as { dayLabel?: string; exercises?: unknown[] };
    return {
      dayLabel: typeof raw.dayLabel === 'string' ? raw.dayLabel : 'Day',
      exercises: (Array.isArray(raw.exercises) ? raw.exercises : []).map((item) => {
        const row = item as { exerciseId?: string; targetSets?: number; targetRepMin?: number; targetRepMax?: number };
        const exerciseId = typeof row.exerciseId === 'string' ? row.exerciseId : '';
        return {
          exerciseId,
          exerciseName: names?.get(exerciseId) ?? '',
          targetSets: Number(row.targetSets) || 3,
          targetRepMin: Number(row.targetRepMin) || 8,
          targetRepMax: Number(row.targetRepMax) || 12,
        };
      }),
    };
  }) : [];
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    description: doc.description ?? '',
    type: isProgramType(doc.type) ? doc.type : 'custom',
    daysPerWeek: Number(doc.daysPerWeek) || days.length,
    createdBy,
    isCustom: createdBy !== null,
    assignedToUserId: typeof doc.assignedToUserId === 'string' ? doc.assignedToUserId : null,
    createdByCoachId: typeof doc.createdByCoachId === 'string' ? doc.createdByCoachId : null,
    assignedByCoachName: typeof doc.createdByCoachId === 'string' ? (coachNames?.get(doc.createdByCoachId) ?? null) : null,
    days,
  };
}

async function loadExerciseNames(ids: string[]) {
  const objectIds = ids.map(asObjectId).filter((id): id is ObjectId => Boolean(id));
  if (objectIds.length === 0) return new Map<string, string>();
  const docs = await getDb().collection('exercises').find({ _id: { $in: objectIds } }).toArray();
  return new Map(docs.map((doc) => [doc._id.toHexString(), String(doc.name ?? '')]));
}

async function resolveGoal(userId: string): Promise<NutritionGoalKind | null> {
  const doc = await getDb().collection('nutritionGoals').findOne({ userId });
  const goal = doc?.goal;
  return typeof goal === 'string' && (GOALS as readonly string[]).includes(goal) ? (goal as NutritionGoalKind) : null;
}

async function findVisibleProgram(programId: string, userId: string) {
  const id = asObjectId(programId);
  if (!id) return null;
  const doc = await getDb().collection('programs').findOne({ _id: id });
  if (!doc || !programVisible(doc as { createdBy?: string | null }, userId)) return null;
  return doc;
}

async function getActiveAssignment(userId: string) {
  return getDb().collection('userPrograms').findOne({ userId, active: true });
}

function parseDays(raw: unknown): { error?: string; days?: { dayLabel: string; exercises: { exerciseId: string; targetSets: number; targetRepMin: number; targetRepMax: number }[] }[] } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'days must be a non-empty array' };
  const days = [];
  for (const item of raw) {
    const day = item as { dayLabel?: unknown; exercises?: unknown };
    const dayLabel = typeof day.dayLabel === 'string' ? day.dayLabel.trim() : '';
    if (!dayLabel) return { error: 'Each day needs a dayLabel' };
    if (!Array.isArray(day.exercises) || day.exercises.length === 0) return { error: `“${dayLabel}” needs at least one exercise` };
    const exercises = [];
    for (const row of day.exercises) {
      const entry = row as Record<string, unknown>;
      const exerciseId = typeof entry.exerciseId === 'string' ? entry.exerciseId : '';
      if (!asObjectId(exerciseId)) return { error: 'Each exercise needs a valid exerciseId' };
      const targetSets = asPositiveInt(entry.targetSets) ?? 3;
      const targetRepMin = asPositiveInt(entry.targetRepMin) ?? 8;
      const targetRepMax = asPositiveInt(entry.targetRepMax) ?? 12;
      if (targetRepMax < targetRepMin) return { error: 'targetRepMax must be >= targetRepMin' };
      exercises.push({ exerciseId, targetSets, targetRepMin, targetRepMax });
    }
    days.push({ dayLabel, exercises });
  }
  return { days };
}

async function loadCoachNames(coachIds: string[]) {
  const objectIds = [...new Set(coachIds)].map(asObjectId).filter((id): id is ObjectId => Boolean(id));
  if (objectIds.length === 0) return new Map<string, string>();
  const docs = await getDb().collection('users').find({ _id: { $in: objectIds } }).toArray();
  return new Map(docs.map((doc) => {
    const profile = doc.coachProfile as { displayName?: string } | undefined;
    const name = profile?.displayName?.trim() || (typeof doc.email === 'string' ? doc.email.split('@')[0] : 'Coach');
    return [doc._id.toHexString(), name];
  }));
}

async function hydrateNames(programs: Array<Record<string, unknown> & { _id: ObjectId }>) {
  const ids = programs.flatMap((program) => {
    const days = Array.isArray(program.days) ? program.days : [];
    return days.flatMap((day) => {
      const exercises = Array.isArray((day as { exercises?: unknown[] }).exercises) ? (day as { exercises: { exerciseId?: string }[] }).exercises : [];
      return exercises.map((item) => item.exerciseId).filter((id): id is string => Boolean(id));
    });
  });
  const coachIds = programs.map((program) => typeof program.createdByCoachId === 'string' ? program.createdByCoachId : '').filter(Boolean);
  const [names, coachNames] = await Promise.all([loadExerciseNames([...new Set(ids)]), loadCoachNames(coachIds)]);
  return programs.map((program) => publicProgram(program, names, coachNames));
}

async function advanceActiveDay(userId: string, completeSession: boolean) {
  const assignment = await getActiveAssignment(userId);
  if (!assignment) return { error: 'No active program', status: 404 as const };
  const program = await findVisibleProgram(String(assignment.programId), userId);
  if (!program) return { error: 'Active program not found', status: 404 as const };
  const days = Array.isArray(program.days) ? program.days : [];
  if (days.length === 0) return { error: 'Program has no days', status: 400 as const };
  const currentDayIndex = Number(assignment.currentDayIndex) || 0;
  const nextDayIndex = (currentDayIndex + 1) % days.length;
  if (completeSession) {
    await getDb().collection('workoutSessions').updateMany(
      { userId, userProgramId: assignment._id.toHexString(), dayIndex: currentDayIndex, completedAt: { $exists: false } },
      { $set: { completedAt: new Date().toISOString() } }
    );
  }
  await getDb().collection('userPrograms').updateOne(
    { _id: assignment._id },
    { $set: { currentDayIndex: nextDayIndex, updatedAt: new Date().toISOString() } }
  );
  return { nextDayIndex, assignmentId: assignment._id.toHexString() };
}

programsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const docs = await getDb().collection('programs').find({
      $or: [{ createdBy: null }, { createdBy: userId }, { assignedToUserId: userId }],
    }).toArray();
    docs.sort((a, b) => {
      const customRank = (Number(Boolean(a.createdBy)) - Number(Boolean(b.createdBy)));
      return customRank !== 0 ? customRank : String(a.name).localeCompare(String(b.name));
    });
    res.json(await hydrateNames(docs as Array<Record<string, unknown> & { _id: ObjectId }>));
  } catch (err) {
    console.error('Get programs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

programsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const parsed = parseDays(req.body?.days);
    if (parsed.error || !parsed.days) {
      res.status(400).json({ error: parsed.error ?? 'Invalid days' });
      return;
    }
    const userId = req.user!.userId;
    const assignedToUserId = typeof req.body?.assignedToUserId === 'string' ? req.body.assignedToUserId.trim() : '';
    const creatorId = asObjectId(userId);
    const creator = creatorId ? await getDb().collection('users').findOne({ _id: creatorId }) : null;
    let createdByCoachId: string | null = creator?.role === 'coach' ? userId : null;
    if (assignedToUserId) {
      const athleteId = asObjectId(assignedToUserId);
      if (!creatorId || !athleteId) {
        res.status(400).json({ error: 'assignedToUserId must be a valid user id' });
        return;
      }
      if (!creator || creator.role !== 'coach') {
        res.status(403).json({ error: 'Only coaches can assign a program to another athlete' });
        return;
      }
      if (assignedToUserId === userId) {
        res.status(400).json({ error: 'Assign the program to an accepted client, not yourself' });
        return;
      }
      const accepted = await requireAcceptedCoaching(userId, assignedToUserId);
      if (!accepted) {
        res.status(403).json({ error: 'You can only assign a plan to an athlete who accepted your coaching request' });
        return;
      }
    }
    const exerciseIds = [...new Set(parsed.days.flatMap((day) => day.exercises.map((item) => item.exerciseId)))];
    const objectIds = exerciseIds.map(asObjectId).filter((id): id is ObjectId => Boolean(id));
    const visible = await getDb().collection('exercises').find({
      _id: { $in: objectIds },
      archived: { $ne: true },
      $or: [{ seedKey: { $exists: true } }, { createdBy: userId }, { userId }],
    }).toArray();
    if (visible.length !== exerciseIds.length) {
      res.status(400).json({ error: 'One or more exercises are not in your library' });
      return;
    }
    const type = isProgramType(req.body?.type) ? req.body.type : 'custom';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const now = new Date().toISOString();
    const data = {
      name,
      description,
      type,
      daysPerWeek: asPositiveInt(req.body?.daysPerWeek) ?? parsed.days.length,
      createdBy: userId,
      assignedToUserId: assignedToUserId || null,
      createdByCoachId,
      days: parsed.days,
      createdAt: now,
    };
    const result = await getDb().collection('programs').insertOne(data);
    if (assignedToUserId) {
      await getDb().collection('userPrograms').updateMany(
        { userId: assignedToUserId, active: true },
        { $set: { active: false, endedAt: now } }
      );
      await getDb().collection('userPrograms').insertOne({
        userId: assignedToUserId,
        programId: result.insertedId.toHexString(),
        startedAt: now,
        active: true,
        currentDayIndex: 0,
      });
    }
    const names = new Map(visible.map((doc) => [doc._id.toHexString(), String(doc.name ?? '')]));
    const coachNames = createdByCoachId ? await loadCoachNames([createdByCoachId]) : undefined;
    res.status(201).json(publicProgram({ ...data, _id: result.insertedId }, names, coachNames));
  } catch (err) {
    console.error('Create program error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

programsRouter.get('/active', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const assignment = await getActiveAssignment(userId);
    if (!assignment) {
      res.json({ assignment: null, program: null, today: null });
      return;
    }
    const program = await findVisibleProgram(String(assignment.programId), userId);
    if (!program) {
      res.json({ assignment: null, program: null, today: null });
      return;
    }
    const days = Array.isArray(program.days) ? program.days : [];
    const dayIndex = ((Number(assignment.currentDayIndex) || 0) % Math.max(days.length, 1) + Math.max(days.length, 1)) % Math.max(days.length, 1);
    const todayDay = days[dayIndex] as { dayLabel?: string; exercises?: Array<Record<string, unknown>> } | undefined;
    const slots = todayDay?.exercises ?? [];
    const exerciseIds = slots.map((slot) => String(slot.exerciseId ?? '')).filter(Boolean);
    const objectIds = exerciseIds.map(asObjectId).filter((id): id is ObjectId => Boolean(id));
    const [exerciseDocs, goal, logs] = await Promise.all([
      objectIds.length ? getDb().collection('exercises').find({ _id: { $in: objectIds } }).toArray() : Promise.resolve([]),
      resolveGoal(userId),
      exerciseIds.length
        ? getDb().collection('setLogs').find({ userId, exerciseId: { $in: exerciseIds } }).sort({ completedAt: -1 }).toArray()
        : Promise.resolve([]),
    ]);
    const byId = new Map(exerciseDocs.map((doc) => [doc._id.toHexString(), doc]));
    const variationIds = [...new Set(exerciseDocs.flatMap((doc) => Array.isArray(doc.progressionPath) ? doc.progressionPath.map(String) : []))];
    const variationObjectIds = variationIds.map(asObjectId).filter((id): id is ObjectId => Boolean(id));
    const variationDocs = variationObjectIds.length
      ? await getDb().collection('exercises').find({ _id: { $in: variationObjectIds } }).toArray()
      : [];
    const variationNames = new Map(variationDocs.map((doc) => [doc._id.toHexString(), String(doc.name ?? '')]));
    const logsByExercise = new Map<string, typeof logs>();
    for (const log of logs) {
      const key = String(log.exerciseId);
      const list = logsByExercise.get(key) ?? [];
      list.push(log);
      logsByExercise.set(key, list);
    }
    const names = new Map(exerciseDocs.map((doc) => [doc._id.toHexString(), String(doc.name ?? '')]));
    const publicTodayExercises = slots.map((slot) => {
      const exerciseId = String(slot.exerciseId ?? '');
      const doc = byId.get(exerciseId);
      const suggestion = doc && isBodyweightExercise({ type: doc.type, equipment: doc.equipment })
        ? suggestBodyweightReps({
          goal,
          lastLogs: (logsByExercise.get(exerciseId) ?? []).map((log) => ({
            reps: typeof log.reps === 'number' ? log.reps : null,
            sessionId: String(log.sessionId ?? ''),
            completedAt: String(log.completedAt ?? ''),
          })),
          progressionPath: Array.isArray(doc.progressionPath) ? doc.progressionPath.map(String) : [],
          exerciseId,
          variationNames,
        })
        : null;
      return {
        exerciseId,
        targetSets: Number(slot.targetSets) || 3,
        targetRepMin: Number(slot.targetRepMin) || 8,
        targetRepMax: Number(slot.targetRepMax) || 12,
        exerciseName: names.get(exerciseId) ?? '',
        equipment: isEquipment(doc?.equipment) ? doc.equipment : null,
        suggestion,
      };
    });
    res.json({
      assignment: {
        id: assignment._id.toHexString(),
        programId: String(assignment.programId),
        startedAt: assignment.startedAt ?? '',
        currentDayIndex: dayIndex,
        active: true,
      },
      program: publicProgram(
        program as Record<string, unknown> & { _id: ObjectId },
        await loadExerciseNames(
          days.flatMap((day) => ((day as { exercises?: { exerciseId?: string }[] }).exercises ?? []).map((item) => String(item.exerciseId ?? '')).filter(Boolean))
        ),
        await loadCoachNames(typeof program.createdByCoachId === 'string' ? [program.createdByCoachId] : [])
      ),
      today: {
        dayIndex,
        dayLabel: typeof todayDay?.dayLabel === 'string' ? todayDay.dayLabel : 'Day',
        exercises: publicTodayExercises,
      },
    });
  } catch (err) {
    console.error('Get active program error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

programsRouter.post('/assign', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const programId = typeof req.body?.programId === 'string' ? req.body.programId : '';
    const program = await findVisibleProgram(programId, userId);
    if (!program) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }
    const now = new Date().toISOString();
    await getDb().collection('userPrograms').updateMany(
      { userId, active: true },
      { $set: { active: false, endedAt: now } }
    );
    const inserted = await getDb().collection('userPrograms').insertOne({
      userId,
      programId,
      startedAt: now,
      active: true,
      currentDayIndex: 0,
    });
    res.status(201).json({
      id: inserted.insertedId.toHexString(),
      userId,
      programId,
      startedAt: now,
      active: true,
      currentDayIndex: 0,
    });
  } catch (err) {
    console.error('Assign program error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

programsRouter.post('/unassign', async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    await getDb().collection('userPrograms').updateMany(
      { userId: req.user!.userId, active: true },
      { $set: { active: false, endedAt: now } }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Unassign program error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

programsRouter.post('/complete-day', async (req: Request, res: Response) => {
  try {
    const result = await advanceActiveDay(req.user!.userId, true);
    if ('error' in result && result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true, currentDayIndex: result.nextDayIndex });
  } catch (err) {
    console.error('Complete program day error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

programsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const id = asObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid program id' });
      return;
    }
    const userId = req.user!.userId;
    const existing = await getDb().collection('programs').findOne({ _id: id });
    if (!existing) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }
    if (existing.createdByCoachId !== userId && existing.createdBy !== userId) {
      res.status(403).json({ error: 'You can only edit programs you created' });
      return;
    }
    const assignedToUserId = typeof existing.assignedToUserId === 'string' ? existing.assignedToUserId : '';
    if (existing.createdByCoachId === userId && assignedToUserId && assignedToUserId !== userId) {
      const accepted = await requireAcceptedCoaching(userId, assignedToUserId);
      if (!accepted) {
        res.status(403).json({ error: 'You can only edit a client program while the coaching relationship is accepted' });
        return;
      }
    }
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (typeof req.body?.name === 'string') {
      const name = req.body.name.trim();
      if (!name) {
        res.status(400).json({ error: 'name cannot be empty' });
        return;
      }
      patch.name = name;
    }
    if (typeof req.body?.description === 'string') patch.description = req.body.description.trim();
    if (req.body?.type !== undefined) {
      if (!isProgramType(req.body.type)) {
        res.status(400).json({ error: 'Invalid program type' });
        return;
      }
      patch.type = req.body.type;
    }
    if (req.body?.days !== undefined) {
      const parsed = parseDays(req.body.days);
      if (parsed.error || !parsed.days) {
        res.status(400).json({ error: parsed.error ?? 'Invalid days' });
        return;
      }
      const exerciseIds = [...new Set(parsed.days.flatMap((day) => day.exercises.map((item) => item.exerciseId)))];
      const objectIds = exerciseIds.map(asObjectId).filter((oid): oid is ObjectId => Boolean(oid));
      const visible = await getDb().collection('exercises').find({
        _id: { $in: objectIds },
        archived: { $ne: true },
        $or: [{ seedKey: { $exists: true } }, { createdBy: userId }, { userId }],
      }).toArray();
      if (visible.length !== exerciseIds.length) {
        res.status(400).json({ error: 'One or more exercises are not in your library' });
        return;
      }
      patch.days = parsed.days;
      patch.daysPerWeek = asPositiveInt(req.body?.daysPerWeek) ?? parsed.days.length;
    } else if (req.body?.daysPerWeek !== undefined) {
      const daysPerWeek = asPositiveInt(req.body.daysPerWeek);
      if (!daysPerWeek) {
        res.status(400).json({ error: 'daysPerWeek must be a positive integer' });
        return;
      }
      patch.daysPerWeek = daysPerWeek;
    }
    await getDb().collection('programs').updateOne({ _id: id }, { $set: patch });
    const updated = await getDb().collection('programs').findOne({ _id: id });
    const [hydrated] = await hydrateNames([updated as Record<string, unknown> & { _id: ObjectId }]);
    res.json(hydrated);
  } catch (err) {
    console.error('Patch program error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

programsRouter.post('/skip-day', async (req: Request, res: Response) => {
  try {
    const result = await advanceActiveDay(req.user!.userId, false);
    if ('error' in result && result.error) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true, currentDayIndex: result.nextDayIndex });
  } catch (err) {
    console.error('Skip program day error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
