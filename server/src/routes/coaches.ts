import { Router, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
import { optionalAuth, requireAuth, requireCoach } from '../middleware/auth.js';
import { parseVideoSource } from '../videoUrl.js';
import { coachClientsRouter } from './coachClients.js';
import {
  COACH_SPECIALTIES,
  VIDEO_REPORT_REASONS,
  type CoachSpecialty,
  type VideoReportReason,
} from '../types.js';
import { notifyUserPush } from '../push.js';

export const coachesRouter = Router();
coachesRouter.use(coachClientsRouter);

const MAX_COACH_VIDEO_DURATION_MS = 90_000;
const MAX_COACH_VIDEO_BYTES = 250 * 1024 * 1024;
const VIDEO_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'coach-videos');
const ALLOWED_VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm']);

fs.mkdirSync(VIDEO_UPLOAD_DIR, { recursive: true });

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, VIDEO_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
      cb(null, `${new ObjectId().toHexString()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_COACH_VIDEO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_VIDEO_MIME.has(file.mimetype)) {
      cb(new Error('Upload an MP4, MOV, M4V, or WebM video.'));
      return;
    }
    cb(null, true);
  },
});

function asObjectId(value: unknown): ObjectId | null {
  if (typeof value !== 'string' || !/^[a-fA-F0-9]{24}$/.test(value)) return null;
  try {
    return new ObjectId(value);
  } catch {
    return null;
  }
}

function asPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isInteger(n) || n < 1) return fallback;
  return n;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isSpecialty(value: unknown): value is CoachSpecialty {
  return typeof value === 'string' && (COACH_SPECIALTIES as readonly string[]).includes(value);
}

function isReportReason(value: unknown): value is VideoReportReason {
  return typeof value === 'string' && (VIDEO_REPORT_REASONS as readonly string[]).includes(value);
}

function displayNameOf(doc: { coachProfile?: { displayName?: string }; email?: string }) {
  const name = doc.coachProfile?.displayName?.trim();
  if (name) return name;
  const email = typeof doc.email === 'string' ? doc.email : '';
  return email.split('@')[0] || 'Coach';
}

function publicCoach(doc: Record<string, unknown> & { _id: ObjectId }, extras?: { uniqueViews?: number; videoCount?: number }) {
  const profile = (doc.coachProfile ?? {}) as Record<string, unknown>;
  const specialties = Array.isArray(profile.specialties)
    ? profile.specialties.filter((item): item is CoachSpecialty => isSpecialty(item))
    : [];
  return {
    id: doc._id.toHexString(),
    displayName: displayNameOf(doc as { coachProfile?: { displayName?: string }; email?: string }),
    bio: typeof profile.bio === 'string' ? profile.bio : '',
    specialties,
    certifications: typeof profile.certifications === 'string' ? profile.certifications : '',
    uniqueViews: extras?.uniqueViews ?? 0,
    videoCount: extras?.videoCount ?? 0,
  };
}

function publicVideo(doc: Record<string, unknown> & { _id: ObjectId }) {
  const uniqueViewerIds = Array.isArray(doc.uniqueViewerIds) ? doc.uniqueViewerIds : [];
  return {
    id: doc._id.toHexString(),
    coachId: String(doc.coachId ?? ''),
    title: String(doc.title ?? ''),
    description: String(doc.description ?? ''),
    videoUrl: String(doc.videoUrl ?? ''),
    thumbnailUrl: typeof doc.thumbnailUrl === 'string' ? doc.thumbnailUrl : null,
    youtubeId: typeof doc.youtubeId === 'string' ? doc.youtubeId : null,
    kind: doc.kind === 'file' ? 'file' as const : 'youtube' as const,
    exerciseTag: typeof doc.exerciseTag === 'string' ? doc.exerciseTag : null,
    viewCount: Number(doc.viewCount) || 0,
    uniqueViews: uniqueViewerIds.length,
    createdAt: String(doc.createdAt ?? ''),
  };
}

function rankScoreFromVideos(videos: Array<{ uniqueViewerIds?: unknown }>) {
  return videos.reduce((sum, video) => {
    const ids = Array.isArray(video.uniqueViewerIds) ? video.uniqueViewerIds : [];
    return sum + ids.length;
  }, 0);
}

async function loadCoachVideos(coachId: string) {
  return getDb().collection('coachVideos').find({ coachId }).sort({ createdAt: -1 }).toArray();
}

function buildPublicUploadUrl(req: Request, filename: string) {
  return `${req.protocol}://${req.get('host')}/uploads/coach-videos/${filename}`;
}

