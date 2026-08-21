import type { Db } from 'mongodb';
import type { Equipment, ProgramType } from './types.js';

type SeedExercise = {
  seedKey: string;
  name: string;
  type: 'strength' | 'cardio';
  muscleGroup: string;
  equipment: Equipment;
  targetSets?: number;
  targetRepMin?: number;
  targetRepMax?: number;
  progressionPathSeedKeys?: string[];
};

type SeedProgramExercise = {
  seedKey: string;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
};

type SeedProgram = {
  seedKey: string;
  name: string;
  description: string;
  type: ProgramType;
  daysPerWeek: number;
  days: { dayLabel: string; exercises: SeedProgramExercise[] }[];
};

const BUILTIN_EXERCISES: SeedExercise[] = [
  { seedKey: 'front-squat', name: 'Front squat', type: 'strength', muscleGroup: 'legs', equipment: 'barbell', targetSets: 4, targetRepMin: 6, targetRepMax: 8 },
  { seedKey: 'back-squat', name: 'Back squat', type: 'strength', muscleGroup: 'legs', equipment: 'barbell', targetSets: 4, targetRepMin: 5, targetRepMax: 8 },
  { seedKey: 'romanian-deadlift', name: 'Romanian deadlift', type: 'strength', muscleGroup: 'legs', equipment: 'barbell', targetSets: 3, targetRepMin: 8, targetRepMax: 10 },
  { seedKey: 'bench-press', name: 'Bench press', type: 'strength', muscleGroup: 'chest', equipment: 'barbell', targetSets: 4, targetRepMin: 6, targetRepMax: 8 },
  { seedKey: 'overhead-press', name: 'Overhead press', type: 'strength', muscleGroup: 'shoulders', equipment: 'barbell', targetSets: 3, targetRepMin: 6, targetRepMax: 8 },
  { seedKey: 'barbell-row', name: 'Barbell row', type: 'strength', muscleGroup: 'back', equipment: 'barbell', targetSets: 4, targetRepMin: 6, targetRepMax: 8 },
  { seedKey: 'pull-up', name: 'Pull-up', type: 'strength', muscleGroup: 'back', equipment: 'bodyweight', targetSets: 3, targetRepMin: 6, targetRepMax: 10 },
  { seedKey: 'hanging-knee-raise', name: 'Hanging knee raise', type: 'strength', muscleGroup: 'core', equipment: 'bodyweight', targetSets: 3, targetRepMin: 12, targetRepMax: 15 },
  { seedKey: 'running', name: 'Running', type: 'cardio', muscleGroup: 'cardio', equipment: 'none' },
  { seedKey: 'cycling', name: 'Cycling', type: 'cardio', muscleGroup: 'cardio', equipment: 'none' },
  { seedKey: 'jump-rope', name: 'Jump rope', type: 'cardio', muscleGroup: 'cardio', equipment: 'none' },
  { seedKey: 'rowing', name: 'Rowing', type: 'cardio', muscleGroup: 'cardio', equipment: 'machine' },
  { seedKey: 'stair-climber', name: 'Stair climber', type: 'cardio', muscleGroup: 'cardio', equipment: 'machine' },
  { seedKey: 'walking', name: 'Walking', type: 'cardio', muscleGroup: 'cardio', equipment: 'none' },
  { seedKey: 'bw-squat', name: 'Bodyweight squat', type: 'strength', muscleGroup: 'legs', equipment: 'bodyweight', targetSets: 3, targetRepMin: 10, targetRepMax: 15, progressionPathSeedKeys: ['bw-squat', 'jump-squat'] },
  { seedKey: 'jump-squat', name: 'Jump squat', type: 'strength', muscleGroup: 'legs', equipment: 'bodyweight', targetSets: 3, targetRepMin: 8, targetRepMax: 12, progressionPathSeedKeys: ['bw-squat', 'jump-squat'] },
  { seedKey: 'bw-lunge', name: 'Reverse lunge', type: 'strength', muscleGroup: 'legs', equipment: 'bodyweight', targetSets: 3, targetRepMin: 10, targetRepMax: 15 },
  { seedKey: 'bw-split-squat', name: 'Bulgarian split squat', type: 'strength', muscleGroup: 'legs', equipment: 'bodyweight', targetSets: 3, targetRepMin: 8, targetRepMax: 12 },
  { seedKey: 'knee-push-up', name: 'Knee push-up', type: 'strength', muscleGroup: 'chest', equipment: 'bodyweight', targetSets: 3, targetRepMin: 10, targetRepMax: 15, progressionPathSeedKeys: ['knee-push-up', 'push-up', 'decline-push-up'] },
  { seedKey: 'push-up', name: 'Push-up', type: 'strength', muscleGroup: 'chest', equipment: 'bodyweight', targetSets: 3, targetRepMin: 8, targetRepMax: 15, progressionPathSeedKeys: ['knee-push-up', 'push-up', 'decline-push-up'] },
  { seedKey: 'decline-push-up', name: 'Decline push-up', type: 'strength', muscleGroup: 'chest', equipment: 'bodyweight', targetSets: 3, targetRepMin: 6, targetRepMax: 12, progressionPathSeedKeys: ['knee-push-up', 'push-up', 'decline-push-up'] },
  { seedKey: 'pike-push-up', name: 'Pike push-up', type: 'strength', muscleGroup: 'shoulders', equipment: 'bodyweight', targetSets: 3, targetRepMin: 8, targetRepMax: 12 },
  { seedKey: 'plank', name: 'Plank', type: 'strength', muscleGroup: 'core', equipment: 'bodyweight', targetSets: 3, targetRepMin: 20, targetRepMax: 40 },
  { seedKey: 'glute-bridge', name: 'Glute bridge', type: 'strength', muscleGroup: 'legs', equipment: 'bodyweight', targetSets: 3, targetRepMin: 12, targetRepMax: 15 },
  { seedKey: 'bird-dog', name: 'Bird dog', type: 'strength', muscleGroup: 'core', equipment: 'bodyweight', targetSets: 3, targetRepMin: 8, targetRepMax: 12 },
];

