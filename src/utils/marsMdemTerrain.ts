import * as Lerc from 'lerc';

export const MDEM_TILE_BASE_URL =
  'https://astro.arcgis.com/arcgis/rest/services/OnMars/MDEM200M/ImageServer/tile';
export const MDEM_NATIVE_MAX_LEVEL = 7;
export const MDEM_TERRAIN_MIN_HEIGHT = -8210;
export const MDEM_TERRAIN_MAX_HEIGHT = 21241;

const TILE_PIXEL_DIM = 513;
const TILE_INTERVALS = 513; // Empirical MDEM200M spacing: col 0..512 spans [0..512/513], col 0 of east neighbor sits at 513/513
const MAX_CACHED_HIGH_LEVEL_TILES = 220;

export interface DecodedMdemTile {
  level: number;
  x: number;
  y: number;
  pixels: Float32Array;
}

interface StitchedTileSet {
  center: DecodedMdemTile;
  east: DecodedMdemTile | null;
  south: DecodedMdemTile | null;
  se: DecodedMdemTile | null;
}

const pinnedBaseTiles = new Map<string, DecodedMdemTile>(); // levels 0..1 kept permanently
const lruHighTiles = new Map<string, DecodedMdemTile>(); // levels 2..7 bounded LRU
const inFlightTileFetches = new Map<string, Promise<DecodedMdemTile | null>>();

let lercLoadPromise: Promise<void> | null = null;
let prefetchPromise: Promise<void> | null = null;

function tileKey(level: number, x: number, y: number): string {
  return `${level}/${y}/${x}`;
}

function normalizeLonDeg(lonDeg: number): number {
  return ((((lonDeg + 180) % 360) + 360) % 360) - 180;
}

function getCachedTile(level: number, x: number, y: number): DecodedMdemTile | undefined {
  const key = tileKey(level, x, y);
  const pinned = pinnedBaseTiles.get(key);
  if (pinned) return pinned;
  const hit = lruHighTiles.get(key);
  if (hit) {
    // Refresh LRU order
    lruHighTiles.delete(key);
    lruHighTiles.set(key, hit);
  }
  return hit;
}

function setCachedTile(tile: DecodedMdemTile): void {
  const key = tileKey(tile.level, tile.x, tile.y);
  if (tile.level <= 1) {
    pinnedBaseTiles.set(key, tile);
    return;
  }
  if (lruHighTiles.has(key)) {
    lruHighTiles.delete(key);
  }
  lruHighTiles.set(key, tile);
  while (lruHighTiles.size > MAX_CACHED_HIGH_LEVEL_TILES) {
    const oldestKey = lruHighTiles.keys().next().value;
    if (oldestKey === undefined) break;
    lruHighTiles.delete(oldestKey);
  }
}

export async function ensureLercReady(): Promise<void> {
  if (Lerc.isLoaded()) return;
  if (!lercLoadPromise) {
    lercLoadPromise = (async () => {
      if (typeof window !== 'undefined') {
        const wasmMod = await import('lerc/lerc-wasm.wasm?url');
        await Lerc.load({ locateFile: () => wasmMod.default });
      } else {
        await Lerc.load();
      }
    })().catch((err) => {
      lercLoadPromise = null;
      throw err;
    });
  }
  return lercLoadPromise;
}

function toFloat32Pixels(decoded: Lerc.LercData): Float32Array {
  const band = decoded.pixels[0];
  const count = decoded.width * decoded.height;
  const out = band instanceof Float32Array ? band : Float32Array.from(band);
  if (decoded.mask) {
    const mask = decoded.mask;
    let lastValid = 0;
    for (let i = 0; i < count; i++) {
      if (mask[i] === 0) {
        out[i] = lastValid;
      } else {
        lastValid = out[i];
      }
    }
  }
  return out;
}

