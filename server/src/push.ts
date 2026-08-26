import { ObjectId } from 'mongodb';
import { getDb } from './db.js';
import { normalizeNotificationPrefs, type NotificationPrefs } from './notificationPrefs.js';

export type PushPrefKey =
  | 'coachRequestReceived'
  | 'coachRequestResponse'
  | 'planAssigned';

type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

function asObjectId(value: string): ObjectId | null {
  if (!/^[a-fA-F0-9]{24}$/.test(value)) return null;
  try {
    return new ObjectId(value);
  } catch {
    return null;
  }
}

function prefEnabled(prefs: NotificationPrefs, key: PushPrefKey): boolean {
  return prefs[key]?.enabled !== false;
}

async function pruneTokens(userId: ObjectId, badTokens: string[]): Promise<void> {
  if (!badTokens.length) return;
  for (const token of badTokens) {
    await getDb().collection('users').updateOne(
      { _id: userId },
      { $pull: { expoPushTokens: token } } as object
    );
  }
}

/**
 * Fire-and-forget Expo push. Never throws to callers — log and continue.
 */
export function notifyUserPush(params: {
  userId: string;
  pref: PushPrefKey;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): void {
  void sendExpoPush(params).catch((err) => {
    console.error('Expo push failed:', err);
  });
}

export async function sendExpoPush(params: {
  userId: string;
  pref: PushPrefKey;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const id = asObjectId(params.userId);
  if (!id) return;

  const user = await getDb().collection('users').findOne(
    { _id: id },
    { projection: { expoPushTokens: 1, notificationPrefs: 1 } }
  );
  if (!user) return;

  const prefs = normalizeNotificationPrefs(user.notificationPrefs);
  if (!prefEnabled(prefs, params.pref)) return;

  const tokens = Array.isArray(user.expoPushTokens)
    ? [...new Set(user.expoPushTokens.filter((t): t is string => typeof t === 'string' && t.length > 0))]
    : [];
  if (!tokens.length) return;

  const messages = tokens.map((to) => ({
    to,
    sound: 'default' as const,
    title: params.title,
    body: params.body,
    data: { ...(params.data ?? {}), pref: params.pref },
    channelId: 'coaching',
  }));

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error('Expo push HTTP error', response.status, text);
    return;
  }

  const json = (await response.json()) as { data?: ExpoPushTicket | ExpoPushTicket[] };
  const tickets = Array.isArray(json.data) ? json.data : json.data ? [json.data] : [];
  const badTokens: string[] = [];
  tickets.forEach((ticket, index) => {
    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      const token = tokens[index];
      if (token) badTokens.push(token);
    }
  });
  if (badTokens.length) {
    await pruneTokens(id, badTokens);
  }
}
