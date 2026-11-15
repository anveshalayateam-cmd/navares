/**
 * Real-time Phobos & Deimos ephemeris via JPL Horizons (MAR099).
 * Falls back to published mean elements when offline.
 */
import { MARS_MOONS, MarsMoonDefinition } from '../data/marsMoons';

export interface LiveMoonElements {
  moonId: 'phobos' | 'deimos';
  semiMajorAxisMeters: number;
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

const STORAGE_KEY = 'mars_moon_ephemeris_cache_v1';
const DEFAULT_EPOCH_MS = Date.UTC(2025, 0, 1, 0, 0, 0);

function buildDefault(moon: MarsMoonDefinition): LiveMoonElements {
  // Stagger initial phases so moons are not stacked in the illustration
  const phase = moon.id === 'phobos' ? 42 : 210;
  return {
    moonId: moon.id,
    semiMajorAxisMeters: moon.semiMajorAxisMeters,
    eccentricity: moon.eccentricity,
    inclinationDeg: moon.inclinationDeg,
    raanDeg: moon.id === 'phobos' ? 80.5 : 40.0,
    argPeriapsisDeg: moon.id === 'phobos' ? 190 : 0,
    meanAnomalyAtEpochDeg: phase,
    epochMs: DEFAULT_EPOCH_MS,
    periodMinutes: moon.periodMinutes,
    orbitalVelocityKmS: moon.orbitalVelocityKmS,
    source: 'utc-keplerian',
    syncedAtUtc: new Date(DEFAULT_EPOCH_MS).toISOString(),
  };
}

export function loadCachedMoonElements(): Record<string, LiveMoonElements> {
  const result: Record<string, LiveMoonElements> = {};
  for (const m of MARS_MOONS) result[m.id] = buildDefault(m);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return result;
    const parsed = JSON.parse(raw) as Record<string, Partial<LiveMoonElements>>;
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
          moonId: id as 'phobos' | 'deimos',
          source: item.source === 'jpl-horizons' ? 'cached-ephemeris' : base.source,
        };
      }
    }
  } catch {
    /* ignore */
  }
  return result;
}

function persist(map: Record<string, LiveMoonElements>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function julianDateToEpochMs(jd: number): number {
  return (jd - 2440587.5) * 86_400_000;
}

function parseHorizonsElementsText(
  resultText: string,
  base: LiveMoonElements
): LiveMoonElements | null {
  const soeIndex = resultText.indexOf('$$SOE');
  const eoeIndex = resultText.indexOf('$$EOE');
  if (soeIndex === -1 || eoeIndex === -1 || eoeIndex <= soeIndex) return null;

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
  const aKm = readNum('A');
  const ec = readNum('EC');
  const prDays = readNum('PR');
  if (inc === null || om === null || ma === null) return null;

  const epochMs = jdMatch ? julianDateToEpochMs(Number(jdMatch[1])) : Date.now();

  return {
    ...base,
    semiMajorAxisMeters:
      aKm && aKm > 5_000 && aKm < 50_000 ? aKm * 1000 : base.semiMajorAxisMeters,
    eccentricity: ec !== null ? Math.min(0.05, Math.max(0, ec)) : base.eccentricity,
    inclinationDeg: inc,
    raanDeg: om,
    argPeriapsisDeg: w ?? base.argPeriapsisDeg,
    meanAnomalyAtEpochDeg: ma,
    epochMs: Number.isFinite(epochMs) ? epochMs : Date.now(),
    periodMinutes:
      prDays !== null && prDays > 0.05 && prDays < 5
        ? Math.round(prDays * 24 * 60 * 10) / 10
        : base.periodMinutes,
    source: 'jpl-horizons',
    syncedAtUtc: new Date().toISOString(),
  };
}

async function fetchMoon(
  moon: MarsMoonDefinition,
  base: LiveMoonElements
): Promise<LiveMoonElements> {
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  if (!isOnline) return base;

  const now = new Date();
  const stop = new Date(now.getTime() + 60_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');

  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${moon.horizonsId}'`,
    CENTER: "'500@499'", // Mars center
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'ELEMENTS'",
    START_TIME: `'${fmt(now)}'`,
    STOP_TIME: `'${fmt(stop)}'`,
    STEP_SIZE: "'1d'",
    OUT_UNITS: "'KM-D'",
    REF_PLANE: "'BODY EQUATOR'",
  });

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6000);
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

export async function refreshMoonEphemerides(
  current: Record<string, LiveMoonElements>
): Promise<Record<string, LiveMoonElements>> {
  const base =
    Object.keys(current).length > 0 ? current : loadCachedMoonElements();
  const updated = await Promise.all(
    MARS_MOONS.map(async (moon) => {
      const existing = base[moon.id] ?? buildDefault(moon);
      const synced = await fetchMoon(moon, existing);
      return [moon.id, synced] as const;
    })
  );
  const next: Record<string, LiveMoonElements> = { ...base };
  for (const [id, elem] of updated) next[id] = elem;
  persist(next);
  return next;
}