function cleanupUploadedFile(file?: Express.Multer.File) {
  if (!file?.path) return;
  fs.unlink(file.path, (err) => {
    if (err) console.error('Upload cleanup error:', err);
  });
}

function catalogProgram(doc: Record<string, unknown> & { _id: ObjectId }, coachName: string) {
  const days = Array.isArray(doc.days) ? doc.days : [];
  return {
    id: doc._id.toHexString(),
    name: String(doc.name ?? ''),
    description: String(doc.description ?? ''),
    type: typeof doc.type === 'string' ? doc.type : 'custom',
    daysPerWeek: Number(doc.daysPerWeek) || days.length,
    createdBy: String(doc.createdBy ?? ''),
    isCustom: true,
    assignedToUserId: null,
    createdByCoachId: String(doc.createdBy ?? ''),
    assignedByCoachName: coachName,
    days: days.map((day) => {
      const raw = day as { dayLabel?: string; exercises?: unknown[] };
      return {
        dayLabel: typeof raw.dayLabel === 'string' ? raw.dayLabel : 'Day',
        exercises: (Array.isArray(raw.exercises) ? raw.exercises : []).map((item) => {
          const row = item as { exerciseId?: string; targetSets?: number; targetRepMin?: number; targetRepMax?: number };
          return {
            exerciseId: typeof row.exerciseId === 'string' ? row.exerciseId : '',
            targetSets: Number(row.targetSets) || 3,
            targetRepMin: Number(row.targetRepMin) || 8,
            targetRepMax: Number(row.targetRepMax) || 12,
          };
        }),
      };
    }),
  };
}

async function loadCoachCatalog(coachId: string, coachName: string) {
  const docs = await getDb().collection('programs').find({
    createdBy: coachId,
    $or: [{ assignedToUserId: null }, { assignedToUserId: { $exists: false } }],
  }).sort({ createdAt: -1 }).toArray();
  return docs.map((doc) => catalogProgram(doc as Record<string, unknown> & { _id: ObjectId }, coachName));
}

