import { NASA_TES_TEMPERATURE_GRID } from '../data/marsTesTemperatureGrid';
import { sampleElevationAt } from './molaMegdr';

/**
 * Computes calibrated surface radiation dose (mSv/day) from surface elevation (meters)
 * using Martian atmospheric column shielding calibrated to Curiosity MSL RAD (~0.64 mSv/day).
 */
export function computeSurfaceRadiationDoseFromElev(elevMeters: number): number {
  const scaleHeightMeters = 11100;
  const relPressure = Math.exp(-elevMeters / scaleHeightMeters);
  const shieldingFactor = Math.exp(-0.44 * relPressure);
  const rawDose = 1.24 * shieldingFactor;
  return Math.max(0.2, Math.min(1.28, rawDose));
}

/**
 * Computes calibrated surface radiation dose (mSv/day) at (lonDeg, latDeg)
 * using Martian atmospheric column shielding calibrated to Curiosity MSL RAD (~0.64 mSv/day).
 */
export function computeSurfaceRadiationDose(lonDeg: number, latDeg: number): number {
  return computeSurfaceRadiationDoseFromElev(sampleElevationAt(lonDeg, latDeg));
}

export function doseToBlackGreenRgb(dose: number): [number, number, number] {
  const tRaw = Math.max(0, Math.min(1, (dose - 0.36) / (1.14 - 0.36)));
  const t = Math.pow(tRaw, 1.35);

  if (t < 0.22) {
    const k = t / 0.22;
    return [0, Math.round(26 * k), Math.round(5 * k)];
  }
  if (t < 0.55) {
    const k = (t - 0.22) / 0.33;
    return [0, Math.round(26 + (143 - 26) * k), Math.round(5 + (17 - 5) * k)];
  }
  if (t < 0.85) {
    const k = (t - 0.55) / 0.30;
    return [0, Math.round(143 + (255 - 143) * k), Math.round(17 + (65 - 17) * k)];
  }
  const k = (t - 0.85) / 0.15;
  return [Math.round(125 * k), 255, Math.round(65 + (155 - 65) * k)];
}

/** Exact shared color ramp for the Temperature canvas and its on-screen legend. */
export const MARS_TEMPERATURE_GRADIENT_CSS =
  'linear-gradient(90deg, #1a0066 0%, #00e5ff 34.48%, #00e640 65.52%, #ffe600 75.86%, #ff6600 86.21%, #ff0000 100%)';

const TEMPERATURE_COLOR_STOPS: Array<[number, [number, number, number]]> = [
  [-125, [26, 0, 102]], // Violet-blue
  [-75, [0, 229, 255]], // Cyan
  [-30, [0, 230, 64]], // Green
  [-15, [255, 230, 0]], // Yellow
  [0, [255, 102, 0]], // Orange
  [20, [255, 0, 0]], // Red
];

const GRID_DEGREES = NASA_TES_TEMPERATURE_GRID.grid.cellSizeDegrees;
const LON_CELLS = NASA_TES_TEMPERATURE_GRID.grid.longitudeCells;
const LAT_CELLS = NASA_TES_TEMPERATURE_GRID.grid.latitudeCells;
const CELL_COUNT = LON_CELLS * LAT_CELLS;
const SEASON_COUNT = NASA_TES_TEMPERATURE_GRID.grid.seasons;

export interface MarsSurfaceTempSample {
  tempC: number;
  sampleCount: number;
  formalErrorK: number | null;
  localTimeHours: number | null;
  seasonLsStart: number | null;
  source: 'seasonal TES observations' | 'multi-season TES fallback';
  distanceDegrees: number;
}

interface SampleGrid {
  temperatureC: readonly (number | null)[];
  sampleCount: readonly number[];
  formalErrorK: readonly (number | null)[];
  localTimeHours: readonly (number | null)[];
}

// Precompute a quality-weighted multi-season fallback once. This is still real TES data,
// used only where the selected Ls bin has no sufficiently nearby valid observations.
const annualTempSums = new Array<number>(CELL_COUNT).fill(0);
const annualWeights = new Array<number>(CELL_COUNT).fill(0);
const annualCounts = new Array<number>(CELL_COUNT).fill(0);
const annualErrorSums = new Array<number>(CELL_COUNT).fill(0);
const annualTimeSums = new Array<number>(CELL_COUNT).fill(0);

