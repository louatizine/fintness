export type NotificationPrefs = {
  dailyMotivation: { enabled: boolean; hour: number; minute: number };
  streakAtRisk: { enabled: boolean };
  waterMeal: { enabled: boolean; intervalHours: number };
  coachRequestResponse: { enabled: boolean };
  planAssigned: { enabled: boolean };
  coachRequestReceived: { enabled: boolean };
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  dailyMotivation: { enabled: true, hour: 8, minute: 0 },
  streakAtRisk: { enabled: true },
  waterMeal: { enabled: false, intervalHours: 2 },
  coachRequestResponse: { enabled: true },
  planAssigned: { enabled: true },
  coachRequestReceived: { enabled: true },
};

const WATER_INTERVALS = new Set([1, 2, 3, 4]);

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asHour(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 23) return fallback;
  return n;
}

function asMinute(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 59) return fallback;
  return n;
}

function asIntervalHours(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!WATER_INTERVALS.has(n)) return fallback;
  return n;
}

export function normalizeNotificationPrefs(raw: unknown): NotificationPrefs {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const daily = src.dailyMotivation && typeof src.dailyMotivation === 'object'
    ? (src.dailyMotivation as Record<string, unknown>)
    : {};
  const streak = src.streakAtRisk && typeof src.streakAtRisk === 'object'
    ? (src.streakAtRisk as Record<string, unknown>)
    : {};
  const water = src.waterMeal && typeof src.waterMeal === 'object'
    ? (src.waterMeal as Record<string, unknown>)
    : {};
  const coachResponse = src.coachRequestResponse && typeof src.coachRequestResponse === 'object'
    ? (src.coachRequestResponse as Record<string, unknown>)
    : {};
  const plan = src.planAssigned && typeof src.planAssigned === 'object'
    ? (src.planAssigned as Record<string, unknown>)
    : {};
  const coachReceived = src.coachRequestReceived && typeof src.coachRequestReceived === 'object'
    ? (src.coachRequestReceived as Record<string, unknown>)
    : {};

  return {
    dailyMotivation: {
      enabled: asBool(daily.enabled, DEFAULT_NOTIFICATION_PREFS.dailyMotivation.enabled),
      hour: asHour(daily.hour, DEFAULT_NOTIFICATION_PREFS.dailyMotivation.hour),
      minute: asMinute(daily.minute, DEFAULT_NOTIFICATION_PREFS.dailyMotivation.minute),
    },
    streakAtRisk: {
      enabled: asBool(streak.enabled, DEFAULT_NOTIFICATION_PREFS.streakAtRisk.enabled),
    },
    waterMeal: {
      enabled: asBool(water.enabled, DEFAULT_NOTIFICATION_PREFS.waterMeal.enabled),
      intervalHours: asIntervalHours(water.intervalHours, DEFAULT_NOTIFICATION_PREFS.waterMeal.intervalHours),
    },
    coachRequestResponse: {
      enabled: asBool(coachResponse.enabled, DEFAULT_NOTIFICATION_PREFS.coachRequestResponse.enabled),
    },
    planAssigned: {
      enabled: asBool(plan.enabled, DEFAULT_NOTIFICATION_PREFS.planAssigned.enabled),
    },
    coachRequestReceived: {
      enabled: asBool(coachReceived.enabled, DEFAULT_NOTIFICATION_PREFS.coachRequestReceived.enabled),
    },
  };
}

/** Merge a partial prefs patch into existing prefs. Returns null if patch is invalid/empty. */
export function mergeNotificationPrefsPatch(
  existing: unknown,
  patch: unknown
): NotificationPrefs | null {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
  const p = patch as Record<string, unknown>;
  const keys = Object.keys(p);
  if (keys.length === 0) return null;

  const allowed = new Set([
    'dailyMotivation',
    'streakAtRisk',
    'waterMeal',
    'coachRequestResponse',
    'planAssigned',
    'coachRequestReceived',
  ]);
  if (keys.some((k) => !allowed.has(k))) return null;

  const base = normalizeNotificationPrefs(existing);
  const next: NotificationPrefs = {
    dailyMotivation: { ...base.dailyMotivation },
    streakAtRisk: { ...base.streakAtRisk },
    waterMeal: { ...base.waterMeal },
    coachRequestResponse: { ...base.coachRequestResponse },
    planAssigned: { ...base.planAssigned },
    coachRequestReceived: { ...base.coachRequestReceived },
  };

  if (p.dailyMotivation !== undefined) {
    if (!p.dailyMotivation || typeof p.dailyMotivation !== 'object') return null;
    const d = p.dailyMotivation as Record<string, unknown>;
    if (d.enabled !== undefined) {
      if (typeof d.enabled !== 'boolean') return null;
      next.dailyMotivation.enabled = d.enabled;
    }
    if (d.hour !== undefined) {
      const hour = asHour(d.hour, -1);
      if (hour < 0) return null;
      next.dailyMotivation.hour = hour;
    }
    if (d.minute !== undefined) {
      const minute = asMinute(d.minute, -1);
      if (minute < 0) return null;
      next.dailyMotivation.minute = minute;
    }
  }

  if (p.streakAtRisk !== undefined) {
    if (!p.streakAtRisk || typeof p.streakAtRisk !== 'object') return null;
    const s = p.streakAtRisk as Record<string, unknown>;
    if (s.enabled !== undefined) {
      if (typeof s.enabled !== 'boolean') return null;
      next.streakAtRisk.enabled = s.enabled;
    }
  }

  if (p.waterMeal !== undefined) {
    if (!p.waterMeal || typeof p.waterMeal !== 'object') return null;
    const w = p.waterMeal as Record<string, unknown>;
    if (w.enabled !== undefined) {
      if (typeof w.enabled !== 'boolean') return null;
      next.waterMeal.enabled = w.enabled;
    }
    if (w.intervalHours !== undefined) {
      const interval = asIntervalHours(w.intervalHours, -1);
      if (interval < 0) return null;
      next.waterMeal.intervalHours = interval;
    }
  }

  if (p.coachRequestResponse !== undefined) {
    if (!p.coachRequestResponse || typeof p.coachRequestResponse !== 'object') return null;
    const c = p.coachRequestResponse as Record<string, unknown>;
    if (c.enabled !== undefined) {
      if (typeof c.enabled !== 'boolean') return null;
      next.coachRequestResponse.enabled = c.enabled;
    }
  }

  if (p.planAssigned !== undefined) {
    if (!p.planAssigned || typeof p.planAssigned !== 'object') return null;
    const pl = p.planAssigned as Record<string, unknown>;
    if (pl.enabled !== undefined) {
      if (typeof pl.enabled !== 'boolean') return null;
      next.planAssigned.enabled = pl.enabled;
    }
  }

  if (p.coachRequestReceived !== undefined) {
    if (!p.coachRequestReceived || typeof p.coachRequestReceived !== 'object') return null;
    const cr = p.coachRequestReceived as Record<string, unknown>;
    if (cr.enabled !== undefined) {
      if (typeof cr.enabled !== 'boolean') return null;
      next.coachRequestReceived.enabled = cr.enabled;
    }
  }

  return next;
}
