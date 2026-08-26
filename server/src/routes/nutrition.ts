import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { requireAuth, requireCoach } from '../middleware/auth.js';

export const nutritionRouter = Router();
nutritionRouter.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GOALS = ['cut', 'maintain', 'bulk'] as const;
const ACTIVITY = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
type Goal = (typeof GOALS)[number];
type ActivityLevel = (typeof ACTIVITY)[number];
type Sex = 'male' | 'female';

type NutritionGoalDoc = {
  userId: string;
  dailyCalories: number;
  dailyProtein: number;
  dailyWater: number;
  goal: Goal;
  source: 'auto' | 'manual' | 'coach';
  setByCoachId?: string | null;
  updatedAt: string;
};

type NutritionMealDoc = {
  _id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  loggedAt: string;
};

type NutritionLogDoc = {
  userId: string;
  date: string;
  meals: NutritionMealDoc[];
  waterMl: number;
  createdAt: string;
  updatedAt: string;
};

type NutritionPlanDoc = {
  _id: ObjectId;
  coachId: string;
  coachName: string;
  visibility: 'client' | 'public';
  assignedToUserId?: string | null;
  title: string;
  description: string;
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFat: number;
  dailyWater: number;
  goal: Goal;
  mealPlan: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};
const GOAL_CALORIE_FACTOR: Record<Goal, number> = { cut: 0.85, maintain: 1, bulk: 1.15 };
const PROTEIN_G_PER_KG: Record<Goal, number> = { cut: 2.2, maintain: 1.6, bulk: 2.0 };

function nowIso() {
  return new Date().toISOString();
}

function asFiniteNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function asObjectId(value: unknown): ObjectId | null {
  if (typeof value !== 'string' || !/^[a-fA-F0-9]{24}$/.test(value)) return null;
  try {
    return new ObjectId(value);
  } catch {
    return null;
  }
}

function isGoal(value: unknown): value is Goal {
  return typeof value === 'string' && (GOALS as readonly string[]).includes(value);
}

function isActivity(value: unknown): value is ActivityLevel {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  return (ACTIVITY as readonly string[]).includes(normalized);
}

function parseActivity(value: unknown): ActivityLevel | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_') as ActivityLevel;
  return isActivity(normalized) ? normalized : null;
}

function parseSex(value: unknown): Sex | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'm' || normalized === 'male') return 'male';
  if (normalized === 'f' || normalized === 'female') return 'female';
  return null;
}

function publicGoals(doc: NutritionGoalDoc | null) {
  if (!doc) return null;
  return {
    dailyCalories: doc.dailyCalories,
    dailyProtein: doc.dailyProtein,
    dailyWater: doc.dailyWater,
    goal: doc.goal,
    source: doc.source === 'coach' ? 'coach' as const : doc.source === 'manual' ? 'manual' as const : 'auto' as const,
    setByCoachId: typeof doc.setByCoachId === 'string' ? doc.setByCoachId : null,
    setByCoachName: null as string | null,
    updatedAt: doc.updatedAt,
  };
}

async function publicGoalsWithCoach(doc: NutritionGoalDoc | null) {
  const goals = publicGoals(doc);
  if (!goals?.setByCoachId) return goals;
  const coachId = asObjectId(goals.setByCoachId);
  if (!coachId) return goals;
  const coach = await getDb().collection('users').findOne({ _id: coachId });
  const name = (coach?.coachProfile as { displayName?: string } | undefined)?.displayName?.trim()
    || (typeof coach?.email === 'string' ? coach.email.split('@')[0] : 'Coach');
  return { ...goals, setByCoachName: name };
}