for (let season = 0; season < SEASON_COUNT; season++) {
  const source = NASA_TES_TEMPERATURE_GRID.seasons[season];
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const tempC = source.temperatureC[cell];
    const count = source.sampleCount[cell];
    const errorK = source.formalErrorK[cell];
    const localTime = source.localTimeHours[cell];
    if (tempC === null || count <= 0) continue;
    const weight = Math.min(count, 1000) / Math.max((errorK ?? 2) ** 2, 0.25);
    annualTempSums[cell] += tempC * weight;
    annualWeights[cell] += weight;
    annualCounts[cell] += count;
    annualErrorSums[cell] += (errorK ?? 2) * weight;
    annualTimeSums[cell] += (localTime ?? 13) * weight;
  }
}

const annualGrid: SampleGrid = {
  temperatureC: annualWeights.map((weight, cell) =>
    weight > 0 ? Math.round((annualTempSums[cell] / weight) * 10) / 10 : null
  ),
  sampleCount: annualCounts,
  formalErrorK: annualWeights.map((weight, cell) =>
    weight > 0 ? Math.round((annualErrorSums[cell] / weight) * 10) / 10 : null
  ),
  localTimeHours: annualWeights.map((weight, cell) =>
    weight > 0 ? Math.round((annualTimeSums[cell] / weight) * 10) / 10 : null
  ),
};

// Cached dense Float32Array lookup grids per season index for O(1) bilinear LOD tile rendering
const seasonalDenseTempCache = new Map<number, Float32Array>();

function getSeasonalDenseTempGrid(seasonIndex: number): Float32Array {
  const cached = seasonalDenseTempCache.get(seasonIndex);
  if (cached) return cached;

  const season = NASA_TES_TEMPERATURE_GRID.seasons[seasonIndex];
  const arr = new Float32Array(CELL_COUNT);
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const sTemp = season.temperatureC[cell];
    const sCount = season.sampleCount[cell];
    if (sTemp !== null && sCount > 0) {
      arr[cell] = sTemp;
    } else {
      const aTemp = annualGrid.temperatureC[cell];
      arr[cell] = aTemp !== null && annualGrid.sampleCount[cell] > 0 ? aTemp : Number.NaN;
    }
  }
  seasonalDenseTempCache.set(seasonIndex, arr);
  return arr;
}

/**
 * O(1) smooth bilinear TES surface temperature sampler for multi-resolution tile pyramids.
 * Returns null where surrounding TES cells have no quality-screened observations.
 */
export function sampleTesTemperatureFast(
  lat: number,
  lon: number,
  solarLongitudeLs = 0
): number | null {
  const seasonIndex = seasonIndexForLs(solarLongitudeLs);
  const grid = getSeasonalDenseTempGrid(seasonIndex);

  const clampedLat = Math.max(-89.999, Math.min(89.999, lat));
  const wrappedLon = wrapLongitude(lon);

  // Continuous cell-center coordinates in [0..LON_CELLS) and [0..LAT_CELLS)
  const fx = (wrappedLon + 180) / GRID_DEGREES - 0.5;
  const fy = (clampedLat + 90) / GRID_DEGREES - 0.5;

  const x0 = Math.floor(fx);
  const y0 = Math.max(0, Math.min(LAT_CELLS - 1, Math.floor(fy)));
  const x1 = x0 + 1;
  const y1 = Math.max(0, Math.min(LAT_CELLS - 1, y0 + 1));

  const tx = fx - x0;
  const ty = Math.max(0, Math.min(1, fy - y0));

  const ix0 = ((x0 % LON_CELLS) + LON_CELLS) % LON_CELLS;
  const ix1 = ((x1 % LON_CELLS) + LON_CELLS) % LON_CELLS;

  const v00 = grid[y0 * LON_CELLS + ix0];
  const v10 = grid[y0 * LON_CELLS + ix1];
  const v01 = grid[y1 * LON_CELLS + ix0];
  const v11 = grid[y1 * LON_CELLS + ix1];

  const weights = [
    (1 - tx) * (1 - ty),
    tx * (1 - ty),
    (1 - tx) * ty,
    tx * ty,
  ];
  const vals = [v00, v10, v01, v11];

  let sum = 0;
  let wSum = 0;
  for (let i = 0; i < 4; i++) {
    if (!Number.isNaN(vals[i])) {
      sum += vals[i] * weights[i];
      wSum += weights[i];
    }
  }

  // Keep areas with zero nearby valid observations transparent
  if (wSum < 0.25) return null;
  return sum / wSum;
}

