/**
 * Fetches Free Exercise DB once and writes referenceImageUrl +
 * referenceInstructions onto seeded exercises. Run manually:
 *   npm run import-exercise-refs
 * Optional: npm run import-exercise-refs -- --dry-run
 */
import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { closeDb, connectDb, getDb } from '../db.js';

const CATALOG_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

type CatalogExercise = {
  id: string;
  name: string;
  equipment: string | null;
  category?: string | null;
  primaryMuscles: string[];
  instructions: string[];
  images: string[];
};

type SeedDoc = {
  _id: ObjectId;
  seedKey?: string;
  name: string;
  equipment?: string;
};

/** High-confidence aliases where names differ but the movement is the same. */
const ALIASES: Record<string, string> = {
  'front-squat': 'Front_Barbell_Squat',
  'back-squat': 'Barbell_Squat',
  'romanian-deadlift': 'Romanian_Deadlift',
  'bench-press': 'Barbell_Bench_Press_-_Medium_Grip',
  'overhead-press': 'Standing_Military_Press',
  'barbell-row': 'Bent_Over_Barbell_Row',
  'pull-up': 'Pullups',
  'running': 'Running_Treadmill',
  'cycling': 'Bicycling',
  'jump-rope': 'Rope_Jumping',
  'rowing': 'Rowing_Stationary',
  'stair-climber': 'Stairmaster',
  'walking': 'Walking_Treadmill',
  'bw-squat': 'Bodyweight_Squat',
  'jump-squat': 'Freehand_Jump_Squat',
  'push-up': 'Pushups',
  'decline-push-up': 'Decline_Push-Up',
  'plank': 'Plank',
  'glute-bridge': 'Butt_Lift_Bridge',
};

const STOP = new Set(['a', 'an', 'the', 'with', 'of', 'to', 'and', 'on', 'for', 'in', 'from']);

const TOKEN_SYNONYMS: Record<string, string> = {
  pushups: 'pushup',
  pushup: 'pushup',
  pullups: 'pullup',
  pullup: 'pullup',
  squats: 'squat',
  lunges: 'lunge',
  raises: 'raise',
  bicycling: 'cycling',
  bicycle: 'cycling',
  stairmaster: 'stairclimber',
  military: 'overhead',
  freehand: 'bodyweight',
  body: 'bodyweight',
};

const LIGHT_EXTRA = new Set([
  'barbell', 'dumbbell', 'bodyweight', 'machine', 'none', 'body', 'only',
  'standing', 'bent', 'over', 'medium', 'grip', 'treadmill', 'stationary',
  'full', 'freehand', 'palms', 'clean',
]);