export async function fetchMdemTile(
  level: number,
  x: number,
  y: number
): Promise<DecodedMdemTile | null> {
  const clampedLevel = Math.max(0, Math.min(MDEM_NATIVE_MAX_LEVEL, level));
  const nX = 2 << clampedLevel;
  const nY = 1 << clampedLevel;
  const normX = ((x % nX) + nX) % nX;
  const normY = Math.max(0, Math.min(nY - 1, y));

  const existing = getCachedTile(clampedLevel, normX, normY);
  if (existing) return existing;

  const key = tileKey(clampedLevel, normX, normY);
  const active = inFlightTileFetches.get(key);
  if (active) return active;

  const task = (async (): Promise<DecodedMdemTile | null> => {
    try {
      await ensureLercReady();
      const url = `${MDEM_TILE_BASE_URL}/${clampedLevel}/${normY}/${normX}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      const decoded = Lerc.decode(buf);
      if (!decoded || decoded.width !== TILE_PIXEL_DIM || decoded.height !== TILE_PIXEL_DIM) {
        return null;
      }
      const tile: DecodedMdemTile = {
        level: clampedLevel,
        x: normX,
        y: normY,
        pixels: toFloat32Pixels(decoded),
      };
      setCachedTile(tile);
      return tile;
    } catch {
      return null;
    } finally {
      inFlightTileFetches.delete(key);
    }
  })();

  inFlightTileFetches.set(key, task);
  return task;
}

export async function fetchMdemTileWithBorders(
  level: number,
  x: number,
  y: number
): Promise<StitchedTileSet | null> {
  const nX = 2 << level;
  const nY = 1 << level;
  const normX = ((x % nX) + nX) % nX;
  const normY = Math.max(0, Math.min(nY - 1, y));
  const eastX = (normX + 1) % nX;
  const hasSouth = normY + 1 < nY;

  const [center, east, south, se] = await Promise.all([
    fetchMdemTile(level, normX, normY),
    fetchMdemTile(level, eastX, normY),
    hasSouth ? fetchMdemTile(level, normX, normY + 1) : Promise.resolve(null),
    hasSouth ? fetchMdemTile(level, eastX, normY + 1) : Promise.resolve(null),
  ]);

  if (!center) return null;
  return { center, east, south, se };
}

function readStitchedPixel(set: StitchedTileSet, r: number, c: number): number {
  const { center, east, south, se } = set;
  if (r < TILE_PIXEL_DIM && c < TILE_PIXEL_DIM) {
    return center.pixels[r * TILE_PIXEL_DIM + c];
  }
  if (r < TILE_PIXEL_DIM && c >= TILE_PIXEL_DIM) {
    return east ? east.pixels[r * TILE_PIXEL_DIM] : center.pixels[r * TILE_PIXEL_DIM + 512];
  }
  if (r >= TILE_PIXEL_DIM && c < TILE_PIXEL_DIM) {
    return south ? south.pixels[c] : center.pixels[512 * TILE_PIXEL_DIM + c];
  }
  if (se) return se.pixels[0];
  if (east) return east.pixels[512 * TILE_PIXEL_DIM];
  if (south) return south.pixels[512];
  return center.pixels[512 * TILE_PIXEL_DIM + 512];
}

/**
 * Samples a stitched MDEM200M tile set at normalized UV coordinates (u in [0, 1] west->east,
 * v in [0, 1] north->south), yielding bit-identical heights on adjacent tile edges.
 */
export function sampleStitchedMdemUv(set: StitchedTileSet, u: number, v: number): number {
  const px = Math.max(0, Math.min(TILE_INTERVALS, u * TILE_INTERVALS));
  const py = Math.max(0, Math.min(TILE_INTERVALS, v * TILE_INTERVALS));
  const c0 = Math.floor(px);
  const r0 = Math.floor(py);
  const c1 = Math.min(TILE_INTERVALS, c0 + 1);
  const r1 = Math.min(TILE_INTERVALS, r0 + 1);
  const fx = px - c0;
  const fy = py - r0;

  const h00 = readStitchedPixel(set, r0, c0);
  const h10 = readStitchedPixel(set, r0, c1);
  const h01 = readStitchedPixel(set, r1, c0);
  const h11 = readStitchedPixel(set, r1, c1);

  return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
}

/**
 * Synchronous lookup into the highest-resolution cached MDEM200M tile covering (latDeg, lonDeg).
 * Returns null only if no base tile covering this coordinate has finished downloading yet.
 */
export function sampleCachedMdemElevationMeters(latDeg: number, lonDeg: number): number | null {
  const lat = Math.max(-89.999999, Math.min(89.999999, latDeg));
  const lon = normalizeLonDeg(lonDeg);

  for (let level = MDEM_NATIVE_MAX_LEVEL; level >= 0; level--) {
    const nX = 2 << level;
    const nY = 1 << level;
    const fxTile = ((lon + 180) / 360) * nX;
    const fyTile = ((90 - lat) / 180) * nY;
    const x = Math.min(nX - 1, Math.max(0, Math.floor(fxTile)));
    const y = Math.min(nY - 1, Math.max(0, Math.floor(fyTile)));

    const center = getCachedTile(level, x, y);
    if (!center) continue;

    const eastX = (x + 1) % nX;
    const hasSouth = y + 1 < nY;
    const east = getCachedTile(level, eastX, y) ?? null;
    const south = hasSouth ? getCachedTile(level, x, y + 1) ?? null : null;
    const se = hasSouth ? getCachedTile(level, eastX, y + 1) ?? null : null;

    const u = Math.max(0, Math.min(1, fxTile - x));
    const v = Math.max(0, Math.min(1, fyTile - y));
    return sampleStitchedMdemUv({ center, east, south, se }, u, v);
  }

  return null;
}

/**
 * Preloads global MDEM200M level-0 (2 tiles) and level-1 (8 tiles) DEM tiles so synchronous
 * queries (routes, elevation/radiation maps, measurements, site analysis) immediately reflect
 * real NASA MOLA + ESA HRSC elevations across the entire planet.
 */
export function prefetchMdemBaseTiles(): Promise<void> {
  if (!prefetchPromise) {
    prefetchPromise = (async () => {
      try {
        await ensureLercReady();
        // Level 0 first (2 tiles -> instant global coverage)
        await Promise.all([fetchMdemTile(0, 0, 0), fetchMdemTile(0, 1, 0)]);
        // Level 1 in parallel (8 tiles -> ~5 km global DEM resolution)
        const level1Tasks: Promise<DecodedMdemTile | null>[] = [];
        for (let y = 0; y < 2; y++) {
          for (let x = 0; x < 4; x++) {
            level1Tasks.push(fetchMdemTile(1, x, y));
          }
        }
        await Promise.all(level1Tasks);
      } catch {
        // Non-fatal: fallback model protects offline execution
      }
    })();
  }
  return prefetchPromise;
}
