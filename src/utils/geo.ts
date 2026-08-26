export type RoutePoint = {
  lat: number;
  lng: number;
  timestamp: number;
};

const EARTH_KM = 6371;
export const MAX_ROUTE_POINTS = 800;

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineKm(a: Pick<RoutePoint, 'lat' | 'lng'>, b: Pick<RoutePoint, 'lat' | 'lng'>) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathDistanceKm(points: Array<Pick<RoutePoint, 'lat' | 'lng'>>) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineKm(points[i - 1], points[i]);
  return total;
}

function perpendicularKm(
  point: Pick<RoutePoint, 'lat' | 'lng'>,
  start: Pick<RoutePoint, 'lat' | 'lng'>,
  end: Pick<RoutePoint, 'lat' | 'lng'>
) {
  const span = haversineKm(start, end);
  if (span === 0) return haversineKm(point, start);
  const area = Math.abs(
    (haversineKm(start, point) + haversineKm(point, end) + span) *
      (haversineKm(start, point) + haversineKm(point, end) - span)
  );
  return area > 0 ? Math.sqrt(area) / 2 / span * 2 : 0;
}

function douglasPeucker(points: RoutePoint[], epsilonKm: number): RoutePoint[] {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularKm(points[i], start, end);
    if (dist > maxDist) {
      index = i;
      maxDist = dist;
    }
  }
  if (maxDist < epsilonKm) return [start, end];
  const left = douglasPeucker(points.slice(0, index + 1), epsilonKm);
  const right = douglasPeucker(points.slice(index), epsilonKm);
  return [...left.slice(0, -1), ...right];
}

function downsample(points: RoutePoint[], maxPoints: number) {
  if (points.length <= maxPoints) return points;
  const last = points[points.length - 1];
  const step = (points.length - 1) / (maxPoints - 1);
  const out: RoutePoint[] = [];
  for (let i = 0; i < maxPoints - 1; i++) out.push(points[Math.round(i * step)]);
  out.push(last);
  return out;
}

/** Display polyline: Douglas-Peucker (~12 m) then cap at 800 points. */
export function simplifyRoute(points: RoutePoint[], epsilonMeters = 12, maxPoints = MAX_ROUTE_POINTS) {
  if (points.length <= 2) return points;
  return downsample(douglasPeucker(points, epsilonMeters / 1000), maxPoints);
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Average or current pace as m:ss /km. Empty when distance is 0. */
export function formatPace(durationMin: number, distanceKm: number) {
  if (!Number.isFinite(durationMin) || !Number.isFinite(distanceKm) || distanceKm <= 0 || durationMin <= 0) {
    return '—';
  }
  const pace = durationMin / distanceKm;
  const minutes = Math.floor(pace);
  const seconds = Math.round((pace - minutes) * 60);
  if (seconds === 60) return `${minutes + 1}:00`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function durationMinFromMs(ms: number) {
  return Math.max(ms / 60000, 1 / 60);
}
