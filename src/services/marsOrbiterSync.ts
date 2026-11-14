import { MARS_TARGETS, MarsTarget } from '../data/marsData';

export interface LiveOrbiterElements {
  orbiterId: string;
  altitudeMeters: number;
  eccentricity: number;
  inclinationDeg: number;
  raanDeg: number;
  argPeriapsisDeg: number;
  meanAnomalyAtEpochDeg: number;
  epochMs: number;
  periodMinutes: number;
  orbitalVelocityKmS: number;
  source: 'jpl-horizons' | 'cached-ephemeris' | 'utc-keplerian';
  syncedAtUtc: string;
}

const STORAGE_KEY = 'mars_orbiter_ephemeris_cache_v1';

// Official NASA NAIF / JPL Horizons spacecraft IDs for active Mars orbiters
const HORIZONS_COMMAND_IDS: Record<string, string> = {
  mro: '-74',
  odyssey: '-53',
  maven: '-202',
  'mars-express': '-41',
  tgo: '-143',
  hope: '-62',
};

// Modern verified epoch baseline (2025-01-01T00:00:00Z) so UTC synchronization is deterministic offline
const DEFAULT_EPOCH_MS = Date.UTC(2025, 0, 1, 0, 0, 0);

const BASELINE_ORBITER_ELEMENTS: Record<string, LiveOrbiterElements> = (() => {
  const result: Record<string, LiveOrbiterElements> = {};
  for (const target of MARS_TARGETS) {
    if (target.category !== 'satellite' || !target.orbit) continue;
    result[target.id] = buildDefaultElementsFromTarget(target);
  }
  return result;
})();

export function buildDefaultElementsFromTarget(target: MarsTarget): LiveOrbiterElements {
  const orbit = target.orbit!;
  return {
    orbiterId: target.id,
    altitudeMeters: orbit.altitudeMeters,
    eccentricity: 0.002,
    inclinationDeg: orbit.inclinationDeg,
    raanDeg: orbit.raanDeg,
    argPeriapsisDeg: 0,
    meanAnomalyAtEpochDeg: orbit.initialPhaseDeg,
    epochMs: DEFAULT_EPOCH_MS,
    periodMinutes: orbit.periodMinutes,
    orbitalVelocityKmS: orbit.orbitalVelocityKmS,
    source: 'utc-keplerian',
    syncedAtUtc: new Date(DEFAULT_EPOCH_MS).toISOString(),
  };
}

export function loadCachedOrbiterElements(): Record<string, LiveOrbiterElements> {
  const result: Record<string, LiveOrbiterElements> = { ...BASELINE_ORBITER_ELEMENTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return result;
    const parsed = JSON.parse(raw) as Record<string, Partial<LiveOrbiterElements>>;
    for (const [id, item] of Object.entries(parsed ?? {})) {
      const base = result[id];
      if (!base || !item) continue;
      if (
        typeof item.inclinationDeg === 'number' &&
        typeof item.raanDeg === 'number' &&
        typeof item.meanAnomalyAtEpochDeg === 'number' &&
        typeof item.epochMs === 'number'
      ) {
        result[id] = {
          ...base,
          ...item,
          orbiterId: id,
          source: item.source === 'jpl-horizons' ? 'cached-ephemeris' : base.source,
        };
      }
    }
  } catch {
    // Ignore invalid localStorage payload
  }
  return result;
}