const ex = (seedKey: string, targetSets: number, targetRepMin: number, targetRepMax: number): SeedProgramExercise => ({
  seedKey, targetSets, targetRepMin, targetRepMax,
});

const BUILTIN_PROGRAMS: SeedProgram[] = [
  {
    seedKey: 'upper-lower-4',
    name: 'Upper / Lower',
    description: 'Four-day barbell split. Train on non-consecutive days when you can, then pick up the next unlogged day.',
    type: 'upper_lower',
    daysPerWeek: 4,
    days: [
      { dayLabel: 'Upper A', exercises: [ex('bench-press', 4, 6, 8), ex('barbell-row', 4, 6, 8), ex('overhead-press', 3, 6, 8), ex('pull-up', 3, 6, 10)] },
      { dayLabel: 'Lower A', exercises: [ex('back-squat', 4, 5, 8), ex('romanian-deadlift', 3, 8, 10), ex('hanging-knee-raise', 3, 12, 15)] },
      { dayLabel: 'Upper B', exercises: [ex('overhead-press', 4, 6, 8), ex('pull-up', 4, 6, 10), ex('bench-press', 3, 6, 8), ex('barbell-row', 3, 6, 8)] },
      { dayLabel: 'Lower B', exercises: [ex('front-squat', 4, 6, 8), ex('romanian-deadlift', 3, 8, 10), ex('hanging-knee-raise', 3, 12, 15)] },
    ],
  },
  {
    seedKey: 'ppl-3',
    name: 'Push / Pull / Legs',
    description: 'Classic 3-day rotation. Repeat through the week if you want six sessions.',
    type: 'push_pull_legs',
    daysPerWeek: 3,
    days: [
      { dayLabel: 'Push', exercises: [ex('bench-press', 4, 6, 8), ex('overhead-press', 3, 6, 8)] },
      { dayLabel: 'Pull', exercises: [ex('barbell-row', 4, 6, 8), ex('pull-up', 3, 6, 10)] },
      { dayLabel: 'Legs', exercises: [ex('back-squat', 4, 5, 8), ex('romanian-deadlift', 3, 8, 10), ex('hanging-knee-raise', 3, 12, 15)] },
    ],
  },
  {
    seedKey: 'ppl-6',
    name: 'Push / Pull / Legs (6 day)',
    description: 'Higher-frequency PPL with A/B variations. Six sessions per rotation.',
    type: 'push_pull_legs',
    daysPerWeek: 6,
    days: [
      { dayLabel: 'Push A', exercises: [ex('bench-press', 4, 6, 8), ex('overhead-press', 3, 6, 8)] },
      { dayLabel: 'Pull A', exercises: [ex('barbell-row', 4, 6, 8), ex('pull-up', 3, 6, 10)] },
      { dayLabel: 'Legs A', exercises: [ex('back-squat', 4, 5, 8), ex('romanian-deadlift', 3, 8, 10), ex('hanging-knee-raise', 3, 12, 15)] },
      { dayLabel: 'Push B', exercises: [ex('overhead-press', 4, 6, 8), ex('bench-press', 3, 6, 8)] },
      { dayLabel: 'Pull B', exercises: [ex('pull-up', 4, 6, 10), ex('barbell-row', 3, 6, 8)] },
      { dayLabel: 'Legs B', exercises: [ex('front-squat', 4, 6, 8), ex('romanian-deadlift', 3, 8, 10), ex('hanging-knee-raise', 3, 12, 15)] },
    ],
  },
  {
    seedKey: 'full-body-3',
    name: 'Full Body',
    description: 'Three full-body days. Rest as needed between sessions; the next unlogged day is waiting when you come back.',
    type: 'full_body',
    daysPerWeek: 3,
    days: [
      { dayLabel: 'Full Body A', exercises: [ex('back-squat', 4, 5, 8), ex('bench-press', 4, 6, 8), ex('barbell-row', 4, 6, 8)] },
      { dayLabel: 'Full Body B', exercises: [ex('front-squat', 4, 6, 8), ex('overhead-press', 3, 6, 8), ex('pull-up', 3, 6, 10)] },
      { dayLabel: 'Full Body C', exercises: [ex('romanian-deadlift', 3, 8, 10), ex('bench-press', 3, 6, 8), ex('hanging-knee-raise', 3, 12, 15)] },
    ],
  },
  {
    seedKey: 'home-bodyweight-3',
    name: 'Home Bodyweight (3 day)',
    description: 'No equipment. Rep targets adapt to your goal; progress by adding reps or a harder variation.',
    type: 'home_bodyweight',
    daysPerWeek: 3,
    days: [
      { dayLabel: 'Home A', exercises: [ex('bw-squat', 3, 10, 15), ex('push-up', 3, 8, 15), ex('bw-lunge', 3, 10, 15), ex('plank', 3, 20, 40)] },
      { dayLabel: 'Home B', exercises: [ex('bw-squat', 3, 10, 15), ex('pike-push-up', 3, 8, 12), ex('glute-bridge', 3, 12, 15), ex('plank', 3, 20, 40)] },
      { dayLabel: 'Home C', exercises: [ex('bw-lunge', 3, 10, 15), ex('push-up', 3, 8, 15), ex('glute-bridge', 3, 12, 15), ex('bird-dog', 3, 8, 12)] },
    ],
  },
  {
    seedKey: 'home-bodyweight-4',
    name: 'Home Bodyweight (4 day)',
    description: 'Four no-equipment days. Knee push-ups progress toward decline push-ups as you hit the top of the range.',
    type: 'home_bodyweight',
    daysPerWeek: 4,
    days: [
      { dayLabel: 'Home A', exercises: [ex('bw-squat', 3, 10, 15), ex('knee-push-up', 3, 10, 15), ex('plank', 3, 20, 40)] },
      { dayLabel: 'Home B', exercises: [ex('bw-lunge', 3, 10, 15), ex('glute-bridge', 3, 12, 15), ex('bird-dog', 3, 8, 12)] },
      { dayLabel: 'Home C', exercises: [ex('bw-squat', 3, 10, 15), ex('push-up', 3, 8, 15), ex('plank', 3, 20, 40)] },
      { dayLabel: 'Home D', exercises: [ex('bw-split-squat', 3, 8, 12), ex('pike-push-up', 3, 8, 12), ex('glute-bridge', 3, 12, 15)] },
    ],
  },
];

