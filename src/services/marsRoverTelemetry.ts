import { MARS_TARGETS, getMarsElevation } from '../data/marsData';

export type RoverTelemetryStatus = 'live' | 'cached' | 'offline-fallback';

export interface RoverTelemetryFix {
  roverId: string;
  latitude: number;
  longitude: number;
  elevationMeters: number;
  sol?: number;
  totalDriveKm?: number;
  recordedAtUtc: string;
  checkedAtUtc: string;
  sourceLabel: string;
  status: RoverTelemetryStatus;
  recentTrail?: Array<[number, number]>;
}

const STORAGE_KEY = 'mars_rover_telemetry_cache_v1';

const BASELINE_ROVER_FIXES: Record<string, RoverTelemetryFix> = (() => {
  const percy = MARS_TARGETS.find((t) => t.id === 'perseverance');
  const curio = MARS_TARGETS.find((t) => t.id === 'curiosity');
  return {
    perseverance: {
      roverId: 'perseverance',
      latitude: percy?.latitude ?? 18.4447,
      longitude: percy?.longitude ?? 77.4508,
      elevationMeters: percy?.elevationMeters ?? -2570,
      sol: 1420,
      totalDriveKm: 33.4,
      recordedAtUtc: '2025-02-18T12:00:00Z',
      checkedAtUtc: '2025-02-18T12:00:00Z',
      sourceLabel: 'NASA Mars 2020 Cached Baseline',
      status: 'offline-fallback',
      recentTrail: percy?.traversePath,
    },
    curiosity: {
      roverId: 'curiosity',
      latitude: curio?.latitude ?? -4.5895,
      longitude: curio?.longitude ?? 137.4417,
      elevationMeters: curio?.elevationMeters ?? -4500,
      sol: 4450,
      totalDriveKm: 33.8,
      recordedAtUtc: '2025-02-18T12:00:00Z',
      checkedAtUtc: '2025-02-18T12:00:00Z',
      sourceLabel: 'NASA MSL Cached Baseline',
      status: 'offline-fallback',
      recentTrail: curio?.traversePath,
    },
  };
})();

export function formatUtcTimestamp(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date) + ' UTC';
}

function isValidLatLon(lat: unknown, lon: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -360 &&
    lon <= 360
  );
}

function normalizeLon180(lon: number): number {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

export function loadCachedRoverTelemetry(): Record<string, RoverTelemetryFix> {
  const fallback: Record<string, RoverTelemetryFix> = {
    perseverance: { ...BASELINE_ROVER_FIXES.perseverance },
    curiosity: { ...BASELINE_ROVER_FIXES.curiosity },
  };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, Partial<RoverTelemetryFix>>;
    for (const id of ['perseverance', 'curiosity'] as const) {
      const item = parsed?.[id];
      const itemLat = item?.latitude;
      const itemLon = item?.longitude;
      if (
        item &&
        typeof itemLat === 'number' &&
        typeof itemLon === 'number' &&
        isValidLatLon(itemLat, itemLon)
      ) {
        fallback[id] = {
          ...fallback[id],
          ...item,
          roverId: id,
          latitude: itemLat,
          longitude: normalizeLon180(itemLon),
          elevationMeters:
            typeof item.elevationMeters === 'number' && Number.isFinite(item.elevationMeters)
              ? item.elevationMeters
              : getMarsElevation(itemLat, itemLon, 4),
          recordedAtUtc: item.recordedAtUtc || fallback[id].recordedAtUtc,
          checkedAtUtc: item.checkedAtUtc || fallback[id].checkedAtUtc,
          sourceLabel: item.sourceLabel || 'Cached NASA/JPL Telemetry',
          status: 'cached',
        };
      }
    }
  } catch {
    // Ignore malformed localStorage entries
  }

  return fallback;
}

function persistRoverTelemetry(fixes: Record<string, RoverTelemetryFix>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fixes));
  } catch {
    // Ignore storage quota / private mode restrictions
  }
}

interface GeoJsonFeature {
  geometry?: {
    type?: string;
    coordinates?: unknown[];
  };
  properties?: Record<string, unknown>;
}