function wrapLongitude(lon: number): number {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

function seasonIndexForLs(ls: number): number {
  const normalizedLs = ((ls % 360) + 360) % 360;
  return Math.min(SEASON_COUNT - 1, Math.floor(normalizedLs / 30));
}

function searchGrid(
  grid: SampleGrid,
  latitude: number,
  longitude: number,
  maxDistanceDegrees: number,
  seasonLsStart: number | null,
  source: MarsSurfaceTempSample['source']
): MarsSurfaceTempSample | null {
  const lon = wrapLongitude(longitude);
  const lat = Math.max(-90, Math.min(90, latitude));
  const centerLonIndex = Math.min(LON_CELLS - 1, Math.floor((lon + 180) / GRID_DEGREES));
  const centerLatIndex = Math.min(LAT_CELLS - 1, Math.floor((lat + 90) / GRID_DEGREES));
  const searchRadius = Math.ceil(maxDistanceDegrees / GRID_DEGREES) + 1;
  const candidates: Array<{ cell: number; distance: number }> = [];

  for (
    let latIndex = Math.max(0, centerLatIndex - searchRadius);
    latIndex <= Math.min(LAT_CELLS - 1, centerLatIndex + searchRadius);
    latIndex++
  ) {
    for (let lonOffset = -searchRadius; lonOffset <= searchRadius; lonOffset++) {
      const lonIndex = (centerLonIndex + lonOffset + LON_CELLS) % LON_CELLS;
      const cell = latIndex * LON_CELLS + lonIndex;
      if (grid.temperatureC[cell] === null || grid.sampleCount[cell] <= 0) continue;
      const cellLat = -90 + (latIndex + 0.5) * GRID_DEGREES;
      const cellLon = -180 + (lonIndex + 0.5) * GRID_DEGREES;
      const deltaLon = wrapLongitude(cellLon - lon) * Math.cos((lat * Math.PI) / 180);
      const distance = Math.hypot(cellLat - lat, deltaLon);
      if (distance <= maxDistanceDegrees) candidates.push({ cell, distance });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.distance - b.distance);
  const nearest = candidates.slice(0, 4);
  let weightedTemp = 0;
  let weightedError = 0;
  let weightedLocalTime = 0;
  let totalWeight = 0;
  let totalCount = 0;

  for (const candidate of nearest) {
    const cell = candidate.cell;
    const tempC = grid.temperatureC[cell];
    if (tempC === null) continue;
    const errorK = grid.formalErrorK[cell] ?? 2;
    const sampleCount = grid.sampleCount[cell];
    const weight = Math.min(sampleCount, 1000) /
      (Math.max(errorK ** 2, 0.25) * (1 + candidate.distance ** 2));
    weightedTemp += tempC * weight;
    weightedError += errorK * weight;
    weightedLocalTime += (grid.localTimeHours[cell] ?? 13) * weight;
    totalWeight += weight;
    totalCount += sampleCount;
  }
  if (!totalWeight) return null;

  return {
    tempC: weightedTemp / totalWeight,
    sampleCount: totalCount,
    formalErrorK: weightedError / totalWeight,
    localTimeHours: weightedLocalTime / totalWeight,
    seasonLsStart,
    source,
    distanceDegrees: nearest[0].distance,
  };
}

/** Return the nearest quality-screened MGS TES daytime observation composite at a location. */
export function getMarsSurfaceTempSample(
  lat: number,
  lon: number,
  solarLongitudeLs = 0
): MarsSurfaceTempSample | null {
  const seasonIndex = seasonIndexForLs(solarLongitudeLs);
  const season = NASA_TES_TEMPERATURE_GRID.seasons[seasonIndex];
  const seasonalSample = searchGrid(
    season,
    lat,
    lon,
    10,
    season.lsStart,
    'seasonal TES observations'
  );
  if (seasonalSample) return seasonalSample;

  return searchGrid(
    annualGrid,
    lat,
    lon,
    14,
    null,
    'multi-season TES fallback'
  );
}

/**
 * Shared temperature lookup used by the globe canvas, inline weather labels, cards, and route model.
 * Values come from MGS TES archive retrieval composites; no-data locations return null.
 */
export function getMarsSurfaceTempC(
  lat: number,
  lon: number,
  solarLongitudeLs = 0
): number | null {
  return getMarsSurfaceTempSample(lat, lon, solarLongitudeLs)?.tempC ?? null;
}

export function formatMarsSurfaceTempC(tempC: number | null): string {
  if (tempC === null || !Number.isFinite(tempC)) return 'No TES data';
  const rounded = Math.round(tempC);
  return `${rounded > 0 ? '+' : ''}${rounded}°C`;
}

export function tempToRainbowRgb(tempC: number): [number, number, number] {
  const temp = Math.max(-125, Math.min(20, tempC));
  for (let i = 0; i < TEMPERATURE_COLOR_STOPS.length - 1; i++) {
    const [temp0, color0] = TEMPERATURE_COLOR_STOPS[i];
    const [temp1, color1] = TEMPERATURE_COLOR_STOPS[i + 1];
    if (temp <= temp1) {
      const k = (temp - temp0) / (temp1 - temp0);
      return [
        Math.round(color0[0] + (color1[0] - color0[0]) * k),
        Math.round(color0[1] + (color1[1] - color0[1]) * k),
        Math.round(color0[2] + (color1[2] - color0[2]) * k),
      ];
    }
  }
  return [255, 0, 0];
}

export function elevationToGrayscaleRgb(elevMeters: number): [number, number, number] {
  // -8000 m -> 0 (#000000), 0 m -> ~128 (#808080), +21000 m -> 255 (#FFFFFF)
  let norm: number;
  if (elevMeters <= 0) {
    norm = 0.5 * Math.max(0, (elevMeters + 8000) / 8000);
  } else {
    norm = 0.5 + 0.5 * Math.min(1, elevMeters / 21000);
  }
  const v = Math.round(Math.max(0, Math.min(255, norm * 255)));
  return [v, v, v];
}

function renderEquirectangularMap(
  width: number,
  height: number,
  pixelFn: (lonDeg: number, latDeg: number) => [number, number, number] | [number, number, number, number],
  gridW = 1024,
  gridH = 512
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const offscreen = document.createElement('canvas');
  offscreen.width = gridW;
  offscreen.height = gridH;
  const octx = offscreen.getContext('2d');
  if (!octx) return '';

  const imgData = octx.createImageData(gridW, gridH);
  const data = imgData.data;

  for (let row = 0; row < gridH; row++) {
    const latDeg = 90 - ((row + 0.5) / gridH) * 180;
    for (let col = 0; col < gridW; col++) {
      const lonDeg = -180 + ((col + 0.5) / gridW) * 360;
      const color = pixelFn(lonDeg, latDeg);
      const idx = (row * gridW + col) * 4;
      data[idx] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = color[3] ?? 255;
    }
  }

  octx.putImageData(imgData, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(offscreen, 0, 0, width, height);

  return canvas.toDataURL('image/png');
}

export function generateMarsRadiationDataUrl(width = 2048, height = 1024): string {
  return renderEquirectangularMap(width, height, (lon, lat) =>
    doseToBlackGreenRgb(computeSurfaceRadiationDose(lon, lat))
  );
}

export function generateMarsTemperatureDataUrl(
  width = 2048,
  height = 1024,
  solarLongitudeLs = 0
): string {
  // TES source retrievals are binned at 4°; a 1° working raster provides smooth
  // texture sampling without expensive sub-degree searches of sparse data.
  return renderEquirectangularMap(width, height, (lon, lat) => {
    const tempC = getMarsSurfaceTempC(lat, lon, solarLongitudeLs);
    if (tempC === null) return [0, 0, 0, 0];
    const [r, g, b] = tempToRainbowRgb(tempC);
    return [r, g, b, 255];
  }, 360, 180);
}

export function generateMarsElevationGrayscaleDataUrl(width = 2048, height = 1024): string {
  return renderEquirectangularMap(width, height, (lon, lat) =>
    elevationToGrayscaleRgb(sampleElevationAt(lon, lat))
  );
}
