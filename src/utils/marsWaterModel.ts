import { MARS_CONSTANTS } from '../data/marsData';
import { NASA_ODYSSEY_WATER_GRID } from '../data/marsWaterGrid';
import {
  computeSurfaceRadiationDoseFromElev,
  getMarsSurfaceTempSample,
  sampleTesTemperatureFast,
} from './marsOverlayMaps';
import { sampleElevationAt } from './molaMegdr';

export interface MarsWaterSample {
  /** Weight-percent water or Water-Equivalent Hydrogen (wt% H2O / WEH) */
  waterWtPct: number;
  /** Formal 1-sigma error (wt%) when directly inside GRS H2O footprint; null if WEH-derived */
  uncertaintyWtPct: number | null;
  /** Mars Odyssey Neutron Spectrometer epithermal neutron flux (counts/s) */
  nsEpithermalCps: number | null;
  source: 'ODY-GRS H2O' | 'ODY-NS Epithermal WEH';
  tier: string;
}

export interface SiteBounds {
  southLat: number;
  northLat: number;
  westLon: number;
  eastLon: number;
}

export interface SitePolygonVertex {
  latDeg: number;
  lonDeg: number;
}

export type HabitabilityTier =
  | 'Prime Habitat Candidate'
  | 'Viable with Shielding & ISRU'
  | 'Challenging — Heavy Support'
  | 'Extreme Hazard Zone';

export interface SiteAnalysisResult {
  bounds: SiteBounds;
  vertices?: SitePolygonVertex[];
  centerLatDeg: number;
  centerLonDeg: number;
  widthKm: number;
  heightKm: number;
  perimeterKm?: number;
  areaKm2: number;
  sampleCount: number;
  elevation: {
    minMeters: number;
    maxMeters: number;
    meanMeters: number;
    reliefMeters: number;
    meanSlopeDeg: number;
    surfacePressureMbar: number;
  };
  radiation: {
    minMsVDay: number;
    meanMsVDay: number;
    maxMsVDay: number;
    annualMeanMsV: number;
    tier: 'Sheltered' | 'Moderate' | 'High Exposure';
  };
  temperature: {
    minC: number | null;
    meanC: number | null;
    maxC: number | null;
    validCoveragePct: number;
    solarLongitudeLs: number;
  };
  water: {
    minWtPct: number;
    meanWtPct: number;
    maxWtPct: number;
    meanNsCps: number | null;
    meanUncertaintyWtPct: number | null;
    primarySource: 'ODY-GRS H2O' | 'ODY-NS Epithermal WEH' | 'ODY GRS + NS Composite';
    tier: string;
  };
  habitability: {
    overallScore: number;
    tier: HabitabilityTier;
    subScores: {
      waterIsru: number;
      radiationShielding: number;
      thermalMildness: number;
      terrainAndPressure: number;
    };
    summary: string;
    advisories: string[];
  };
}

const CELL_DEG = NASA_ODYSSEY_WATER_GRID.grid.cellSizeDegrees;
const LON_CELLS = NASA_ODYSSEY_WATER_GRID.grid.longitudeCells;
const LAT_CELLS = NASA_ODYSSEY_WATER_GRID.grid.latitudeCells;

