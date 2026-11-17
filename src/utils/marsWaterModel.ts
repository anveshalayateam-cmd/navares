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

export type HabitabilityTier =
  | 'Prime Habitat Candidate'
  | 'Viable with Shielding & ISRU'
  | 'Challenging — Heavy Support'
  | 'Extreme Hazard Zone';

export interface SiteAnalysisResult {
  bounds: SiteBounds;
  centerLatDeg: number;
  centerLonDeg: number;
  widthKm: number;
  heightKm: number;
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

  const maxSpanKm = Math.max(widthKm, heightKm);
  const detailLevel = maxSpanKm < 15 ? 11 : maxSpanKm < 120 ? 8 : 6;

  const GRID_N = 12;
  const elevGrid: number[][] = [];

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

  const totalSamples = GRID_N * GRID_N;

  for (let iy = 0; iy < GRID_N; iy++) {
    const v = (iy + 0.5) / GRID_N;
    const lat = bounds.southLat + v * dLatDeg;
    const rowElev: number[] = [];

    for (let ix = 0; ix < GRID_N; ix++) {
      const u = (ix + 0.5) / GRID_N;
      const lon = wrapLonDeg(bounds.westLon + u * dLonDeg);

      const elev = sampleElevationAt(lon, lat);
      rowElev.push(elev);
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
    elevGrid.push(rowElev);
  }

  // Estimate mean local terrain slope from interior cell elevation steps
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
  // 1) Water / ISRU Availability (30%)
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

  // 2) Radiation Shielding (25%) — lower mSv/day yields higher score
  const radScore = Math.round(clamp(((1.18 - meanRad) / (1.18 - 0.36)) * 88 + 10, 8, 98));

  // 3) Thermal Mildness (25%) — daytime TES surface temp relative to human base thermal budget
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

  // 4) Terrain Flatness & Aerodynamic EDL Pressure Margin (20%)
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
    centerLatDeg,
    centerLonDeg,
    widthKm,
    heightKm,
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
