import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

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
      res.json({ goals: null, needsOnboarding: true });
      return;
    }
    res.json({ goals: await publicGoalsWithCoach(doc), needsOnboarding: false });
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
    const [logDoc, goalDoc] = await Promise.all([
      logsCol().findOne({ userId, date }),
      goalsCol().findOne({ userId }),
    ]);
    res.json({
      ...publicLog(logDoc, date),
      goals: await publicGoalsWithCoach(goalDoc),
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