function wrapLonDeg(lon: number): number {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function sampleBilinearGrid(
  grid: readonly (number | null)[],
  latDeg: number,
  lonDeg: number,
  minWeight = 0.25
): number | null {
  const clampedLat = clamp(latDeg, -89.999, 89.999);
  const wrappedLon = wrapLonDeg(lonDeg);

  const fx = (wrappedLon + 180) / CELL_DEG - 0.5;
  const fy = (clampedLat + 90) / CELL_DEG - 0.5;

  const x0 = Math.floor(fx);
  const y0 = clamp(Math.floor(fy), 0, LAT_CELLS - 1);
  const x1 = x0 + 1;
  const y1 = clamp(y0 + 1, 0, LAT_CELLS - 1);

  const tx = fx - x0;
  const ty = clamp(fy - y0, 0, 1);

  const ix0 = ((x0 % LON_CELLS) + LON_CELLS) % LON_CELLS;
  const ix1 = ((x1 % LON_CELLS) + LON_CELLS) % LON_CELLS;

  const vals = [
    grid[y0 * LON_CELLS + ix0],
    grid[y0 * LON_CELLS + ix1],
    grid[y1 * LON_CELLS + ix0],
    grid[y1 * LON_CELLS + ix1],
  ];
  const weights = [
    (1 - tx) * (1 - ty),
    tx * (1 - ty),
    (1 - tx) * ty,
    tx * ty,
  ];

  let sum = 0;
  let wSum = 0;
  for (let i = 0; i < 4; i++) {
    const val = vals[i];
    if (val !== null && Number.isFinite(val)) {
      sum += val * weights[i];
      wSum += weights[i];
    }
  }
  if (wSum < minWeight) return null;
  return sum / wSum;
}

/**
 * Converts Mars Odyssey Neutron Spectrometer epithermal flux (counts/s) to
 * Water-Equivalent Hydrogen (wt% WEH) following Feldman et al. (2002 / 2004).
 */
function epithermalFluxToWehWtPct(cps: number): number {
  const c = clamp(cps, 1.2, 12.0);
  if (c <= 1.8) {
    // Polar / buried ice cap regime (~52% to 68% WEH)
    return 52 + ((1.8 - c) / 0.6) * 16;
  }
  if (c <= 4.5) {
    // Mid-to-high latitude permafrost transition (~7.5% to 52% WEH)
    const t = (4.5 - c) / (4.5 - 1.8);
    return 7.5 + 44.5 * Math.pow(t, 1.65);
  }
  // Low-to-mid latitude hydrated regolith (~1.6% to 7.5% WEH)
  const t = clamp((10.5 - c) / (10.5 - 4.5), 0, 1);
  return 1.6 + 5.9 * Math.pow(t, 1.2);
}

export function classifyWaterTier(wtPct: number): string {
  if (wtPct >= 20) return 'Abundant Buried Ice (>20 wt%)';
  if (wtPct >= 5.0) return 'High Hydrated Regolith (5–20 wt%)';
  if (wtPct >= 3.2) return 'Moderate Hydrated Minerals (3.2–5 wt%)';
  return 'Low Hydration (<3.2 wt%)';
}

/**
 * Samples NASA 2001 Mars Odyssey H2O / Water-Equivalent Hydrogen concentration
 * at any Martian (latDeg, lonDeg) coordinate using calibrated GRS 5x5 measurements
 * inside [-57.5, +57.5] deg and Odyssey Neutron Spectrometer epithermal flux globally.
 */
export function sampleMarsWaterAvailability(
  latDeg: number,
  lonDeg: number
): MarsWaterSample {
  const grsH2o = sampleBilinearGrid(NASA_ODYSSEY_WATER_GRID.h2oWtPct, latDeg, lonDeg, 0.25);
  const grsSigma = sampleBilinearGrid(NASA_ODYSSEY_WATER_GRID.sigmaWtPct, latDeg, lonDeg, 0.25);
  const nsCps = sampleBilinearGrid(NASA_ODYSSEY_WATER_GRID.nsEpithermalCps, latDeg, lonDeg, 0.1);

  if (grsH2o !== null) {
    return {
      waterWtPct: grsH2o,
      uncertaintyWtPct: grsSigma,
      nsEpithermalCps: nsCps,
      source: 'ODY-GRS H2O',
      tier: classifyWaterTier(grsH2o),
    };
  }

  const weh = nsCps !== null ? epithermalFluxToWehWtPct(nsCps) : 2.5;
  return {
    waterWtPct: weh,
    uncertaintyWtPct: null,
    nsEpithermalCps: nsCps,
    source: 'ODY-NS Epithermal WEH',
    tier: classifyWaterTier(weh),
  };
}

/**
 * Normalizes a two-corner rectangular selection on Mars so westLon -> eastLon
 * always spans the shorter positive longitudinal arc (< 180 deg).
 */
export function normalizeSiteRectangle(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): SiteBounds {
  const southLat = clamp(Math.min(lat1, lat2), -89.9, 89.9);
  const northLat = clamp(Math.max(lat1, lat2), -89.9, 89.9);
  const w1 = wrapLonDeg(lon1);
  const w2 = wrapLonDeg(lon2);
  const diff = wrapLonDeg(w2 - w1);
  if (diff >= 0) {
    return { southLat, northLat, westLon: w1, eastLon: w2 };
  }
  return { southLat, northLat, westLon: w2, eastLon: w1 };
}

export function getPositiveLonSpanDeg(westLon: number, eastLon: number): number {
  let span = eastLon - westLon;
  if (span < 0) span += 360;
  return span;
}

export function computeRectangleDimensionsKm(bounds: SiteBounds): {
  widthKm: number;
  heightKm: number;
  areaKm2: number;
} {
  const rEqKm = MARS_CONSTANTS.EQUATORIAL_RADIUS / 1000;
  const rPolKm = MARS_CONSTANTS.POLAR_RADIUS / 1000;
  const rMeanKm = Math.cbrt(rEqKm * rEqKm * rPolKm);

  const southRad = (bounds.southLat * Math.PI) / 180;
  const northRad = (bounds.northLat * Math.PI) / 180;
  const midLatRad = (southRad + northRad) * 0.5;
  const dLatRad = Math.abs(northRad - southRad);
  const dLonDeg = getPositiveLonSpanDeg(bounds.westLon, bounds.eastLon);
  const dLonRad = (dLonDeg * Math.PI) / 180;

  const heightKm = rMeanKm * dLatRad;
  const widthKm = rEqKm * Math.cos(midLatRad) * dLonRad;
  const areaKm2 = rMeanKm * rMeanKm * dLonRad * Math.abs(Math.sin(northRad) - Math.sin(southRad));

  return { widthKm, heightKm, areaKm2 };
}

function summarizeSiteMetrics({
  bounds,
  vertices,
  centerLatDeg,
  centerLonDeg,
  widthKm,
  heightKm,
  perimeterKm,
  areaKm2,
  sampleElevs,
  sampleCoords,
  slopeSumDeg,
  slopeCount,
  solarLongitudeLs,
}: {
  bounds: SiteBounds;
  vertices?: SitePolygonVertex[];
  centerLatDeg: number;
  centerLonDeg: number;
  widthKm: number;
  heightKm: number;
  perimeterKm?: number;
  areaKm2: number;
  sampleElevs: number[];
  sampleCoords: Array<{ latDeg: number; lonDeg: number }>;
  slopeSumDeg: number;
  slopeCount: number;
  solarLongitudeLs: number;
}): SiteAnalysisResult {
  const totalSamples = Math.max(1, sampleCoords.length);

  let minElev = Infinity;
  let maxElev = -Infinity;
  let sumElev = 0;

  let minRad = Infinity;
  let maxRad = -Infinity;
  let sumRad = 0;

  let minTemp = Infinity;
  let maxTemp = -Infinity;
  let sumTemp = 0;
  let validTempCount = 0;

  let minWater = Infinity;
  let maxWater = -Infinity;
  let sumWater = 0;
  let sumNsCps = 0;
  let nsCpsCount = 0;
  let sumSigma = 0;
  let sigmaCount = 0;
  let grsWaterCount = 0;
  let wehWaterCount = 0;

  for (let i = 0; i < sampleCoords.length; i++) {
    const { latDeg: lat, lonDeg: lon } = sampleCoords[i];
    const elev = sampleElevs[i];
    if (elev < minElev) minElev = elev;
    if (elev > maxElev) maxElev = elev;
    sumElev += elev;

    const rad = computeSurfaceRadiationDoseFromElev(elev);
    if (rad < minRad) minRad = rad;
    if (rad > maxRad) maxRad = rad;
    sumRad += rad;

    const fastTemp = sampleTesTemperatureFast(lat, lon, solarLongitudeLs);
    const resolvedTemp =
      fastTemp !== null ? fastTemp : getMarsSurfaceTempSample(lat, lon, solarLongitudeLs)?.tempC ?? null;
    if (resolvedTemp !== null && Number.isFinite(resolvedTemp)) {
      if (resolvedTemp < minTemp) minTemp = resolvedTemp;
      if (resolvedTemp > maxTemp) maxTemp = resolvedTemp;
      sumTemp += resolvedTemp;
      validTempCount++;
    }

    const waterSample = sampleMarsWaterAvailability(lat, lon);
    if (waterSample.waterWtPct < minWater) minWater = waterSample.waterWtPct;
    if (waterSample.waterWtPct > maxWater) maxWater = waterSample.waterWtPct;
    sumWater += waterSample.waterWtPct;
    if (waterSample.nsEpithermalCps !== null) {
      sumNsCps += waterSample.nsEpithermalCps;
      nsCpsCount++;
    }
    if (waterSample.uncertaintyWtPct !== null) {
      sumSigma += waterSample.uncertaintyWtPct;
      sigmaCount++;
    }
    if (waterSample.source === 'ODY-GRS H2O') grsWaterCount++;
    else wehWaterCount++;
  }

  const meanElev = sumElev / totalSamples;
  const reliefMeters = Math.max(0, maxElev - minElev);
  const meanSlopeDeg = slopeCount > 0 ? slopeSumDeg / slopeCount : 0;
  const surfacePressureMbar = 6.1 * Math.exp(-meanElev / 11100);

  const meanRad = sumRad / totalSamples;
  const annualMeanMsV = meanRad * 365.25;
  const radTier: SiteAnalysisResult['radiation']['tier'] =
    meanRad < 0.55 ? 'Sheltered' : meanRad < 0.78 ? 'Moderate' : 'High Exposure';

  const meanTemp = validTempCount > 0 ? sumTemp / validTempCount : null;
  const validCoveragePct = Math.round((validTempCount / totalSamples) * 100);

  const meanWater = sumWater / totalSamples;
  const meanNsCps = nsCpsCount > 0 ? sumNsCps / nsCpsCount : null;
  const meanUncertaintyWtPct = sigmaCount > 0 ? sumSigma / sigmaCount : null;
  const primarySource: SiteAnalysisResult['water']['primarySource'] =
    grsWaterCount > 0 && wehWaterCount > 0
      ? 'ODY GRS + NS Composite'
      : grsWaterCount > 0
        ? 'ODY-GRS H2O'
        : 'ODY-NS Epithermal WEH';

  // --- Habitability Sub-Scores (each 0-100) ---
  let waterScore: number;
  if (meanWater >= 25) {
    waterScore = 96;
  } else if (meanWater >= 8) {
    waterScore = 86 + ((meanWater - 8) / 17) * 10;
  } else if (meanWater >= 4.5) {
    waterScore = 66 + ((meanWater - 4.5) / 3.5) * 20;
  } else if (meanWater >= 2.5) {
    waterScore = 38 + ((meanWater - 2.5) / 2.0) * 28;
  } else {
    waterScore = clamp((meanWater / 2.5) * 38, 12, 38);
  }
  waterScore = Math.round(clamp(waterScore, 0, 100));

  const radScore = Math.round(clamp(((1.18 - meanRad) / (1.18 - 0.36)) * 88 + 10, 8, 98));

  const refTempC = meanTemp ?? (-28 - Math.max(0, Math.abs(centerLatDeg) - 20) * 0.9);
  let thermalScore: number;
  if (refTempC >= -15) {
    thermalScore = 88 + clamp((refTempC + 15) / 30, 0, 1) * 10;
  } else if (refTempC >= -45) {
    thermalScore = 62 + ((refTempC + 45) / 30) * 26;
  } else if (refTempC >= -85) {
    thermalScore = 28 + ((refTempC + 85) / 40) * 34;
  } else {
    thermalScore = clamp(28 - ((-85 - refTempC) / 40) * 20, 8, 28);
  }
  thermalScore = Math.round(clamp(thermalScore, 0, 100));

  const slopePenalty = clamp(meanSlopeDeg * 4.5, 0, 52);
  const elevScore = clamp(((7000 - meanElev) / 15000) * 55 + 45, 18, 98);
  const terrainScore = Math.round(clamp(elevScore - slopePenalty, 10, 98));

  const overallScore = Math.round(
    clamp(
      0.3 * waterScore +
        0.25 * radScore +
        0.25 * thermalScore +
        0.2 * terrainScore,
      0,
      100
    )
  );

  let tier: HabitabilityTier;
  if (overallScore >= 80) tier = 'Prime Habitat Candidate';
  else if (overallScore >= 62) tier = 'Viable with Shielding & ISRU';
  else if (overallScore >= 42) tier = 'Challenging — Heavy Support';
  else tier = 'Extreme Hazard Zone';

  const advisories: string[] = [];
  if (meanWater >= 15) {
    advisories.push(`Rich shallow water-ice reservoir (~${meanWater.toFixed(1)} wt% WEH) lowers ISRU propellant mass.`);
  } else if (meanWater >= 4.5) {
    advisories.push(`Above-average hydrated regolith (${meanWater.toFixed(2)} wt% H2O) supports clay/mineral water extraction.`);
  } else {
    advisories.push(`Low surface hydration (${meanWater.toFixed(2)} wt% H2O) requires closed-loop recycling or water hauling.`);
  }

  if (meanRad <= 0.52) {
    advisories.push(`Deep atmospheric column (${surfacePressureMbar.toFixed(1)} mbar) attenuates surface dose to ${meanRad.toFixed(2)} mSv/day.`);
  } else if (meanRad >= 0.78) {
    advisories.push(`Thin atmosphere (${surfacePressureMbar.toFixed(1)} mbar) elevates GCR dose to ${meanRad.toFixed(2)} mSv/day — buried regolith shielding advised.`);
  } else {
    advisories.push(`Moderate radiation dose (${meanRad.toFixed(2)} mSv/day; ${annualMeanMsV.toFixed(0)} mSv/yr) comparable to Gale Crater baseline.`);
  }

  if (meanSlopeDeg >= 8 || reliefMeters >= 3500) {
    advisories.push(`Significant local relief (${Math.round(reliefMeters).toLocaleString()} m, ~${meanSlopeDeg.toFixed(1)}° mean slope) demands precision hazard-avoidance landing.`);
  } else if (meanTemp !== null && meanTemp <= -65) {
    advisories.push(`Cryogenic daytime mean (${Math.round(meanTemp)}°C at Ls ${solarLongitudeLs}°) drives higher habitat heating demand.`);
  }

  const summary =
    tier === 'Prime Habitat Candidate'
      ? 'Balanced atmospheric shielding, accessible water reserves, and benign landing terrain make this site well-suited for sustained human operations.'
      : tier === 'Viable with Shielding & ISRU'
        ? 'Feasible outpost location combining practical water extraction potential with manageable radiation and thermal engineering margins.'
        : tier === 'Challenging — Heavy Support'
          ? 'Site presents notable radiation, cryogenic, or terrain hazards requiring reinforced habitat shielding and robust thermal/ISRU infrastructure.'
          : 'Severe elevation, radiation, or cryogenic penalties make sustained surface habitation high-risk without subsurface or orbital shelter.';

  return {
    bounds,
    vertices,
    centerLatDeg,
    centerLonDeg,
    widthKm,
    heightKm,
    perimeterKm,
    areaKm2,
    sampleCount: totalSamples,
    elevation: {
      minMeters: minElev,
      maxMeters: maxElev,
      meanMeters: meanElev,
      reliefMeters,
      meanSlopeDeg,
      surfacePressureMbar,
    },
    radiation: {
      minMsVDay: minRad,
      meanMsVDay: meanRad,
      maxMsVDay: maxRad,
      annualMeanMsV,
      tier: radTier,
    },
    temperature: {
      minC: validTempCount > 0 ? minTemp : null,
      meanC: meanTemp,
      maxC: validTempCount > 0 ? maxTemp : null,
      validCoveragePct,
      solarLongitudeLs,
    },
    water: {
      minWtPct: minWater,
      meanWtPct: meanWater,
      maxWtPct: maxWater,
      meanNsCps,
      meanUncertaintyWtPct,
      primarySource,
      tier: classifyWaterTier(meanWater),
    },
    habitability: {
      overallScore,
      tier,
      subScores: {
        waterIsru: waterScore,
        radiationShielding: radScore,
        thermalMildness: thermalScore,
        terrainAndPressure: terrainScore,
      },
      summary,
      advisories,
    },
  };
}

export function unwrapPolygonRing(vertices: SitePolygonVertex[]): SitePolygonVertex[] {
  if (vertices.length === 0) return [];
  const unwrapped: SitePolygonVertex[] = [
    {
      latDeg: clamp(vertices[0].latDeg, -89.9, 89.9),
      lonDeg: wrapLonDeg(vertices[0].lonDeg),
    },
  ];
  for (let i = 1; i < vertices.length; i++) {
    const prevLon = unwrapped[i - 1].lonDeg;
    const delta = wrapLonDeg(vertices[i].lonDeg - prevLon);
    unwrapped.push({
      latDeg: clamp(vertices[i].latDeg, -89.9, 89.9),
      lonDeg: prevLon + delta,
    });
  }
  return unwrapped;
}

function isPointInUnwrappedPolygon(
  lonDeg: number,
  latDeg: number,
  ring: SitePolygonVertex[]
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lonDeg;
    const yi = ring[i].latDeg;
    const xj = ring[j].lonDeg;
    const yj = ring[j].latDeg;
    const intersects =
      yi > latDeg !== yj > latDeg &&
      lonDeg < ((xj - xi) * (latDeg - yi)) / (yj - yi + 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function computePolygonMetricsKm(vertices: SitePolygonVertex[]): {
  bounds: SiteBounds;
  unwrapped: SitePolygonVertex[];
  widthKm: number;
  heightKm: number;
  perimeterKm: number;
  areaKm2: number;
  centerLatDeg: number;
  centerLonDeg: number;
} {
  const unwrapped = unwrapPolygonRing(vertices);
  if (unwrapped.length < 3) {
    const pt = unwrapped[0] ?? { latDeg: 0, lonDeg: 0 };
    return {
      bounds: {
        southLat: pt.latDeg,
        northLat: pt.latDeg,
        westLon: pt.lonDeg,
        eastLon: pt.lonDeg,
      },
      unwrapped,
      widthKm: 0,
      heightKm: 0,
      perimeterKm: 0,
      areaKm2: 0,
      centerLatDeg: pt.latDeg,
      centerLonDeg: wrapLonDeg(pt.lonDeg),
    };
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let sumLat = 0;
  let sumLon = 0;

  for (const v of unwrapped) {
    if (v.latDeg < minLat) minLat = v.latDeg;
    if (v.latDeg > maxLat) maxLat = v.latDeg;
    if (v.lonDeg < minLon) minLon = v.lonDeg;
    if (v.lonDeg > maxLon) maxLon = v.lonDeg;
    sumLat += v.latDeg;
    sumLon += v.lonDeg;
  }

  const rEqKm = MARS_CONSTANTS.EQUATORIAL_RADIUS / 1000;
  const rPolKm = MARS_CONSTANTS.POLAR_RADIUS / 1000;
  const rMeanKm = Math.cbrt(rEqKm * rEqKm * rPolKm);

  const midLatRad = (((minLat + maxLat) * 0.5) * Math.PI) / 180;
  const heightKm = rMeanKm * (((maxLat - minLat) * Math.PI) / 180);
  const widthKm = rEqKm * Math.cos(midLatRad) * (((maxLon - minLon) * Math.PI) / 180);

  // Spherical polygon area & perimeter
  let areaSum = 0;
  let perimeterKm = 0;
  for (let i = 0; i < unwrapped.length; i++) {
    const p0 = unwrapped[i];
    const p1 = unwrapped[(i + 1) % unwrapped.length];
    const lat0 = (p0.latDeg * Math.PI) / 180;
    const lat1 = (p1.latDeg * Math.PI) / 180;
    const lon0 = (p0.lonDeg * Math.PI) / 180;
    const lon1 = (p1.lonDeg * Math.PI) / 180;
    areaSum += (lon1 - lon0) * (2 + Math.sin(lat0) + Math.sin(lat1));

    const dLat = lat1 - lat0;
    const dLon = lon1 - lon0;
    const sinHalfLat = Math.sin(dLat * 0.5);
    const sinHalfLon = Math.sin(dLon * 0.5);
    const h =
      sinHalfLat * sinHalfLat +
      Math.cos(lat0) * Math.cos(lat1) * sinHalfLon * sinHalfLon;
    perimeterKm += 2 * rMeanKm * Math.asin(Math.min(1, Math.sqrt(Math.max(0, h))));
  }

  const areaKm2 = Math.abs(areaSum * 0.5) * rMeanKm * rMeanKm;

  return {
    bounds: {
      southLat: minLat,
      northLat: maxLat,
      westLon: wrapLonDeg(minLon),
      eastLon: wrapLonDeg(maxLon),
    },
    unwrapped,
    widthKm,
    heightKm,
    perimeterKm,
    areaKm2,
    centerLatDeg: sumLat / unwrapped.length,
    centerLonDeg: wrapLonDeg(sumLon / unwrapped.length),
  };
}

/**
 * Evaluates a freehand-drawn Martian polygon site across Elevation, Radiation,
 * Temperature (NASA TES), and Water Availability (NASA Odyssey GRS/NS).
 */
export function analyzeMarsSitePolygon(
  vertices: SitePolygonVertex[],
  solarLongitudeLs = 0
): SiteAnalysisResult {
  const {
    bounds,
    unwrapped,
    widthKm,
    heightKm,
    perimeterKm,
    areaKm2,
    centerLatDeg: vertexCenterLat,
    centerLonDeg: vertexCenterLon,
  } = computePolygonMetricsKm(vertices);

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const v of unwrapped) {
    if (v.latDeg < minLat) minLat = v.latDeg;
    if (v.latDeg > maxLat) maxLat = v.latDeg;
    if (v.lonDeg < minLon) minLon = v.lonDeg;
    if (v.lonDeg > maxLon) maxLon = v.lonDeg;
  }

  const GRID_N = 20;
  const dLatDeg = Math.max(1e-6, maxLat - minLat);
  const dLonDeg = Math.max(1e-6, maxLon - minLon);

  const sampleCoords: Array<{ latDeg: number; lonDeg: number }> = [];
  const sampleElevs: number[] = [];
  const insideGrid: Array<Array<number | null>> = [];
  let insideLatSum = 0;
  let insideLonSum = 0;

  for (let iy = 0; iy < GRID_N; iy++) {
    const lat = minLat + ((iy + 0.5) / GRID_N) * dLatDeg;
    const row: Array<number | null> = [];
    for (let ix = 0; ix < GRID_N; ix++) {
      const lonU = minLon + ((ix + 0.5) / GRID_N) * dLonDeg;
      if (isPointInUnwrappedPolygon(lonU, lat, unwrapped)) {
        const lon = wrapLonDeg(lonU);
        const elev = sampleElevationAt(lon, lat);
        row.push(elev);
        sampleCoords.push({ latDeg: lat, lonDeg: lon });
        sampleElevs.push(elev);
        insideLatSum += lat;
        insideLonSum += lonU;
      } else {
        row.push(null);
      }
    }
    insideGrid.push(row);
  }

  const stepXKm = Math.max(0.02, widthKm / GRID_N);
  const stepYKm = Math.max(0.02, heightKm / GRID_N);
  let slopeSumDeg = 0;
  let slopeCount = 0;
  for (let iy = 0; iy < GRID_N; iy++) {
    for (let ix = 0; ix < GRID_N; ix++) {
      const e0 = insideGrid[iy][ix];
      if (e0 === null) continue;
      if (ix + 1 < GRID_N && insideGrid[iy][ix + 1] !== null) {
        const dzKm = Math.abs((insideGrid[iy][ix + 1] as number) - e0) / 1000;
        slopeSumDeg += (Math.atan2(dzKm, stepXKm) * 180) / Math.PI;
        slopeCount++;
      }
      if (iy + 1 < GRID_N && insideGrid[iy + 1][ix] !== null) {
        const dzKm = Math.abs((insideGrid[iy + 1][ix] as number) - e0) / 1000;
        slopeSumDeg += (Math.atan2(dzKm, stepYKm) * 180) / Math.PI;
        slopeCount++;
      }
    }
  }

  // Fallback for very slender shapes with sparse interior grid hits: sample boundary + centroid
  if (sampleCoords.length < 8 && unwrapped.length >= 3) {
    const step = Math.max(1, Math.floor(unwrapped.length / 24));
    for (let i = 0; i < unwrapped.length; i += step) {
      const lat = unwrapped[i].latDeg;
      const lon = wrapLonDeg(unwrapped[i].lonDeg);
      sampleCoords.push({ latDeg: lat, lonDeg: lon });
      sampleElevs.push(sampleElevationAt(lon, lat));
    }
    sampleCoords.push({ latDeg: vertexCenterLat, lonDeg: vertexCenterLon });
    sampleElevs.push(sampleElevationAt(vertexCenterLon, vertexCenterLat));
  }

  if (slopeCount < 4) {
    const rMeanKm =
      Math.cbrt(
        MARS_CONSTANTS.EQUATORIAL_RADIUS *
          MARS_CONSTANTS.EQUATORIAL_RADIUS *
          MARS_CONSTANTS.POLAR_RADIUS
      ) / 1000;
    const probeKm = Math.max(0.05, Math.min(2.0, Math.sqrt(Math.max(0.01, areaKm2)) * 0.12));
    const dLatProbe = (probeKm / rMeanKm) * (180 / Math.PI);
    for (let i = 0; i < sampleCoords.length; i += Math.max(1, Math.floor(sampleCoords.length / 16))) {
      const { latDeg, lonDeg } = sampleCoords[i];
      const cosLat = Math.max(0.15, Math.cos((latDeg * Math.PI) / 180));
      const dLonProbe = dLatProbe / cosLat;
      const eC = sampleElevs[i];
      const eN = sampleElevationAt(lonDeg, clamp(latDeg + dLatProbe, -89.9, 89.9));
      const eE = sampleElevationAt(wrapLonDeg(lonDeg + dLonProbe), latDeg);
      slopeSumDeg += (Math.atan2(Math.abs(eN - eC) / 1000, probeKm) * 180) / Math.PI;
      slopeSumDeg += (Math.atan2(Math.abs(eE - eC) / 1000, probeKm) * 180) / Math.PI;
      slopeCount += 2;
    }
  }

  const centerLatDeg =
    sampleCoords.length > 0 && insideLatSum !== 0
      ? insideLatSum / (sampleCoords.length - (insideGrid.flat().filter((v) => v !== null).length < 8 ? sampleCoords.length - insideGrid.flat().filter((v) => v !== null).length : 0))
      : vertexCenterLat;
  const insideCount = insideGrid.flat().filter((v) => v !== null).length;
  const resolvedCenterLat = insideCount >= 3 ? insideLatSum / insideCount : vertexCenterLat;
  const resolvedCenterLon =
    insideCount >= 3 ? wrapLonDeg(insideLonSum / insideCount) : vertexCenterLon;
  void centerLatDeg;

  return summarizeSiteMetrics({
    bounds,
    vertices: unwrapped.map((v) => ({ latDeg: v.latDeg, lonDeg: wrapLonDeg(v.lonDeg) })),
    centerLatDeg: resolvedCenterLat,
    centerLonDeg: resolvedCenterLon,
    widthKm,
    heightKm,
    perimeterKm,
    areaKm2,
    sampleElevs,
    sampleCoords,
    slopeSumDeg,
    slopeCount,
    solarLongitudeLs,
  });
}

/**
 * Evaluates a selected rectangular Martian site across Elevation, Radiation,
 * Temperature (NASA TES), and Water Availability (NASA Odyssey GRS/NS),
 * returning summary statistics and a 0-100 Habitability Condition Score.
 */
export function analyzeMarsSiteRectangle(
  bounds: SiteBounds,
  solarLongitudeLs = 0
): SiteAnalysisResult {
  const { widthKm, heightKm, areaKm2 } = computeRectangleDimensionsKm(bounds);
  const dLonDeg = getPositiveLonSpanDeg(bounds.westLon, bounds.eastLon);
  const dLatDeg = Math.abs(bounds.northLat - bounds.southLat);

  const centerLatDeg = (bounds.southLat + bounds.northLat) * 0.5;
  const centerLonDeg = wrapLonDeg(bounds.westLon + dLonDeg * 0.5);

  const GRID_N = 12;
  const elevGrid: number[][] = [];
  const sampleCoords: Array<{ latDeg: number; lonDeg: number }> = [];
  const sampleElevs: number[] = [];

  for (let iy = 0; iy < GRID_N; iy++) {
    const v = (iy + 0.5) / GRID_N;
    const lat = bounds.southLat + v * dLatDeg;
    const rowElev: number[] = [];

    for (let ix = 0; ix < GRID_N; ix++) {
      const u = (ix + 0.5) / GRID_N;
      const lon = wrapLonDeg(bounds.westLon + u * dLonDeg);
      const elev = sampleElevationAt(lon, lat);
      rowElev.push(elev);
      sampleCoords.push({ latDeg: lat, lonDeg: lon });
      sampleElevs.push(elev);
    }
    elevGrid.push(rowElev);
  }

  const stepXKm = Math.max(0.02, widthKm / GRID_N);
  const stepYKm = Math.max(0.02, heightKm / GRID_N);
  let slopeSumDeg = 0;
  let slopeCount = 0;
  for (let iy = 0; iy < GRID_N; iy++) {
    for (let ix = 0; ix < GRID_N; ix++) {
      if (ix + 1 < GRID_N) {
        const dzKm = Math.abs(elevGrid[iy][ix + 1] - elevGrid[iy][ix]) / 1000;
        slopeSumDeg += (Math.atan2(dzKm, stepXKm) * 180) / Math.PI;
        slopeCount++;
      }
      if (iy + 1 < GRID_N) {
        const dzKm = Math.abs(elevGrid[iy + 1][ix] - elevGrid[iy][ix]) / 1000;
        slopeSumDeg += (Math.atan2(dzKm, stepYKm) * 180) / Math.PI;
        slopeCount++;
      }
    }
  }

  return summarizeSiteMetrics({
    bounds,
    centerLatDeg,
    centerLonDeg,
    widthKm,
    heightKm,
    areaKm2,
    sampleElevs,
    sampleCoords,
    slopeSumDeg,
    slopeCount,
    solarLongitudeLs,
  });
}
