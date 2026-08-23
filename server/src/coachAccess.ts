import { ObjectId } from 'mongodb';
import { getDb } from './db.js';

export function asObjectId(value: unknown): ObjectId | null {
  if (typeof value !== 'string' || !/^[a-fA-F0-9]{24}$/.test(value)) return null;
  try {
    return new ObjectId(value);
  } catch {
    return null;
  }
}

export function displayLabelOf(doc: { coachProfile?: { displayName?: string }; email?: string } | null | undefined) {
  const name = doc?.coachProfile?.displayName?.trim();
  if (name) return name;
  const email = typeof doc?.email === 'string' ? doc.email : '';
  return email.split('@')[0] || 'Athlete';
}

export async function findAcceptedCoaching(coachId: string, athleteId: string) {
  return getDb().collection('coachRequests').findOne({
    coachId,
    athleteId,
    status: 'accepted',
  });
}

export async function requireAcceptedCoaching(coachId: string, athleteId: string) {
  if (!asObjectId(athleteId) || athleteId === coachId) return null;
  return findAcceptedCoaching(coachId, athleteId);
}
