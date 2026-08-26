import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { requireAuth, requireCoach } from '../middleware/auth.js';
import { notifyUserPush } from '../push.js';

export const coachRequestsRouter = Router();
coachRequestsRouter.use(requireAuth);

function asObjectId(value: unknown): ObjectId | null {
  if (typeof value !== 'string' || !/^[a-fA-F0-9]{24}$/.test(value)) return null;
  try {
    return new ObjectId(value);
  } catch {
    return null;
  }
}

function displayNameOf(doc: { coachProfile?: { displayName?: string }; email?: string } | null) {
  const name = doc?.coachProfile?.displayName?.trim();
  if (name) return name;
  const email = typeof doc?.email === 'string' ? doc.email : '';
  return email.split('@')[0] || 'Coach';
}

async function hydrateRequests(docs: Array<Record<string, unknown> & { _id: ObjectId }>) {
  const coachIds = [...new Set(docs.map((doc) => String(doc.coachId ?? '')).map(asObjectId).filter((id): id is ObjectId => Boolean(id)))];
  const athleteIds = [...new Set(docs.map((doc) => String(doc.athleteId ?? '')).map(asObjectId).filter((id): id is ObjectId => Boolean(id)))];
  const users = await getDb().collection('users').find({
    _id: { $in: [...coachIds, ...athleteIds] },
  }).toArray();
  const byId = new Map(users.map((user) => [user._id.toHexString(), user]));
  return docs.map((doc) => {
    const coach = byId.get(String(doc.coachId));
    const athlete = byId.get(String(doc.athleteId));
    return {
      id: doc._id.toHexString(),
      athleteId: String(doc.athleteId ?? ''),
      coachId: String(doc.coachId ?? ''),
      message: String(doc.message ?? ''),
      status: doc.status === 'accepted' || doc.status === 'declined' || doc.status === 'revoked' ? doc.status : 'pending',
      createdAt: String(doc.createdAt ?? ''),
      coachName: displayNameOf(coach as { coachProfile?: { displayName?: string }; email?: string } | null),
      athleteLabel: typeof athlete?.email === 'string' ? athlete.email : 'Athlete',
    };
  });
}

coachRequestsRouter.get('/', requireCoach, async (req: Request, res: Response) => {
  try {
    const docs = await getDb().collection('coachRequests').find({ coachId: req.user!.userId }).sort({ createdAt: -1 }).toArray();
    res.json(await hydrateRequests(docs as Array<Record<string, unknown> & { _id: ObjectId }>));
  } catch (err) {
    console.error('List coach requests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

coachRequestsRouter.get('/sent', async (req: Request, res: Response) => {
  try {
    const docs = await getDb().collection('coachRequests').find({ athleteId: req.user!.userId }).sort({ createdAt: -1 }).toArray();
    res.json(await hydrateRequests(docs as Array<Record<string, unknown> & { _id: ObjectId }>));
  } catch (err) {
    console.error('List sent coach requests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

coachRequestsRouter.get('/:id/contact-info', async (req: Request, res: Response) => {
  try {
    const id = asObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid request id' });
      return;
    }
    const request = await getDb().collection('coachRequests').findOne({ _id: id });
    if (!request || request.athleteId !== req.user!.userId) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (request.status !== 'accepted') {
      res.status(403).json({ error: 'Contact info is available only after the coach accepts' });
      return;
    }
    const coachId = asObjectId(String(request.coachId));
    const coach = coachId ? await getDb().collection('users').findOne({ _id: coachId, role: 'coach' }) : null;
    if (!coach) {
      res.status(404).json({ error: 'Coach not found' });
      return;
    }
    const profile = (coach.coachProfile ?? {}) as { contactPreference?: string; email?: string; phone?: string };
    const preference = profile.contactPreference === 'email' || profile.contactPreference === 'phone' || profile.contactPreference === 'app'
      ? profile.contactPreference
      : 'app';
    if (preference === 'email') {
      const email = typeof profile.email === 'string' ? profile.email.trim() : '';
      if (!email) {
        res.status(404).json({ error: 'This coach has not shared an email yet' });
        return;
      }
      res.json({ method: 'email', email, phone: null });
      return;
    }
    if (preference === 'phone') {
      const phone = typeof profile.phone === 'string' ? profile.phone.trim() : '';
      if (!phone) {
        res.status(404).json({ error: 'This coach has not shared a phone number yet' });
        return;
      }
      res.json({ method: 'phone', email: null, phone });
      return;
    }
    res.json({ method: 'app', email: null, phone: null });
  } catch (err) {
    console.error('Get contact info error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

coachRequestsRouter.patch('/:id/revoke', async (req: Request, res: Response) => {
  try {
    const id = asObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid request id' });
      return;
    }
    const existing = await getDb().collection('coachRequests').findOne({ _id: id, athleteId: req.user!.userId });
    if (!existing) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (existing.status !== 'accepted') {
      res.status(409).json({ error: 'Only an accepted coaching relationship can be revoked' });
      return;
    }
    await getDb().collection('coachRequests').updateOne(
      { _id: id },
      { $set: { status: 'revoked', revokedAt: new Date().toISOString() } }
    );
    const updated = await getDb().collection('coachRequests').findOne({ _id: id });
    const [hydrated] = await hydrateRequests([updated as Record<string, unknown> & { _id: ObjectId }]);
    res.json(hydrated);
  } catch (err) {
    console.error('Revoke coach request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

coachRequestsRouter.patch('/:id', requireCoach, async (req: Request, res: Response) => {
  try {
    const id = asObjectId(req.params.id);
    const status = req.body?.status;
    if (!id) {
      res.status(400).json({ error: 'Invalid request id' });
      return;
    }
    if (status !== 'accepted' && status !== 'declined') {
      res.status(400).json({ error: 'status must be accepted or declined' });
      return;
    }
    const existing = await getDb().collection('coachRequests').findOne({ _id: id, coachId: req.user!.userId });
    if (!existing) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (existing.status !== 'pending') {
      res.status(409).json({ error: 'This request has already been answered' });
      return;
    }
    await getDb().collection('coachRequests').updateOne(
      { _id: id },
      { $set: { status, respondedAt: new Date().toISOString() } }
    );
    const updated = await getDb().collection('coachRequests').findOne({ _id: id });
    const athleteId = typeof existing.athleteId === 'string' ? existing.athleteId : '';
    if (athleteId) {
      notifyUserPush({
        userId: athleteId,
        pref: 'coachRequestResponse',
        title: status === 'accepted' ? 'Coach accepted' : 'Coach declined',
        body:
          status === 'accepted'
            ? 'Your coach accepted your request'
            : 'Your coaching request was declined',
        data: { type: 'coach_request_response', status, requestId: id.toHexString() },
      });
    }
    const [hydrated] = await hydrateRequests([updated as Record<string, unknown> & { _id: ObjectId }]);
    res.json(hydrated);
  } catch (err) {
    console.error('Patch coach request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