function extractLatestWaypointFromGeoJson(
  payload: unknown,
  roverId: 'perseverance' | 'curiosity'
): Omit<RoverTelemetryFix, 'checkedAtUtc' | 'status' | 'sourceLabel'> | null {
  if (!payload || typeof payload !== 'object') return null;

  const features = Array.isArray((payload as { features?: unknown[] }).features)
    ? ((payload as { features: GeoJsonFeature[] }).features)
    : Array.isArray(payload)
      ? (payload as GeoJsonFeature[])
      : [];

  if (features.length === 0) return null;

  // Pick the feature with the highest sol/drive or fall back to the last entry
  let latestFeature: GeoJsonFeature | null = null;
  let highestSol = -1;
  const trail: Array<[number, number]> = [];

  for (const feature of features) {
    const coords = feature?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const rawLon = Number(coords[0]);
    const rawLat = Number(coords[1]);
    if (!isValidLatLon(rawLat, rawLon)) continue;
    const lon = normalizeLon180(rawLon);
    trail.push([lon, rawLat]);

    const props = feature.properties ?? {};
    const solCandidate = Number(props.sol ?? props.Sol ?? props.site ?? -1);
    if (Number.isFinite(solCandidate) && solCandidate >= highestSol) {
      highestSol = solCandidate;
      latestFeature = feature;
    } else if (!latestFeature) {
      latestFeature = feature;
    }
  }

  if (!latestFeature && trail.length === 0) return null;
  const chosen = latestFeature ?? features[features.length - 1];
  const coords = chosen.geometry?.coordinates ?? [];
  const rawLon = Number(coords[0]);
  const rawLat = Number(coords[1]);
  if (!isValidLatLon(rawLat, rawLon)) return null;

  const lon = normalizeLon180(rawLon);
  const lat = rawLat;
  const elevRaw = coords.length >= 3 ? Number(coords[2]) : Number.NaN;
  const props = chosen.properties ?? {};
  const solNum = Number(props.sol ?? props.Sol);
  const distMeters = Number(
    props.dist_total ?? props.total_dist ?? props.odometry ?? props.drive_distance
  );

  const dateCandidate =
    props.earth_time ??
    props.earth_date ??
    props.utc ??
    props.timestamp ??
    props.date ??
    props.date_taken;
  let recordedAtUtc = new Date().toISOString();
  if (typeof dateCandidate === 'string' && dateCandidate.trim()) {
    const parsedDate = new Date(dateCandidate);
    if (!Number.isNaN(parsedDate.getTime())) {
      recordedAtUtc = parsedDate.toISOString();
    }
  }

  // Keep up to the last 24 waypoints for a crisp recent rover traverse path
  const recentTrail = trail.length > 1 ? trail.slice(-24) : BASELINE_ROVER_FIXES[roverId].recentTrail;

  return {
    roverId,
    latitude: lat,
    longitude: lon,
    elevationMeters: Number.isFinite(elevRaw) ? Math.round(elevRaw) : getMarsElevation(lat, lon, 4),
    sol: Number.isFinite(solNum) && solNum > 0 ? Math.round(solNum) : undefined,
    totalDriveKm:
      Number.isFinite(distMeters) && distMeters > 0
        ? Math.round((distMeters / 1000) * 100) / 100
        : undefined,
    recordedAtUtc,
    recentTrail,
  };
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 5500): Promise<unknown> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchSingleRoverLive(
  roverId: 'perseverance' | 'curiosity',
  cachedFix: RoverTelemetryFix
): Promise<RoverTelemetryFix> {
  const nowIso = new Date().toISOString();
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  if (!isOnline) {
    return {
      ...cachedFix,
      checkedAtUtc: nowIso,
      status: 'offline-fallback',
    };
  }

  const candidateUrls =
    roverId === 'perseverance'
      ? [
          'https://mars.nasa.gov/mm20-api/v1/vehicles/perseverance/waypoints/',
          'https://mars.nasa.gov/mm20-api/v1/waypoints/',
        ]
      : [
          'https://mars.nasa.gov/msl-api/locations.json',
          'https://mars.nasa.gov/msl-api/waypoints.json',
        ];

  for (const url of candidateUrls) {
    try {
      const payload = await fetchJsonWithTimeout(url, 5500);
      const parsed = extractLatestWaypointFromGeoJson(payload, roverId);
      if (parsed) {
        return {
          ...parsed,
          checkedAtUtc: nowIso,
          sourceLabel:
            roverId === 'perseverance'
              ? 'NASA/JPL Mars 2020 Waypoints API'
              : 'NASA/JPL MSL Curiosity Waypoints API',
          status: 'live',
        };
      }
    } catch {
      // Try next endpoint or fall back to cached fix
    }
  }

  // Secondary check for Curiosity latest Sol date via MSL REMS feed (keeps cached position explicit)
  if (roverId === 'curiosity') {
    try {
      const rems = (await fetchJsonWithTimeout(
        'https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json',
        4500
      )) as { soles?: Array<{ sol?: string; terrestrial_date?: string }> };
      const latest = rems?.soles?.[0];
      const latestSol = latest?.sol ? Number(latest.sol) : Number.NaN;
      if (Number.isFinite(latestSol) && latestSol > 0) {
        return {
          ...cachedFix,
          sol: latestSol,
          checkedAtUtc: nowIso,
          sourceLabel: 'Cached MSL Coordinates (NASA REMS Sol Active)',
          status: 'cached',
        };
      }
    } catch {
      // Fall through to offline/cached fallback
    }
  }

  return {
    ...cachedFix,
    checkedAtUtc: nowIso,
    status: cachedFix.status === 'live' ? 'cached' : 'offline-fallback',
  };
}

/**
 * Fetches latest Perseverance & Curiosity telemetry from NASA/JPL feeds,
 * updates localStorage on success, and falls back gracefully to last known coordinates.
 */
export async function refreshLiveRoverTelemetry(
  previous: Record<string, RoverTelemetryFix>
): Promise<Record<string, RoverTelemetryFix>> {
  const base = Object.keys(previous).length > 0 ? previous : loadCachedRoverTelemetry();
  const [perseveranceFix, curiosityFix] = await Promise.all([
    fetchSingleRoverLive('perseverance', base.perseverance ?? BASELINE_ROVER_FIXES.perseverance),
    fetchSingleRoverLive('curiosity', base.curiosity ?? BASELINE_ROVER_FIXES.curiosity),
  ]);

  const merged: Record<string, RoverTelemetryFix> = {
    ...base,
    perseverance: perseveranceFix,
    curiosity: curiosityFix,
  };
  persistRoverTelemetry(merged);
  return merged;
}