function publicLog(doc: NutritionLogDoc | null, date: string) {
  if (!doc) {
    return { date, meals: [] as NutritionMealDoc[], waterMl: 0 };
  }
  return {
    date,
    meals: doc.meals ?? [],
    waterMl: doc.waterMl ?? 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function calculateTargets(input: {
  age: number;
  sex: Sex;
  weightKg: number;
  heightCm: number;
  activityLevel: ActivityLevel;
  goal: Goal;
}) {
  const bmr =
    input.sex === 'male'
      ? 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + 5
      : 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age - 161;
  const tdee = bmr * ACTIVITY_FACTOR[input.activityLevel];
  const dailyCalories = Math.round((tdee * GOAL_CALORIE_FACTOR[input.goal]) / 10) * 10;
  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    dailyCalories,
    dailyProtein: Math.round(input.weightKg * PROTEIN_G_PER_KG[input.goal]),
    dailyWater: Math.round(35 * input.weightKg),
    goal: input.goal,
  };
}

function goalsCol() {
  return getDb().collection<NutritionGoalDoc>('nutritionGoals');
}

function logsCol() {
  return getDb().collection<NutritionLogDoc>('nutritionLogs');
}

function plansCol() {
  return getDb().collection<NutritionPlanDoc>('nutritionPlans');
}

function displayNameOf(doc: { coachProfile?: { displayName?: string }; email?: string } | null | undefined) {
  const name = doc?.coachProfile?.displayName?.trim();
  if (name) return name;
  const email = typeof doc?.email === 'string' ? doc.email : '';
  return email.split('@')[0] || 'Coach';
}

function publicPlan(doc: NutritionPlanDoc | null) {
  if (!doc) return null;
  return {
    id: doc._id.toHexString(),
    coachId: doc.coachId,
    coachName: doc.coachName,
    visibility: doc.visibility,
    assignedToUserId: doc.assignedToUserId ?? null,
    title: doc.title,
    description: doc.description,
    dailyCalories: doc.dailyCalories,
    dailyProtein: doc.dailyProtein,
    dailyCarbs: doc.dailyCarbs,
    dailyFat: doc.dailyFat,
    dailyWater: doc.dailyWater,
    goal: doc.goal,
    mealPlan: doc.mealPlan,
    notes: doc.notes,
    active: doc.active,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function readPlanInput(body: unknown) {
  const row = (body ?? {}) as Record<string, unknown>;
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  const description = typeof row.description === 'string' ? row.description.trim() : '';
  const dailyCalories = asFiniteNumber(row.dailyCalories);
  const dailyProtein = asFiniteNumber(row.dailyProtein);
  const dailyCarbs = asFiniteNumber(row.dailyCarbs) ?? 0;
  const dailyFat = asFiniteNumber(row.dailyFat) ?? 0;
  const dailyWater = asFiniteNumber(row.dailyWater);
  const goal = row.goal;
  const mealPlan = typeof row.mealPlan === 'string' ? row.mealPlan.trim() : '';
  const notes = typeof row.notes === 'string' ? row.notes.trim() : '';
  if (!title || title.length > 120) return { error: 'title is required (max 120 characters)' };
  if (description.length > 500) return { error: 'description must be 500 characters or less' };
  if (mealPlan.length > 4000) return { error: 'mealPlan must be 4000 characters or less' };
  if (notes.length > 2000) return { error: 'notes must be 2000 characters or less' };
  if (dailyCalories === null || dailyCalories <= 0 || dailyProtein === null || dailyProtein < 0 || dailyWater === null || dailyWater <= 0 || !isGoal(goal)) {
    return { error: 'dailyCalories, dailyProtein, dailyWater and goal are required' };
  }
  if (dailyCarbs < 0 || dailyFat < 0) return { error: 'dailyCarbs and dailyFat must be non-negative' };
  return { data: { title, description, dailyCalories, dailyProtein, dailyCarbs, dailyFat, dailyWater, goal, mealPlan, notes } };
}

async function loadActiveClientPlan(userId: string) {
  return plansCol().findOne({ visibility: 'client', assignedToUserId: userId, active: true }, { sort: { updatedAt: -1 } });
}

nutritionRouter.get('/plans', async (_req: Request, res: Response) => {
  try {
    const docs = await plansCol().find({ visibility: 'public', active: true }).sort({ createdAt: -1 }).limit(50).toArray();
    res.json(docs.map(publicPlan));
  } catch (err) {
    console.error('List public nutrition plans error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

nutritionRouter.post('/plans', requireCoach, async (req: Request, res: Response) => {
  try {
    const parsed = readPlanInput(req.body);
    if (parsed.error || !parsed.data) {
      res.status(400).json({ error: parsed.error ?? 'Invalid nutrition plan' });
      return;
    }
    const coach = await getDb().collection('users').findOne({ _id: asObjectId(req.user!.userId)! });
    const now = nowIso();
    const doc = {
      coachId: req.user!.userId,
      coachName: displayNameOf(coach as { coachProfile?: { displayName?: string }; email?: string } | null),
      visibility: 'public' as const,
      assignedToUserId: null,
      ...parsed.data,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    const result = await plansCol().insertOne(doc as Omit<NutritionPlanDoc, '_id'> as NutritionPlanDoc);
    res.status(201).json(publicPlan({ ...doc, _id: result.insertedId } as NutritionPlanDoc));
  } catch (err) {
    console.error('Create public nutrition plan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

nutritionRouter.post('/goals', async (req: Request, res: Response) => {
  try {
    const dailyCalories = asFiniteNumber(req.body?.dailyCalories);
    const dailyProtein = asFiniteNumber(req.body?.dailyProtein);
    const dailyWater = asFiniteNumber(req.body?.dailyWater);
    const goal = req.body?.goal;
    if (dailyCalories === null || dailyCalories <= 0 || dailyProtein === null || dailyProtein < 0 || dailyWater === null || dailyWater <= 0 || !isGoal(goal)) {
      res.status(400).json({ error: 'dailyCalories, dailyProtein, dailyWater (positive numbers) and goal (cut|maintain|bulk) are required' });
      return;
    }
    const userId = req.user!.userId;
    const updatedAt = nowIso();
    const doc = await goalsCol().findOneAndUpdate(
      { userId },
      {
        $set: { dailyCalories, dailyProtein, dailyWater, goal, source: 'manual', setByCoachId: null, updatedAt },
        $setOnInsert: { userId },
      },
      { upsert: true, returnDocument: 'after' }
    );
    res.json({ goals: await publicGoalsWithCoach(doc), needsOnboarding: false });
  } catch (err) {
    console.error('Save nutrition goals error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

nutritionRouter.get('/goals', async (req: Request, res: Response) => {
  try {
    const doc = await goalsCol().findOne({ userId: req.user!.userId });
    if (!doc) {
      res.json({ goals: null, nutritionPlan: await publicPlan(await loadActiveClientPlan(req.user!.userId)), needsOnboarding: true });
      return;
    }
    res.json({ goals: await publicGoalsWithCoach(doc), nutritionPlan: await publicPlan(await loadActiveClientPlan(req.user!.userId)), needsOnboarding: false });
  } catch (err) {
    console.error('Get nutrition goals error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

nutritionRouter.post('/goals/calculate', async (req: Request, res: Response) => {
  try {
    const age = asFiniteNumber(req.body?.age);
    const weightKg = asFiniteNumber(req.body?.weightKg);
    const heightCm = asFiniteNumber(req.body?.heightCm);
    const sex = parseSex(req.body?.sex);
    const activityLevel = parseActivity(req.body?.activityLevel);
    const goal = req.body?.goal;
    if (
      age === null || age < 13 || age > 100 ||
      weightKg === null || weightKg < 30 || weightKg > 400 ||
      heightCm === null || heightCm < 100 || heightCm > 250 ||
      !sex || !activityLevel || !isGoal(goal)
    ) {
      res.status(400).json({
        error: 'age, sex (male|female), weightKg, heightCm, activityLevel (sedentary|light|moderate|active|very_active) and goal (cut|maintain|bulk) are required',
      });
      return;
    }
    res.json(calculateTargets({ age, sex, weightKg, heightCm, activityLevel, goal }));
  } catch (err) {
    console.error('Calculate nutrition goals error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

nutritionRouter.post('/log', async (req: Request, res: Response) => {
  try {
    const date = req.body?.date;
    if (typeof date !== 'string' || !DATE_RE.test(date)) {
      res.status(400).json({ error: 'date (YYYY-MM-DD) is required' });
      return;
    }
    const meal = req.body?.meal;
    const waterMl = req.body?.waterMl !== undefined ? asFiniteNumber(req.body.waterMl) : null;
    const hasMeal = meal && typeof meal === 'object';
    const hasWater = waterMl !== null;
    if (!hasMeal && !hasWater) {
      res.status(400).json({ error: 'Provide a meal object or a waterMl amount to add' });
      return;
    }
    if (hasWater && waterMl <= 0) {
      res.status(400).json({ error: 'waterMl must be a positive number' });
      return;
    }

    const userId = req.user!.userId;
    const updatedAt = nowIso();
    const logs = logsCol();

    if (hasMeal) {
      const name = typeof meal.name === 'string' ? meal.name.trim() : '';
      const calories = asFiniteNumber(meal.calories);
      const protein = asFiniteNumber(meal.protein) ?? 0;
      const carbs = asFiniteNumber(meal.carbs) ?? 0;
      const fat = asFiniteNumber(meal.fat) ?? 0;
      if (!name || calories === null || calories < 0 || protein < 0 || carbs < 0 || fat < 0) {
        res.status(400).json({ error: 'meal requires a name and non-negative calories, protein, carbs, fat' });
        return;
      }
      const mealDoc: NutritionMealDoc = {
        _id: new ObjectId().toHexString(),
        name,
        calories,
        protein,
        carbs,
        fat,
        loggedAt: updatedAt,
      };
      await logs.findOneAndUpdate(
        { userId, date },
        {
          $push: { meals: mealDoc },
          $set: { updatedAt },
          $setOnInsert: { userId, date, waterMl: 0, createdAt: updatedAt },
        },
        { upsert: true }
      );
    }

    if (hasWater) {
      await logs.findOneAndUpdate(
        { userId, date },
        {
          $inc: { waterMl },
          $set: { updatedAt },
          $setOnInsert: { userId, date, meals: [], createdAt: updatedAt },
        },
        { upsert: true }
      );
    }

    const doc = await logs.findOne({ userId, date });
    res.status(201).json(publicLog(doc, date));
  } catch (err) {
    console.error('Log nutrition error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

nutritionRouter.get('/log/:date', async (req: Request, res: Response) => {
  try {
    const date = String(req.params.date);
    if (!DATE_RE.test(date)) {
      res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      return;
    }
    const userId = req.user!.userId;
    const [logDoc, goalDoc, planDoc] = await Promise.all([
      logsCol().findOne({ userId, date }),
      goalsCol().findOne({ userId }),
      loadActiveClientPlan(userId),
    ]);
    res.json({
      ...publicLog(logDoc, date),
      goals: await publicGoalsWithCoach(goalDoc),
      nutritionPlan: publicPlan(planDoc),
      needsOnboarding: !goalDoc,
    });
  } catch (err) {
    console.error('Get nutrition log error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

nutritionRouter.delete('/log/:date/meals/:mealId', async (req: Request, res: Response) => {
  try {
    const date = String(req.params.date);
    const mealId = String(req.params.mealId);
    if (!DATE_RE.test(date) || !mealId) {
      res.status(400).json({ error: 'date (YYYY-MM-DD) and mealId are required' });
      return;
    }
    const userId = req.user!.userId;
    const result = await logsCol().findOneAndUpdate(
      { userId, date, 'meals._id': mealId },
      { $pull: { meals: { _id: mealId } }, $set: { updatedAt: nowIso() } },
      { returnDocument: 'after' }
    );
    if (!result) {
      res.status(404).json({ error: 'Meal not found for that date' });
      return;
    }
    res.json(publicLog(result, date));
  } catch (err) {
    console.error('Delete nutrition meal error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