coachesRouter.post('/videos/upload', requireAuth, requireCoach, (req: Request, res: Response) => {
  videoUpload.single('video')(req, res, async (uploadErr) => {
    const file = req.file;
    try {
      if (uploadErr) {
        cleanupUploadedFile(file);
        res.status(400).json({ error: uploadErr instanceof Error ? uploadErr.message : 'Could not upload video' });
        return;
      }
      if (!file) {
        res.status(400).json({ error: 'video file is required' });
        return;
      }
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      if (!title || title.length > 120) {
        cleanupUploadedFile(file);
        res.status(400).json({ error: 'title is required (max 120 characters)' });
        return;
      }
      const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
      if (description.length > 2000) {
        cleanupUploadedFile(file);
        res.status(400).json({ error: 'description must be 2000 characters or less' });
        return;
      }
      const durationMs = Number(req.body?.durationMs);
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        cleanupUploadedFile(file);
        res.status(400).json({ error: 'video duration is required' });
        return;
      }
      if (durationMs > MAX_COACH_VIDEO_DURATION_MS) {
        cleanupUploadedFile(file);
        res.status(400).json({ error: 'Video must be 1:30 or shorter' });
        return;
      }
      let exerciseTag: string | null = null;
      const rawTag = typeof req.body?.exerciseTag === 'string' ? req.body.exerciseTag.trim() : '';
      if (rawTag) {
        const exerciseId = asObjectId(rawTag);
        if (!exerciseId) {
          cleanupUploadedFile(file);
          res.status(400).json({ error: 'exerciseTag must be a valid exercise id' });
          return;
        }
        const exercise = await getDb().collection('exercises').findOne({ _id: exerciseId, archived: { $ne: true } });
        if (!exercise) {
          cleanupUploadedFile(file);
          res.status(400).json({ error: 'exerciseTag does not match an exercise' });
          return;
        }
        exerciseTag = rawTag;
      }
      const data = {
        coachId: req.user!.userId,
        title,
        description,
        videoUrl: buildPublicUploadUrl(req, file.filename),
        thumbnailUrl: null,
        youtubeId: null,
        kind: 'file' as const,
        exerciseTag,
        durationMs,
        mimeType: file.mimetype,
        originalName: file.originalname,
        sizeBytes: file.size,
        viewCount: 0,
        uniqueViewerIds: [] as string[],
        createdAt: new Date().toISOString(),
      };
      const result = await getDb().collection('coachVideos').insertOne(data);
      res.status(201).json(publicVideo({ ...data, _id: result.insertedId }));
    } catch (err) {
      cleanupUploadedFile(file);
      console.error('Upload coach video error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

coachesRouter.post('/videos', requireAuth, requireCoach, async (req: Request, res: Response) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title || title.length > 120) {
      res.status(400).json({ error: 'title is required (max 120 characters)' });
      return;
    }
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    if (description.length > 2000) {
      res.status(400).json({ error: 'description must be 2000 characters or less' });
      return;
    }
    const parsed = parseVideoSource(
      typeof req.body?.videoUrl === 'string' ? req.body.videoUrl : '',
      typeof req.body?.thumbnailUrl === 'string' ? req.body.thumbnailUrl : undefined
    );
    if (parsed.error || !parsed.source) {
      res.status(400).json({ error: parsed.error ?? 'Invalid videoUrl' });
      return;
    }
    let exerciseTag: string | null = null;
    const rawTag = typeof req.body?.exerciseTag === 'string' ? req.body.exerciseTag.trim() : '';
    if (rawTag) {
      const exerciseId = asObjectId(rawTag);
      if (!exerciseId) {
        res.status(400).json({ error: 'exerciseTag must be a valid exercise id' });
        return;
      }
      const exercise = await getDb().collection('exercises').findOne({ _id: exerciseId, archived: { $ne: true } });
      if (!exercise) {
        res.status(400).json({ error: 'exerciseTag does not match an exercise' });
        return;
      }
      exerciseTag = rawTag;
    }
    const data = {
      coachId: req.user!.userId,
      title,
      description,
      videoUrl: parsed.source.videoUrl,
      thumbnailUrl: parsed.source.thumbnailUrl,
      youtubeId: parsed.source.youtubeId,
      kind: parsed.source.kind,
      exerciseTag,
      viewCount: 0,
      uniqueViewerIds: [] as string[],
      createdAt: new Date().toISOString(),
    };
    const result = await getDb().collection('coachVideos').insertOne(data);
    res.status(201).json(publicVideo({ ...data, _id: result.insertedId }));
  } catch (err) {
    console.error('Create coach video error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

coachesRouter.post('/videos/:id/view', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = asObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid video id' });
      return;
    }
    const userId = req.user!.userId;
    const existing = await getDb().collection('coachVideos').findOne({ _id: id });
    if (!existing) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }
    const uniqueViewerIds = Array.isArray(existing.uniqueViewerIds) ? existing.uniqueViewerIds : [];
    if (existing.coachId === userId) {
      res.json({ counted: false, viewCount: Number(existing.viewCount) || 0, uniqueViews: uniqueViewerIds.length });
      return;
    }
    const result = await getDb().collection('coachVideos').findOneAndUpdate(
      { _id: id, uniqueViewerIds: { $ne: userId } },
      { $inc: { viewCount: 1 }, $addToSet: { uniqueViewerIds: userId } },
      { returnDocument: 'after' }
    );
    if (result) {
      res.json({ counted: true, viewCount: Number(result.viewCount) || 0, uniqueViews: Array.isArray(result.uniqueViewerIds) ? result.uniqueViewerIds.length : 0 });
      return;
    }
    res.json({ counted: false, viewCount: Number(existing.viewCount) || 0, uniqueViews: uniqueViewerIds.length });
  } catch (err) {
    console.error('Record video view error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

coachesRouter.post('/videos/:id/report', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = asObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid video id' });
      return;
    }
    if (!isReportReason(req.body?.reason)) {
      res.status(400).json({ error: 'reason must be spam, inappropriate, misleading, or other' });
      return;
    }
    const video = await getDb().collection('coachVideos').findOne({ _id: id });
    if (!video) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }
    const details = typeof req.body?.details === 'string' ? req.body.details.trim().slice(0, 500) : '';
    try {
      await getDb().collection('videoReports').insertOne({
        videoId: id.toHexString(),
        reporterId: req.user!.userId,
        reason: req.body.reason,
        details,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 11000) {
        res.status(409).json({ error: 'You already reported this video' });
        return;
      }
      throw err;
    }
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('Report video error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

coachesRouter.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const page = asPositiveInt(req.query.page, 1);
    const limit = Math.min(asPositiveInt(req.query.limit, 20), 50);
    const specialty = isSpecialty(req.query.specialty) ? req.query.specialty : null;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const sort = req.query.sort === 'name' ? 'name' : 'rank';
    const match: Record<string, unknown> = {
      role: 'coach',
      'coachProfile.displayName': { $exists: true, $nin: [null, ''] },
    };
    if (specialty) match['coachProfile.specialties'] = specialty;
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      match.$or = [
        { 'coachProfile.displayName': rx },
        { 'coachProfile.bio': rx },
      ];
    }
    const pipeline = [
      { $match: match },
      { $addFields: { idStr: { $toString: '$_id' } } },
      { $lookup: { from: 'coachVideos', localField: 'idStr', foreignField: 'coachId', as: 'videos' } },
      {
        $addFields: {
          uniqueViews: {
            $sum: {
              $map: {
                input: '$videos',
                as: 'video',
                in: { $size: { $ifNull: ['$$video.uniqueViewerIds', []] } },
              },
            },
          },
          videoCount: { $size: '$videos' },
        },
      },
      { $project: { videos: 0, password: 0, coachProfile: { email: 0, phone: 0 } } },
      { $sort: sort === 'name' ? { 'coachProfile.displayName': 1 as const } : { uniqueViews: -1 as const, 'coachProfile.displayName': 1 as const } },
      {
        $facet: {
          items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          meta: [{ $count: 'total' }],
        },
      },
    ];
    const [facet] = await getDb().collection('users').aggregate(pipeline).toArray();
    const items = Array.isArray(facet?.items) ? facet.items : [];
    const total = Number(facet?.meta?.[0]?.total) || 0;
    res.json({
      page,
      limit,
      total,
      coaches: items.map((doc: Record<string, unknown> & { _id: ObjectId }) =>
        publicCoach(doc, { uniqueViews: Number(doc.uniqueViews) || 0, videoCount: Number(doc.videoCount) || 0 })
      ),
    });
  } catch (err) {
    console.error('List coaches error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

coachesRouter.get('/:id/videos', optionalAuth, async (req: Request, res: Response) => {
  try {
    const id = asObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid coach id' });
      return;
    }
    const coach = await getDb().collection('users').findOne({ _id: id, role: 'coach' });
    if (!coach) {
      res.status(404).json({ error: 'Coach not found' });
      return;
    }
    const videos = await loadCoachVideos(id.toHexString());
    res.json(videos.map((doc) => publicVideo(doc as Record<string, unknown> & { _id: ObjectId })));
  } catch (err) {
    console.error('List coach videos error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

coachesRouter.get('/:id/programs', optionalAuth, async (req: Request, res: Response) => {
  try {
    const id = asObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid coach id' });
      return;
    }
    const coach = await getDb().collection('users').findOne({ _id: id, role: 'coach' });
    if (!coach) {
      res.status(404).json({ error: 'Coach not found' });
      return;
    }
    res.json(await loadCoachCatalog(id.toHexString(), displayNameOf(coach as { coachProfile?: { displayName?: string }; email?: string })));
  } catch (err) {
    console.error('List coach programs error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

coachesRouter.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  try {
    const id = asObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid coach id' });
      return;
    }
    const coach = await getDb().collection('users').findOne({ _id: id, role: 'coach' });
    if (!coach) {
      res.status(404).json({ error: 'Coach not found' });
      return;
    }
    const videos = await loadCoachVideos(id.toHexString());
    const programs = await loadCoachCatalog(
      id.toHexString(),
      displayNameOf(coach as { coachProfile?: { displayName?: string }; email?: string })
    );
    let myRequest: { id: string; status: string; message: string } | null = null;
    if (req.user?.userId) {
      const request = await getDb().collection('coachRequests').findOne(
        { athleteId: req.user.userId, coachId: id.toHexString(), status: { $in: ['pending', 'accepted'] } },
        { sort: { createdAt: -1 } }
      );
      if (request) {
        myRequest = {
          id: request._id.toHexString(),
          status: String(request.status),
          message: String(request.message ?? ''),
        };
      }
    }
    res.json({
      ...publicCoach(coach as Record<string, unknown> & { _id: ObjectId }, {
        uniqueViews: rankScoreFromVideos(videos as Array<{ uniqueViewerIds?: unknown }>),
        videoCount: videos.length,
      }),
      videos: videos.map((doc) => publicVideo(doc as Record<string, unknown> & { _id: ObjectId })),
      programs,
      myRequest,
    });
  } catch (err) {
    console.error('Get coach error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

coachesRouter.post('/:id/request', requireAuth, async (req: Request, res: Response) => {
  try {
    const coachId = asObjectId(req.params.id);
    if (!coachId) {
      res.status(400).json({ error: 'Invalid coach id' });
      return;
    }
    const athleteId = req.user!.userId;
    if (athleteId === coachId.toHexString()) {
      res.status(400).json({ error: 'You cannot request coaching from yourself' });
      return;
    }
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message || message.length > 500) {
      res.status(400).json({ error: 'message is required (max 500 characters)' });
      return;
    }
    const coach = await getDb().collection('users').findOne({ _id: coachId, role: 'coach' });
    if (!coach) {
      res.status(404).json({ error: 'Coach not found' });
      return;
    }
    const existing = await getDb().collection('coachRequests').findOne({
      athleteId,
      coachId: coachId.toHexString(),
      status: { $in: ['pending', 'accepted'] },
    });
    if (existing) {
      res.status(409).json({ error: existing.status === 'accepted' ? 'You are already connected with this coach' : 'A request is already pending' });
      return;
    }
    const data = {
      athleteId,
      coachId: coachId.toHexString(),
      message,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    };
    const result = await getDb().collection('coachRequests').insertOne(data);
    const athleteOid = asObjectId(athleteId);
    const athlete = athleteOid
      ? await getDb().collection('users').findOne({ _id: athleteOid })
      : null;
    const athleteLabel =
      (typeof athlete?.email === 'string' && athlete.email) ||
      (typeof athlete?.name === 'string' && athlete.name) ||
      'An athlete';
    notifyUserPush({
      userId: coachId.toHexString(),
      pref: 'coachRequestReceived',
      title: 'New coaching request',
      body: `New coaching request from ${athleteLabel}`,
      data: { type: 'coach_request_received', requestId: result.insertedId.toHexString() },
    });
    res.status(201).json({
      id: result.insertedId.toHexString(),
      ...data,
      coachName: displayNameOf(coach as { coachProfile?: { displayName?: string }; email?: string }),
    });
  } catch (err) {
    console.error('Create coach request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