function persistOrbiterElements(map: Record<string, LiveOrbiterElements>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

function julianDateToEpochMs(jd: number): number {
  return (jd - 2440587.5) * 86_400_000;
}

/**
 * Parses osculating orbital elements from JPL Horizons API JSON text output (`result`).
 * Horizons outputs lines such as:
 *   EC= 1.234E-02 QR= ... IN= 9.29E+01
 *   OM= 4.21E+01 W = 1.12E+02 Tp= ...
 *   N = ... MA= 2.34E+02 ... A = 3.69E+03 ... PR= 6.74E+03
 */
function parseHorizonsElementsText(
  resultText: string,
  base: LiveOrbiterElements
): LiveOrbiterElements | null {
  const soeIndex = resultText.indexOf('$$SOE');
  const eoeIndex = resultText.indexOf('$$EOE');
  if (soeIndex === -1 || eoeIndex === -1 || eoeIndex <= soeIndex) {
    return null;
  }

  const block = resultText.slice(soeIndex + 5, eoeIndex);
  const jdMatch = block.match(/(\d{7}\.\d+)\s*=\s*A\.D\./);
  const readNum = (key: string): number | null => {
    const regex = new RegExp(`${key}\\s*=\\s*([-+]?\\d+\\.?\\d*(?:[Ee][-+]?\\d+)?)`);
    const m = block.match(regex);
    if (!m) return null;
    const val = Number(m[1]);
    return Number.isFinite(val) ? val : null;
  };

  const inc = readNum('IN');
  const om = readNum('OM');
  const w = readNum('W');
  const ma = readNum('MA');
  if (inc === null || om === null || ma === null) {
    return null;
  }

  const epochMs = jdMatch ? julianDateToEpochMs(Number(jdMatch[1])) : Date.now();
  const ecRaw = readNum('EC');
  const aKm = readNum('A');
  const prSec = readNum('PR');

  // Keep globe preview altitude bounded cleanly for elliptical missions (e.g. Hope/MAVEN)
  // while preserving genuine inclination, RAAN, argument of periapsis, and UTC phase
  const computedAltMeters =
    aKm && aKm > 3450 && aKm < 5500
      ? Math.max(250_000, (aKm - 3396.19) * 1000)
      : base.altitudeMeters;

  return {
    ...base,
    altitudeMeters: computedAltMeters,
    eccentricity: ecRaw !== null ? Math.min(0.18, Math.max(0, ecRaw)) : base.eccentricity,
    inclinationDeg: inc,
    raanDeg: om,
    argPeriapsisDeg: w ?? base.argPeriapsisDeg,
    meanAnomalyAtEpochDeg: ma,
    epochMs: Number.isFinite(epochMs) ? epochMs : Date.now(),
    periodMinutes:
      prSec !== null && prSec > 3600 && prSec < 3600 * 60
        ? Math.round((prSec / 60) * 10) / 10
        : base.periodMinutes,
    source: 'jpl-horizons',
    syncedAtUtc: new Date().toISOString(),
  };
}

async function fetchSingleHorizonsOrbiter(
  orbiterId: string,
  commandId: string,
  base: LiveOrbiterElements
): Promise<LiveOrbiterElements> {
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  if (!isOnline) return base;

  const now = new Date();
  const stop = new Date(now.getTime() + 60_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');

  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${commandId}'`,
    CENTER: "'500@499'",
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'ELEMENTS'",
    START_TIME: `'${fmt(now)}'`,
    STOP_TIME: `'${fmt(stop)}'`,
    STEP_SIZE: "'1d'",
    OUT_UNITS: "'KM-S'",
    REF_PLANE: "'BODY EQUATOR'",
  });

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(
      `https://ssd.jpl.nasa.gov/api/horizons.api?${params.toString()}`,
      { signal: controller.signal }
    );
    if (!response.ok) return base;
    const data = (await response.json()) as { result?: string };
    if (!data?.result) return base;
    return parseHorizonsElementsText(data.result, base) ?? base;
  } catch {
    return base;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Synchronizes active Mars orbiters against JPL Horizons osculating elements when online,
 * caching the synced elements in localStorage and gracefully preserving UTC-propagated elements offline.
 */
export async function refreshOrbiterEphemerides(
  currentMap: Record<string, LiveOrbiterElements>
): Promise<Record<string, LiveOrbiterElements>> {
  const base = Object.keys(currentMap).length > 0 ? currentMap : loadCachedOrbiterElements();
  const entries = Object.entries(HORIZONS_COMMAND_IDS);

  const updatedEntries = await Promise.all(
    entries.map(async ([orbiterId, commandId]) => {
      const existing = base[orbiterId];
      if (!existing) return [orbiterId, existing] as const;
      const synced = await fetchSingleHorizonsOrbiter(orbiterId, commandId, existing);
      return [orbiterId, synced] as const;
    })
  );

  const nextMap: Record<string, LiveOrbiterElements> = { ...base };
  for (const [id, elem] of updatedEntries) {
    if (elem) nextMap[id] = elem;
  }
  persistOrbiterElements(nextMap);
  return nextMap;
}
