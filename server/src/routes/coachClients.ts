import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { requireAuth, requireCoach } from '../middleware/auth.js';
import { asObjectId, displayLabelOf, requireAcceptedCoaching } from '../coachAccess.js';

export const coachClientsRouter = Router();

const GOALS = ['cut', 'maintain', 'bulk'] as const;
type Goal = (typeof GOALS)[number];

function isGoal(value: unknown): value is Goal {
  return typeof value === 'string' && (GOALS as readonly string[]).includes(value);
}

function asFiniteNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function startOfUtcWeek(now = new Date()) {
  const day = now.getUTCDay();
  const diff = (day + 6) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff)).toISOString();
}

function publicProgram(doc: Record<string, unknown> & { _id: ObjectId }, names: Map<string, string>) {
  const days = Array.isArray(doc.days) ? doc.days.map((day) => {
    const raw = day as { dayLabel?: string; exercises?: unknown[] };
    return {
      dayLabel: typeof raw.dayLabel === 'string' && raw.dayLabel ? raw.dayLabel : 'Day',
      exercises: (Array.isArray(raw.exercises) ? raw.exercises : []).map((item) => {
        const row = item as { exerciseId?: string; targetSets?: number; targetRepMin?: number; targetRepMax?: number };
        const exerciseId = typeof row.exerciseId === 'string' ? row.exerciseId : '';
        return {
          exerciseId,
          exerciseName: names.get(exerciseId) ?? '',
          targetSets: Number(row.targetSets) || 3,
          targetRepMin: Number(row.targetRepMin) || 8,
          targetRepMax: Number(row.targetRepMax) || 12,
        };
      }),
    };
  }) : [];
  return {
    id: doc._id.toHexString(),
    name: String(doc.name ?? ''),
    description: String(doc.description ?? ''),
    type: String(doc.type ?? 'custom'),
    daysPerWeek: Number(doc.daysPerWeek) || days.length,
    createdBy: typeof doc.createdBy === 'string' ? doc.createdBy : null,
    isCustom: Boolean(doc.createdBy),
    assignedToUserId: typeof doc.assignedToUserId === 'string' ? doc.assignedToUserId : null,
    createdByCoachId: typeof doc.createdByCoachId === 'string' ? doc.createdByCoachId : null,
    days,
  };
}

async function loadExerciseNames(ids: string[]) {
  const objectIds = ids.map(asObjectId).filter((id): id is ObjectId => Boolean(id));
  if (objectIds.length === 0) return new Map<string, string>();
  const docs = await getDb().collection('exercises').find({ _id: { $in: objectIds } }).toArray();
  return new Map(docs.map((doc) => [doc._id.toHexString(), String(doc.name ?? '')]));
}

async function activeProgramFor(athleteId: string) {
  const assignment = await getDb().collection('userPrograms').findOne({ userId: athleteId, active: true });
  if (!assignment || typeof assignment.programId !== 'string') return null;
  const id = asObjectId(assignment.programId);
  if (!id) return null;
  const program = await getDb().collection('programs').findOne({ _id: id });
  return program as (Record<string, unknown> & { _id: ObjectId }) | null;
}

async function weekStats(athleteId: string, planned: number) {
  const from = startOfUtcWeek();
  const sessions = await getDb().collection('workoutSessions').find({
    userId: athleteId,
    startedAt: { $gte: from },
  }).sort({ startedAt: -1 }).toArray();
  const latest = await getDb().collection('workoutSessions').find({ userId: athleteId }).sort({ startedAt: -1 }).limit(1).toArray();
  return {
    plannedSessions: planned,
    completedSessions: sessions.length,
    lastWorkoutAt: typeof latest[0]?.startedAt === 'string' ? latest[0].startedAt : null,
  };
}