export async function seedBuiltinExercises(db: Db): Promise<Map<string, string>> {
  const col = db.collection('exercises');
  for (const exercise of BUILTIN_EXERCISES) {
    await col.updateOne(
      { seedKey: exercise.seedKey },
      {
        $set: {
          name: exercise.name,
          type: exercise.type,
          muscleGroup: exercise.muscleGroup,
          equipment: exercise.equipment,
          targetSets: exercise.targetSets ?? null,
          targetRepMin: exercise.targetRepMin ?? null,
          targetRepMax: exercise.targetRepMax ?? null,
          createdBy: null,
          archived: false,
        },
        $setOnInsert: { seedKey: exercise.seedKey },
      },
      { upsert: true }
    );
  }

  const docs = await col.find({ seedKey: { $in: BUILTIN_EXERCISES.map((e) => e.seedKey) } }).toArray();
  const idBySeed = new Map(docs.map((doc) => [String(doc.seedKey), doc._id.toHexString()]));

  for (const exercise of BUILTIN_EXERCISES) {
    const path = (exercise.progressionPathSeedKeys ?? [])
      .map((key) => idBySeed.get(key))
      .filter((id): id is string => Boolean(id));
    await col.updateOne(
      { seedKey: exercise.seedKey },
      { $set: { progressionPath: path } }
    );
  }

  return idBySeed;
}

export async function seedBuiltinPrograms(db: Db, idBySeed: Map<string, string>): Promise<void> {
  const col = db.collection('programs');
  for (const program of BUILTIN_PROGRAMS) {
    const days = program.days.map((day) => ({
      dayLabel: day.dayLabel,
      exercises: day.exercises
        .map((item) => {
          const exerciseId = idBySeed.get(item.seedKey);
          if (!exerciseId) return null;
          return {
            exerciseId,
            targetSets: item.targetSets,
            targetRepMin: item.targetRepMin,
            targetRepMax: item.targetRepMax,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    }));
    await col.updateOne(
      { seedKey: program.seedKey },
      {
        $set: {
          name: program.name,
          description: program.description,
          type: program.type,
          daysPerWeek: program.daysPerWeek,
          createdBy: null,
          days,
        },
        $setOnInsert: { seedKey: program.seedKey, createdAt: new Date().toISOString() },
      },
      { upsert: true }
    );
  }
}
