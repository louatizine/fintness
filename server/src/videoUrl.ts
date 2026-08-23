export type VideoSource = {
  kind: 'youtube' | 'file';
  videoUrl: string;
  youtubeId: string | null;
  thumbnailUrl: string | null;
};

const FILE_HOSTS = [
  'mux.com',
  'stream.mux.com',
  'cloudinary.com',
  'res.cloudinary.com',
  'player.cloudinary.com',
];
const FILE_EXT = /\.(mp4|webm|m3u8)$/i;

function youtubeIdFromUrl(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const idOk = (value: string | null) => Boolean(value && /^[A-Za-z0-9_-]{11}$/.test(value));
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
    return idOk(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const fromQuery = url.searchParams.get('v');
    if (idOk(fromQuery)) return fromQuery;
    const parts = url.pathname.split('/').filter(Boolean);
    if (['embed', 'shorts', 'live'].includes(parts[0] ?? '') && idOk(parts[1] ?? '')) return parts[1];
  }
  return null;
}

export function parseVideoSource(raw: string, thumbnailUrl?: string): { error?: string; source?: VideoSource } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: 'videoUrl is required' };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { error: 'videoUrl must be a valid URL' };
  }
  if (url.protocol !== 'https:') return { error: 'videoUrl must use https' };

  const youtubeId = youtubeIdFromUrl(url);
  const thumb = typeof thumbnailUrl === 'string' ? thumbnailUrl.trim() : '';
  if (youtubeId) {
    return {
      source: {
        kind: 'youtube',
        videoUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
        youtubeId,
        thumbnailUrl: thumb || `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
      },
    };
  }

  const host = url.hostname.replace(/^www\./, '');
  const allowedHost = FILE_HOSTS.some((item) => host === item || host.endsWith(`.${item}`));
  if (!allowedHost && !FILE_EXT.test(url.pathname)) {
    return { error: 'Link a YouTube video, or an https URL from Mux or Cloudinary' };
  }
  return {
    source: {
      kind: 'file',
      videoUrl: url.toString(),
      youtubeId: null,
      thumbnailUrl: thumb || null,
    },
  };
}
