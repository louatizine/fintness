/** Calendar YYYY-MM-DD helpers in a client IANA timezone (or UTC fallback). */

export function resolveTimeZone(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) {
    const timeZone = raw.trim();
    try {
      Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
      return timeZone;
    } catch {
      // fall through
    }
  }
  return 'UTC';
}

/** Local calendar date key for an instant in the given IANA timezone. */
export function localDateKey(isoOrDate: string | Date, timeZone: string): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Shift a YYYY-MM-DD key by whole calendar days (date-only arithmetic). */
export function addDateKey(dateKey: string, deltaDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return utc.toISOString().slice(0, 10);
}