const HEAVY_EXTRA = new Set([
  'incline', 'decline', 'smith', 'kettlebell', 'cable', 'seated',
  'kneeling', 'crossover', 'deficit', 'guillotine', 'close', 'wide',
  'reverse', 'bulgarian', 'pike', 'band', 'bands', 'chains', 'box',
  'elevated', 'suspended', 'plyo', 'weighted', 'single', 'one', 'arm',
  'leg', 'rear', 'side', 'hammer', 'arnold', 'sumo', 'hack', 'goblet',
  'front', 'back', 'jump', 'knee', 'hanging',
]);

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/push-?ups?/g, 'pushup')
    .replace(/pull-?ups?/g, 'pullup')
    .replace(/[-_/(),.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(name: string): string[] {
  return normalize(name)
    .split(' ')
    .map((token) => TOKEN_SYNONYMS[token] ?? token)
    .filter((token) => token && !STOP.has(token) && token !== 'only');
}

function catalogEquipment(value: string | null): string {
  if (!value) return '';
  if (value === 'body only') return 'bodyweight';
  return value;
}

function allCorePresent(ours: string[], theirs: string[]): boolean {
  const catalog = new Set(theirs);
  return ours.every((token) => catalog.has(token));
}

function heavyConflict(ours: string[], theirs: string[]): boolean {
  const oursSet = new Set(ours);
  return theirs.some((token) => HEAVY_EXTRA.has(token) && !oursSet.has(token) && !LIGHT_EXTRA.has(token));
}

function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (value: string) => {
    const counts = new Map<string, number>();
    for (let i = 0; i < value.length - 1; i++) {
      const gram = value.slice(i, i + 2);
      counts.set(gram, (counts.get(gram) ?? 0) + 1);
    }
    return counts;
  };
  const left = bigrams(a);
  const right = bigrams(b);
  let overlap = 0;
  for (const [gram, count] of left) {
    overlap += Math.min(count, right.get(gram) ?? 0);
  }
  return (2 * overlap) / ((a.length - 1) + (b.length - 1));
}

function scoreMatch(seedName: string, seedEquipment: string, candidate: CatalogExercise): number {
  if (candidate.category === 'stretching' || candidate.category === 'plyometrics') return 0;
  const ours = tokens(seedName);
  const theirs = tokens(candidate.name);
  const oursNorm = ours.join(' ');
  const theirsNorm = theirs.join(' ');
  if (!ours.length || !theirs.length) return 0;
  if (oursNorm === theirsNorm) return 1;
  if (!allCorePresent(ours, theirs)) return 0;
  if (heavyConflict(ours, theirs)) return 0;
  const tokenRecall = ours.filter((token) => theirs.includes(token)).length / ours.length;
  if (tokenRecall < 1) return 0;
  const extra = theirs.filter((token) => !ours.includes(token)).length;
  const compactness = 1 / (1 + extra * 0.12);
  const nameDice = dice(oursNorm, theirsNorm);
  let score = 0.55 * tokenRecall * compactness + 0.45 * nameDice;
  const theirsEq = catalogEquipment(candidate.equipment);
  if (seedEquipment && theirsEq && seedEquipment === theirsEq) score += 0.05;
  if (seedEquipment && theirsEq && seedEquipment !== theirsEq && theirsEq !== 'other') score -= 0.08;
  return score;
}

function pickMatch(seed: SeedDoc, byId: Map<string, CatalogExercise>, catalog: CatalogExercise[]): CatalogExercise | null {
  const aliasId = seed.seedKey ? ALIASES[seed.seedKey] : undefined;
  if (aliasId) return byId.get(aliasId) ?? null;

  const equipment = typeof seed.equipment === 'string' ? seed.equipment : '';
  const ranked = catalog
    .map((candidate) => ({ candidate, score: scoreMatch(seed.name, equipment, candidate) }))
    .filter((row) => row.score >= 0.72)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return null;
  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 0.06) return null;
  return ranked[0].candidate;
}

function imageUrl(candidate: CatalogExercise): string | null {
  const path = candidate.images.find((item) => typeof item === 'string' && item.trim());
  return path ? `${IMAGE_BASE}${path}` : null;
}

function steps(candidate: CatalogExercise): string[] {
  return (candidate.instructions ?? []).filter((step) => typeof step === 'string' && step.trim().length > 0);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`Failed to fetch Free Exercise DB (${res.status})`);
  const catalog = (await res.json()) as CatalogExercise[];
  const byId = new Map(catalog.map((item) => [item.id, item]));

  await connectDb();
  try {
    const col = getDb().collection('exercises');
    const seeds = await col.find({ seedKey: { $exists: true, $type: 'string' } }).toArray() as unknown as SeedDoc[];

    const matched: string[] = [];
    const skipped: string[] = [];

    for (const seed of seeds) {
      const hit = pickMatch(seed, byId, catalog);
      if (!hit) {
        skipped.push(`${seed.seedKey ?? seed.name}`);
        continue;
      }
      const referenceImageUrl = imageUrl(hit);
      const referenceInstructions = steps(hit);
      matched.push(`${seed.seedKey ?? seed.name} → ${hit.name} (${hit.id})`);
      if (!dryRun) {
        await col.updateOne(
          { _id: seed._id },
          { $set: { referenceImageUrl, referenceInstructions, referenceSourceId: hit.id } }
        );
      }
    }

    console.log(dryRun ? 'Dry run — no documents written.' : 'Updated seeded exercises.');
    console.log(`Matched ${matched.length}:`);
    for (const line of matched) console.log(`  ${line}`);
    console.log(`Left unmatched ${skipped.length} (no safe name match):`);
    for (const line of skipped) console.log(`  ${line}`);
  } finally {
    void closeDb();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