coachClientsRouter.get('/me/clients', requireAuth, requireCoach, async (req: Request, res: Response) => {
  try {
    const coachId = req.user!.userId;
    const requests = await getDb().collection('coachRequests').find({ coachId, status: 'accepted' }).sort({ respondedAt: -1, createdAt: -1 }).toArray();
    const athleteIds = requests.map((doc) => asObjectId(String(doc.athleteId))).filter((id): id is ObjectId => Boolean(id));
    const users = athleteIds.length
      ? await getDb().collection('users').find({ _id: { $in: athleteIds } }).toArray()
      : [];
    const byId = new Map(users.map((user) => [user._id.toHexString(), user]));
    const clients = await Promise.all(requests.map(async (doc) => {
      const athleteId = String(doc.athleteId ?? '');
      const athlete = byId.get(athleteId);
      const program = await activeProgramFor(athleteId);
      const planned = Array.isArray(program?.days) ? program.days.length : Number(program?.daysPerWeek) || 0;
      const stats = await weekStats(athleteId, planned);
      return {
        athleteId,
        name: displayLabelOf(athlete as { coachProfile?: { displayName?: string }; email?: string } | undefined),
        email: typeof athlete?.email === 'string' ? athlete.email : '',
        coachingStartedAt: String(doc.respondedAt || doc.createdAt || ''),
        programName: typeof program?.name === 'string' ? program.name : null,
        lastWorkoutAt: stats.lastWorkoutAt,
        plannedSessions: stats.plannedSessions,
        completedSessions: stats.completedSessions,
      };
    }));
    res.json(clients);
  } catch (err) {
    console.error('List coach clients error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

coachClientsRouter.get('/me/clients/:athleteId', requireAuth, requireCoach, async (req: Request, res: Response) => {
  try {
    const coachId = req.user!.userId;
    const athleteId = String(req.params.athleteId);
    const coaching = await requireAcceptedCoaching(coachId, athleteId);
    if (!coaching) {
      res.status(403).json({ error: 'Accepted coaching relationship required' });
      return;
    }
    const athleteObjectId = asObjectId(athleteId);
    if (!athleteObjectId) {
      res.status(400).json({ error: 'Invalid athlete id' });
      return;
    }
    const athlete = await getDb().collection('users').findOne({ _id: athleteObjectId });
    if (!athlete) {
      res.status(404).json({ error: 'Athlete not found' });
      return;
    }
    const programDoc = await activeProgramFor(athleteId);
    const exerciseIds = programDoc && Array.isArray(programDoc.days)
      ? programDoc.days.flatMap((day) => {
        const exercises = Array.isArray((day as { exercises?: { exerciseId?: string }[] }).exercises)
          ? (day as { exercises: { exerciseId?: string }[] }).exercises
          : [];
        return exercises.map((item) => item.exerciseId).filter((id): id is string => Boolean(id));
      })
      : [];
    const [names, goals, recentSessions, recentLogs] = await Promise.all([
      loadExerciseNames(exerciseIds),
      getDb().collection('nutritionGoals').findOne({ userId: athleteId }),
      getDb().collection('workoutSessions').find({ userId: athleteId }).sort({ startedAt: -1 }).limit(12).toArray(),
      getDb().collection('nutritionLogs').find({ userId: athleteId }).sort({ date: -1 }).limit(7).toArray(),
    ]);
    const sessionIds = recentSessions.map((session) => session._id.toHexString());
    const setLogs = sessionIds.length
      ? await getDb().collection('setLogs').find({ sessionId: { $in: sessionIds } }).toArray()
      : [];
    const setsBySession = new Map<string, typeof setLogs>();
    for (const log of setLogs) {
      const list = setsBySession.get(String(log.sessionId)) ?? [];
      list.push(log);
      setsBySession.set(String(log.sessionId), list);
    }
    const planned = programDoc && Array.isArray(programDoc.days) ? programDoc.days.length : Number(programDoc?.daysPerWeek) || 0;
    const stats = await weekStats(athleteId, planned);
    const goalFields = (goals ?? {}) as {
      dailyCalories?: number;
      dailyProtein?: number;
      dailyWater?: number;
      goal?: string;
      source?: string;
      setByCoachId?: string;
      updatedAt?: string;
    };
    const setByCoachId = typeof goalFields.setByCoachId === 'string' ? goalFields.setByCoachId : null;
    const coachName = setByCoachId
      ? displayLabelOf(await getDb().collection('users').findOne({ _id: asObjectId(setByCoachId)! }) as { coachProfile?: { displayName?: string }; email?: string } | null)
      : null;
    res.json({
      athleteId,
      name: displayLabelOf(athlete as { coachProfile?: { displayName?: string }; email?: string }),
      email: typeof athlete.email === 'string' ? athlete.email : '',
      weightKg: typeof athlete.weightKg === 'number' ? athlete.weightKg : null,
      coachingStartedAt: String(coaching.respondedAt || coaching.createdAt || ''),
      program: programDoc ? publicProgram(programDoc, names) : null,
      nutritionGoals: goals ? {
        dailyCalories: Number(goalFields.dailyCalories) || 0,
        dailyProtein: Number(goalFields.dailyProtein) || 0,
        dailyWater: Number(goalFields.dailyWater) || 0,
        goal: isGoal(goalFields.goal) ? goalFields.goal : 'maintain',
        source: goalFields.source === 'coach' ? 'coach' : goalFields.source === 'manual' ? 'manual' : 'auto',
        setByCoachId,
        setByCoachName: goalFields.source === 'coach' ? coachName : null,
        updatedAt: String(goalFields.updatedAt ?? ''),
      } : null,
      recentWorkouts: recentSessions.map((session) => {
        const sets = setsBySession.get(session._id.toHexString()) ?? [];
        return {
          id: session._id.toHexString(),
          startedAt: String(session.startedAt ?? ''),
          dayLabel: typeof session.dayLabel === 'string' ? session.dayLabel : '',
          totalVolume: Number(session.totalVolume) || 0,
          exerciseNames: [...new Set(sets.map((set) => String(set.exerciseName || 'Exercise')))],
        };
      }),
      recentNutritionLogs: recentLogs.map((log) => {
        const meals = Array.isArray(log.meals) ? log.meals as Array<{ calories?: number; protein?: number }> : [];
        return {
          date: String(log.date ?? ''),
          calories: meals.reduce((sum, meal) => sum + (Number(meal.calories) || 0), 0),
          protein: meals.reduce((sum, meal) => sum + (Number(meal.protein) || 0), 0),
          waterMl: Number(log.waterMl) || 0,
          mealCount: meals.length,
        };
      }),
      adherence: {
        plannedSessions: stats.plannedSessions,
        completedSessions: stats.completedSessions,
        lastWorkoutAt: stats.lastWorkoutAt,
      },
    });
  } catch (err) {
    console.error('Get coach client error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

coachClientsRouter.post('/me/clients/:athleteId/nutrition-goals', requireAuth, requireCoach, async (req: Request, res: Response) => {
  try {
    const coachId = req.user!.userId;
    const athleteId = String(req.params.athleteId);
    const coaching = await requireAcceptedCoaching(coachId, athleteId);
    if (!coaching) {
      res.status(403).json({ error: 'Accepted coaching relationship required' });
      return;
    }
    const dailyCalories = asFiniteNumber(req.body?.dailyCalories);
    const dailyProtein = asFiniteNumber(req.body?.dailyProtein);
    const dailyWater = asFiniteNumber(req.body?.dailyWater);
    const goal = req.body?.goal;
    if (dailyCalories === null || dailyCalories <= 0 || dailyProtein === null || dailyProtein < 0 || dailyWater === null || dailyWater <= 0 || !isGoal(goal)) {
      res.status(400).json({ error: 'dailyCalories, dailyProtein, dailyWater (positive numbers) and goal (cut|maintain|bulk) are required' });
      return;
    }
    const updatedAt = new Date().toISOString();
    const doc = await getDb().collection('nutritionGoals').findOneAndUpdate(
      { userId: athleteId },
      {
        $set: { dailyCalories, dailyProtein, dailyWater, goal, source: 'coach', setByCoachId: coachId, updatedAt },
        $setOnInsert: { userId: athleteId },
      },
      { upsert: true, returnDocument: 'after' }
    );
    const coach = await getDb().collection('users').findOne({ _id: asObjectId(coachId)! });
    res.json({
      dailyCalories,
      dailyProtein,
      dailyWater,
      goal,
      source: 'coach',
      setByCoachId: coachId,
      setByCoachName: displayLabelOf(coach as { coachProfile?: { displayName?: string }; email?: string } | null),
      updatedAt,
      id: doc?._id ? String(doc._id) : undefined,
    });
  } catch (err) {
    console.error('Set client nutrition goals error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
