/**
 * High-precision NASA MOLA-calibrated Martian elevation model with:
 *  - Authentic planetary crustal dichotomy (Arabia/Tharsis/Aeolis/Chryse undulations)
 *  - Calibrated volcanic shields, chasmata/outflow channels, polar domes, & named craters
 *  - Multi-pass MOLA anchor calibration across all 97 Martian landmark sites
 *  - Site-geology-aware 3D angular rock, boulder, scree, strata & regolith micro-relief
 *    down to sub-meter detail (levels 13..19) paired with matching directional rock shading.
 */


const DEG_TO_RAD = Math.PI / 180;
const MARS_MEAN_RADIUS_M = 3_396_190;

export type MarsSiteGeology =
  | 'volcanic-basalt'
  | 'canyon-scree'
  | 'crater-breccia'
  | 'delta-sedimentary'
  | 'polar-ice'
  | 'aeolian-plain';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function wrapLonDiff(lonA: number, lonB: number): number {
  let d = lonA - lonB;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function hash3(ix: number, iy: number, iz: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function hashInt3(ix: number, iy: number, iz: number, seed: number): number {
  let h =
    Math.imul(ix, 374761393) ^
    Math.imul(iy, 668265263) ^
    Math.imul(iz, 1442695041) ^
    Math.imul(seed, 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function quintic(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Smooth 3D lattice value noise in [-1, 1] with C2 quintic interpolation.
 */
function valueNoise3D(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);

  const fx = quintic(x - ix);
  const fy = quintic(y - iy);
  const fz = quintic(z - iz);

  const c000 = hash3(ix, iy, iz);
  const c100 = hash3(ix + 1, iy, iz);
  const c010 = hash3(ix, iy + 1, iz);
  const c110 = hash3(ix + 1, iy + 1, iz);
  const c001 = hash3(ix, iy, iz + 1);
  const c101 = hash3(ix + 1, iy, iz + 1);
  const c011 = hash3(ix, iy + 1, iz + 1);
  const c111 = hash3(ix + 1, iy + 1, iz + 1);

  const x00 = lerp(c000, c100, fx);
  const x10 = lerp(c010, c110, fx);
  const x01 = lerp(c001, c101, fx);
  const x11 = lerp(c011, c111, fx);

  const y0 = lerp(x00, x10, fy);
  const y1 = lerp(x01, x11, fy);

  return lerp(y0, y1, fz) * 2 - 1;
}

function fbm3D(x: number, y: number, z: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fy = y;
  let fz = z;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3D(fx, fy, fz);
    norm += amp;
    fx *= 2.07;
    fy *= 2.07;
    fz *= 2.07;
    amp *= 0.5;
  }
  return sum / norm;
}

function ridged3D(x: number, y: number, z: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fy = y;
  let fz = z;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise3D(fx, fy, fz));
    sum += amp * (n * n * 2 - 1);
    norm += amp;
    fx *= 2.13;
    fy *= 2.13;
    fz *= 2.13;
    amp *= 0.5;
  }
  return sum / norm;
}

function segmentOffsetDeg(
  lonDeg: number,
  latDeg: number,
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number
): { distDeg: number; t: number } {
  const dLon12 = wrapLonDiff(lon2, lon1);
  const dLat12 = lat2 - lat1;
  const dLon1P = wrapLonDiff(lonDeg, lon1);
  const dLat1P = latDeg - lat1;
  const cosLat = Math.max(0.25, Math.cos(((lat1 + lat2) * 0.5) * DEG_TO_RAD));
  const vx = dLon12 * cosLat;
  const vy = dLat12;
  const px = dLon1P * cosLat;
  const py = dLat1P;
  const len2 = vx * vx + vy * vy || 1e-6;
  const t = clamp((px * vx + py * vy) / len2, 0, 1);
  const dx = px - t * vx;
  const dy = py - t * vy;
  return { distDeg: Math.hypot(dx, dy), t };
}

interface EllipticalFeature {
  lon: number;
  lat: number;
  rx: number;
  ry: number;
  amp: number;
  rimAmp?: number;
  rimRadiusRatio?: number;
  centralPeakAmp?: number;
  centralPeakSigma?: number;
  flatPower?: number;
  maxRadiusNorm?: number;
}

const REGIONAL_PROVINCES: EllipticalFeature[] = [
  // Elevated Volcanic Bulges & Highland Plateaus
  { lon: -108.0, lat: 2.0, rx: 32.0, ry: 27.0, amp: 5400, flatPower: 2.2, maxRadiusNorm: 9.0 }, // Tharsis Bulge
  { lon: -96.5, lat: -6.8, rx: 9.0, ry: 7.5, amp: 4100, flatPower: 2.2, maxRadiusNorm: 7.0 }, // Noctis Labyrinths high plateau (+6,200 m)
  { lon: -88.0, lat: -16.5, rx: 14.0, ry: 10.0, amp: 1650, flatPower: 2.2, maxRadiusNorm: 7.0 }, // Syria / Solis / Sinai Planum
  { lon: -65.0, lat: -21.7, rx: 14.0, ry: 9.5, amp: 2750, flatPower: 2.2, maxRadiusNorm: 7.5 }, // Thaumasia Planum (+3,500 m)
  { lon: -65.9, lat: 10.4, rx: 11.5, ry: 9.0, amp: 3950, flatPower: 2.2, maxRadiusNorm: 7.0 }, // Lunae Planum (+1,600 m)
  { lon: -71.0, lat: 39.7, rx: 11.0, ry: 7.5, amp: 3100, flatPower: 2.2, maxRadiusNorm: 7.0 }, // Tempe Terra block
  { lon: 148.0, lat: 24.5, rx: 16.0, ry: 12.0, amp: 2250, flatPower: 2.0, maxRadiusNorm: 7.5 }, // Elysium Rise pedestal
  { lon: 42.0, lat: 2.0, rx: 18.0, ry: 12.0, amp: 650, flatPower: 2.0, maxRadiusNorm: 7.0 }, // Terra Sabaea crest (+900 m)
  { lon: -155.0, lat: -39.5, rx: 22.0, ry: 12.0, amp: 2950, flatPower: 2.0, maxRadiusNorm: 7.0 }, // Terra Sirenum crest (+2,200 m)
  { lon: 142.0, lat: -30.0, rx: 22.0, ry: 13.0, amp: 650, flatPower: 2.0, maxRadiusNorm: 7.0 }, // Terra Cimmeria
  { lon: 35.0, lat: -45.0, rx: 20.0, ry: 13.0, amp: 1050, flatPower: 2.0, maxRadiusNorm: 7.0 }, // Noachis Terra (+1,400 m)
  { lon: -170.9, lat: -37.2, rx: 7.5, ry: 6.0, amp: -450, flatPower: 2.0, maxRadiusNorm: 6.5 }, // Gorgonum Chaos (+800 m)
  { lon: 131.0, lat: -67.0, rx: 15.0, ry: 8.0, amp: 500, flatPower: 2.0, maxRadiusNorm: 6.5 }, // Prometheus Mons (+600 m)

  // Syrtis Major Planum Broad Shield & Volcanic Plateaus (+1,450..+2,300 m)
  { lon: 69.5, lat: 8.4, rx: 11.5, ry: 10.5, amp: 2450, flatPower: 2.1, maxRadiusNorm: 6.5 }, // Syrtis Major shield plateau

  // Low-Lying Plains & Ancient Depressed Terrains
  { lon: 15.0, lat: 21.0, rx: 22.0, ry: 13.0, amp: 1250, flatPower: 2.2, maxRadiusNorm: 7.0 }, // Arabia Terra shelf (~ -800 m)
  { lon: -5.53, lat: -1.95, rx: 13.0, ry: 11.0, amp: -1250, flatPower: 2.2, maxRadiusNorm: 6.5 }, // Meridiani / Margaritifer basin (-1,350..-1,450 m)
  { lon: -24.63, lat: 18.2, rx: 8.0, ry: 6.5, amp: 150, flatPower: 2.0, maxRadiusNorm: 6.5 }, // Oxia Planum (-3,000 m)
  { lon: -19.0, lat: 24.0, rx: 7.0, ry: 5.5, amp: 1450, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Mawrth Vallis shelf (-2,200 m)
  { lon: 74.5, lat: 21.0, rx: 5.5, ry: 4.5, amp: -1250, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Nili Fossae thermal trough (-1,600 m)
  { lon: 135.62, lat: 4.5, rx: 8.5, ry: 6.5, amp: -900, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Elysium / InSight plain (-2,655 m)
  { lon: 148.0, lat: 5.5, rx: 8.5, ry: 6.0, amp: 1050, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Cerberus Palus (-2,900 m)
  { lon: 166.37, lat: 11.28, rx: 6.5, ry: 4.5, amp: 850, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Cerberus Fossae (-2,700 m)
  { lon: -162.0, lat: -5.0, rx: 14.0, ry: 7.5, amp: 550, flatPower: 2.2, maxRadiusNorm: 6.5 }, // Medusae Fossae (-1,800 m)
  { lon: -33.27, lat: -23.86, rx: 9.0, ry: 6.5, amp: -1150, flatPower: 2.0, maxRadiusNorm: 6.5 }, // Holden / Eberswalde basin (-1,400..-2,200 m)
  { lon: -42.0, lat: -28.4, rx: 8.0, ry: 5.5, amp: -650, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Nirgal Vallis (-600 m)
  { lon: -19.4, lat: -23.9, rx: 8.5, ry: 6.5, amp: -1500, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Margaritifer / Mars-6 (-1,200 m)
  { lon: 47.0, lat: -45.0, rx: 9.0, ry: 6.5, amp: -1750, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Western Hellas flank / Mars-2 (-1,400 m)
  { lon: -158.0, lat: -45.0, rx: 9.5, ry: 6.5, amp: -2450, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Southern Sirenum depression / Mars-3 (-1,800 m)
  { lon: 104.5, lat: -42.1, rx: 7.0, ry: 5.5, amp: -1400, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Reull Vallis trough (-1,200 m)
  { lon: -13.0, lat: 33.69, rx: 6.5, ry: 4.5, amp: 1450, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Cydonia Mensae (-2,100 m)
  { lon: 23.8, lat: 41.5, rx: 9.5, ry: 6.5, amp: 450, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Deuteronilus Mensae (-3,350 m)
  { lon: 49.4, lat: 43.8, rx: 7.5, ry: 5.5, amp: 700, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Protonilus Mensae (-3,100 m)
  { lon: 163.5, lat: 34.2, rx: 8.5, ry: 6.0, amp: 950, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Phlegra Montes (-2,750 m)
  { lon: 170.0, lat: 81.2, rx: 14.0, ry: 4.5, amp: -1150, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Olympia Undae polar dune sea (-4,300 m)

  // Major Impact Basins & Northern Lowland Plains
  { lon: 70.5, lat: -42.4, rx: 20.5, ry: 14.2, amp: -7400, rimAmp: 350, rimRadiusRatio: 1.35, flatPower: 2.6, maxRadiusNorm: 7.5 }, // Hellas Planitia (-7,152 m MOLA datum)
  { lon: 58.0, lat: -40.0, rx: 8.5, ry: 6.0, amp: -1200, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Western Hellas deepest pocket (~ -8,200 m)
  { lon: -43.4, lat: -49.7, rx: 13.2, ry: 9.6, amp: -5650, rimAmp: 850, rimRadiusRatio: 1.32, flatPower: 2.4, maxRadiusNorm: 7.5 }, // Argyre Planitia (-5,200 m)
  { lon: 87.5, lat: 12.9, rx: 11.8, ry: 11.2, amp: -2950, rimAmp: 450, rimRadiusRatio: 1.28, flatPower: 2.6, maxRadiusNorm: 7.0 }, // Isidis Planitia (-3,700 m)
  { lon: 117.5, lat: 46.7, rx: 24.0, ry: 17.0, amp: -950, flatPower: 2.6, maxRadiusNorm: 7.0 }, // Utopia Planitia (-4,600 m)
  { lon: -20.7, lat: 49.8, rx: 20.0, ry: 13.5, amp: -1050, flatPower: 2.4, maxRadiusNorm: 7.0 }, // Acidalia Planitia (-4,800 m)
  { lon: -168.0, lat: 46.7, rx: 20.0, ry: 13.0, amp: -120, flatPower: 2.2, maxRadiusNorm: 7.0 }, // Arcadia Planitia (-3,800 m)
  { lon: -164.0, lat: 24.8, rx: 18.0, ry: 13.0, amp: -350, flatPower: 2.4, maxRadiusNorm: 7.0 }, // Amazonis Planitia (-3,900 m)
  { lon: -39.6, lat: 28.4, rx: 14.0, ry: 10.5, amp: -350, flatPower: 2.2, maxRadiusNorm: 7.0 }, // Chryse Planitia (-3,750 m)
  { lon: 154.7, lat: 3.0, rx: 14.0, ry: 10.0, amp: -750, flatPower: 2.2, maxRadiusNorm: 7.0 }, // Elysium Planitia (-2,900 m)
  { lon: -135.0, lat: 67.0, rx: 36.0, ry: 11.5, amp: -650, flatPower: 2.2, maxRadiusNorm: 6.5 }, // Vastitas Borealis (-4,400 m)
];

interface VolcanoFeature {
  lon: number;
  lat: number;
  peakAmp: number;
  sigmaDeg: number;
  scarpRadiusDeg?: number;
  scarpAmp?: number;
  calderaRadiusDeg?: number;
  calderaDepth?: number;
  cutoffDeg2: number;
}

const VOLCANO_FEATURES: VolcanoFeature[] = [
  // Olympus Mons (+21,229 m peak; 18.65N, -133.8E)
  {
    lon: -133.8,
    lat: 18.65,
    peakAmp: 20650,
    sigmaDeg: 3.45,
    scarpRadiusDeg: 4.35,
    scarpAmp: 2950,
    calderaRadiusDeg: 0.42,
    calderaDepth: 520,
    cutoffDeg2: 64.0,
  },
  // Ascraeus Mons (+18,225 m; 11.8N, -104.1E)
  {
    lon: -104.1,
    lat: 11.8,
    peakAmp: 17750,
    sigmaDeg: 2.2,
    calderaRadiusDeg: 0.35,
    calderaDepth: 520,
    cutoffDeg2: 30.0,
  },
  // Pavonis Mons (+14,058 m; 1.5N, -112.9E)
  {
    lon: -112.9,
    lat: 1.5,
    peakAmp: 12800,
    sigmaDeg: 2.15,
    calderaRadiusDeg: 0.36,
    calderaDepth: 480,
    cutoffDeg2: 28.0,
  },
  // Arsia Mons (+17,761 m; -8.3N, -120.1E), tighter edifice so southern skylight flank sits near +11,500 m
  {
    lon: -120.1,
    lat: -8.3,
    peakAmp: 17200,
    sigmaDeg: 1.8,
    calderaRadiusDeg: 0.64,
    calderaDepth: 650,
    cutoffDeg2: 30.0,
  },
  // Alba Mons (+6,800 m; 40.5N, -109.9E)
  {
    lon: -109.9,
    lat: 40.5,
    peakAmp: 10350,
    sigmaDeg: 5.4,
    calderaRadiusDeg: 0.65,
    calderaDepth: 420,
    cutoffDeg2: 140.0,
  },
  // Tharsis Tholus (+8,000 m; 13.4N, -90.7E)
  { lon: -90.7, lat: 13.4, peakAmp: 8650, sigmaDeg: 1.35, calderaRadiusDeg: 0.24, calderaDepth: 480, cutoffDeg2: 12.0 },
  // Biblis Tholus (+7,100 m rim with 3 km summit caldera; 2.5N, -124.4E)
  { lon: -124.4, lat: 2.5, peakAmp: 7450, sigmaDeg: 1.15, calderaRadiusDeg: 0.26, calderaDepth: 1100, cutoffDeg2: 10.0 },
  // Ulysses Tholus (2.9N, -121.5E)
  { lon: -121.5, lat: 2.9, peakAmp: 3100, sigmaDeg: 0.85, calderaRadiusDeg: 0.22, calderaDepth: 400, cutoffDeg2: 8.0 },
  // Ceraunius Tholus (24.2N, -97.2E)
  { lon: -97.2, lat: 24.2, peakAmp: 4950, sigmaDeg: 1.05, calderaRadiusDeg: 0.22, calderaDepth: 450, cutoffDeg2: 10.0 },
  // Uranius Mons (26.9N, -92.1E)
  { lon: -92.1, lat: 26.9, peakAmp: 3800, sigmaDeg: 1.35, cutoffDeg2: 12.0 },
  // Elysium Mons (+14,127 m; 25.0N, 147.2E)
  {
    lon: 147.2,
    lat: 25.0,
    peakAmp: 14650,
    sigmaDeg: 2.25,
    calderaRadiusDeg: 0.22,
    calderaDepth: 450,
    cutoffDeg2: 36.0,
  },
  // Hecates Tholus (+5,300 m; 32.1N, 150.2E)
  { lon: 150.2, lat: 32.1, peakAmp: 7750, sigmaDeg: 1.45, calderaRadiusDeg: 0.16, calderaDepth: 350, cutoffDeg2: 16.0 },
  // Albor Tholus (18.9N, 150.5E)
  { lon: 150.5, lat: 18.9, peakAmp: 4700, sigmaDeg: 1.35, calderaRadiusDeg: 0.22, calderaDepth: 450, cutoffDeg2: 14.0 },
  // Apollinaris Mons (-9.3S, 174.4E)
  { lon: 174.4, lat: -9.3, peakAmp: 4650, sigmaDeg: 1.55, calderaRadiusDeg: 0.35, calderaDepth: 550, cutoffDeg2: 16.0 },
  // Tyrrhenus Mons (-21.3S, 106.5E)
  { lon: 106.5, lat: -21.3, peakAmp: 2050, sigmaDeg: 2.4, calderaRadiusDeg: 0.3, calderaDepth: 380, cutoffDeg2: 24.0 },
  // Hadriacus Mons (-30.2S, 92.8E, -1,100 m flank shield into Hellas)
  { lon: 92.8, lat: -30.2, peakAmp: -650, sigmaDeg: 1.8, calderaRadiusDeg: 0.35, calderaDepth: 250, cutoffDeg2: 18.0 },
];

interface CanyonSegment {
  lon1: number;
  lat1: number;
  lon2: number;
  lat2: number;
  halfWidthDeg: number;
  depthM: number;
  shoulderAmp?: number;
}

const CANYON_SEGMENTS: CanyonSegment[] = [
  // Valles Marineris system: Ius -> Melas -> Coprates -> Eos
  { lon1: -88.0, lat1: -7.5, lon2: -77.5, lat2: -8.6, halfWidthDeg: 1.45, depthM: -6800, shoulderAmp: 650 }, // Ius Chasma
  { lon1: -84.0, lat1: -4.8, lon2: -74.0, lat2: -5.4, halfWidthDeg: 1.1, depthM: -5200, shoulderAmp: 450 }, // Tithonium Chasma
  { lon1: -77.5, lat1: -8.6, lon2: -69.0, lat2: -11.4, halfWidthDeg: 2.2, depthM: -6500, shoulderAmp: 600 }, // Melas Chasma (-5,500 m)
  { lon1: -73.0, lat1: -6.6, lon2: -66.0, lat2: -7.0, halfWidthDeg: 1.6, depthM: -5350, shoulderAmp: 500 }, // Candor Chasma (-4,900 m)
  { lon1: -73.2, lat1: -4.0, lon2: -69.5, lat2: -4.3, halfWidthDeg: 1.25, depthM: -4800, shoulderAmp: 400 }, // Ophir Chasma (-4,800 m)
  { lon1: -77.0, lat1: -1.1, lon2: -75.2, lat2: -1.2, halfWidthDeg: 1.0, depthM: -4600, shoulderAmp: 350 }, // Hebes Chasma (-5,200 m)
  { lon1: -69.0, lat1: -11.4, lon2: -56.0, lat2: -14.2, halfWidthDeg: 1.45, depthM: -8100, shoulderAmp: 750 }, // Coprates Chasma (-6,800 to -7,000 m)
  { lon1: -56.0, lat1: -14.2, lon2: -42.0, lat2: -12.0, halfWidthDeg: 1.75, depthM: -5800, shoulderAmp: 450 }, // Eos & Capri Chasma
  { lon1: -51.5, lat1: -8.0, lon2: -45.5, lat2: -8.2, halfWidthDeg: 1.35, depthM: -4100, shoulderAmp: 380 }, // Ganges Chasma (-4,700 m)
  { lon1: -42.0, lat1: -12.0, lon2: -35.4, lat2: 0.8, halfWidthDeg: 2.1, depthM: -2250 }, // Hydraotes Chaos outflow (-3,800 m)
  { lon1: -42.1, lat1: 7.8, lon2: -35.7, lat2: 19.1, halfWidthDeg: 1.8, depthM: -550 }, // Shalbatana / Simud / Tiu Valles
  { lon1: -21.5, lat1: 2.6, lon2: -33.5, lat2: 19.5, halfWidthDeg: 1.6, depthM: -950 }, // Ares Vallis (-3,200 m)
  // Kasei Valles & Echus Chasma northern outflow system
  { lon1: -79.5, lat1: 2.5, lon2: -74.0, lat2: 12.0, halfWidthDeg: 1.5, depthM: -1900, shoulderAmp: 300 }, // Echus Chasma (-2,400 m)
  { lon1: -74.0, lat1: 12.0, lon2: -62.5, lat2: 21.9, halfWidthDeg: 1.65, depthM: -350 }, // Kasei Valles (-3,100 m)
  { lon1: -62.5, lat1: 21.9, lon2: -54.0, lat2: 24.5, halfWidthDeg: 2.1, depthM: -250 }, // Lower Kasei into Chryse
  { lon1: -58.3, lat1: 12.6, lon2: -49.1, lat2: 4.9, halfWidthDeg: 1.3, depthM: -350 }, // Maja / Nanedi Valles
  // Cerberus Fossae active volcanic rift fissures (11.28N, 166.37E)
  { lon1: 164.0, lat1: 12.1, lon2: 168.8, lat2: 10.4, halfWidthDeg: 0.35, depthM: -650, shoulderAmp: 120 },
  // Hellas eastern outflow canyons: Dao & Harmakhis Valles
  { lon1: 92.5, lat1: -33.5, lon2: 83.5, lat2: -39.2, halfWidthDeg: 1.25, depthM: -4750 }, // Dao Vallis (-4,600 m)
  { lon1: 94.0, lat1: -41.5, lon2: 84.5, lat2: -40.6, halfWidthDeg: 1.15, depthM: -2350 }, // Harmakhis Vallis (-4,800 m)
  // Chasma Boreale polar spiral canyon (-3,800 m floor)
  { lon1: -35.0, lat1: 84.0, lon2: -62.0, lat2: 81.2, halfWidthDeg: 1.35, depthM: -1150 },
];

const CRATER_FEATURES: EllipticalFeature[] = [
  // Deepest Northern Hemisphere Crater: Lyot (50.5N, 29.3E, -7,030 m)
  { lon: 29.3, lat: 50.5, rx: 2.1, ry: 1.7, amp: -4450, rimAmp: 1100, rimRadiusRatio: 1.18, centralPeakAmp: 950, centralPeakSigma: 0.24, flatPower: 3.0, maxRadiusNorm: 6.5 },
  // Lomonosov Crater (65.2N, -9.3E, -5,050 m)
  { lon: -9.3, lat: 65.2, rx: 1.8, ry: 1.2, amp: -1550, rimAmp: 750, rimRadiusRatio: 1.18, centralPeakAmp: 400, centralPeakSigma: 0.24, flatPower: 2.8, maxRadiusNorm: 6.0 },
  // Mie Crater (48.4N, 139.6E, -4,950 m)
  { lon: 139.6, lat: 48.4, rx: 1.5, ry: 1.1, amp: -950, rimAmp: 700, rimRadiusRatio: 1.18, flatPower: 2.8, maxRadiusNorm: 6.0 },
  // Korolev Crater (72.77N, 164.58E, -4,600 m with 1.8 km permanent water-ice dome)
  { lon: 164.58, lat: 72.77, rx: 1.7, ry: 0.9, amp: -2650, rimAmp: 850, rimRadiusRatio: 1.18, centralPeakAmp: 1550, centralPeakSigma: 0.55, flatPower: 3.0, maxRadiusNorm: 6.0 },
  // Milankovic Crater (54.7N, -146.7E, -4,400 m)
  { lon: -146.7, lat: 54.7, rx: 1.4, ry: 1.0, amp: -650, rimAmp: 650, rimRadiusRatio: 1.18, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Moreux Crater (42.1N, 44.4E, -3,800 m)
  { lon: 44.4, lat: 42.1, rx: 1.3, ry: 1.05, amp: -1550, rimAmp: 750, rimRadiusRatio: 1.18, centralPeakAmp: 650, centralPeakSigma: 0.24, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Gale Crater (-5.4S, 137.8E, -4,500 m) + Mount Sharp / Aeolis Mons (+5.5 km tall central massif at -5.08S, 137.85E)
  { lon: 137.65, lat: -5.1, rx: 1.45, ry: 1.45, amp: -2750, rimAmp: 1050, rimRadiusRatio: 1.24, flatPower: 2.8, maxRadiusNorm: 6.5 },
  { lon: 137.85, lat: -5.08, rx: 0.22, ry: 0.22, amp: 5350, flatPower: 1.8, maxRadiusNorm: 5.5 }, // Aeolis Mons (+900 m summit)
  // Jezero Crater (18.44N, 77.45E, -2,570 m floor; western delta fan margin -2,480 m)
  { lon: 77.48, lat: 18.42, rx: 0.48, ry: 0.46, amp: -1450, rimAmp: 620, rimRadiusRatio: 1.24, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Gusev Crater (-14.57S, 175.47E, -1,950 m)
  { lon: 175.47, lat: -14.57, rx: 1.45, ry: 1.4, amp: -1150, rimAmp: 700, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Terby Crater (-28.0S, 74.1E, -4,100 m)
  { lon: 74.1, lat: -28.0, rx: 1.6, ry: 1.4, amp: -2250, rimAmp: 800, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Becquerel Crater (21.9N, -8.0E, -3,800 m)
  { lon: -8.0, lat: 21.9, rx: 1.5, ry: 1.4, amp: -1450, rimAmp: 750, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // McLaughlin Crater (21.9N, -22.5E, -4,400 m)
  { lon: -22.5, lat: 21.9, rx: 0.9, ry: 0.85, amp: -1250, rimAmp: 650, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Cassini Crater (23.8N, 32.1E, -2,900 m)
  { lon: 32.1, lat: 23.8, rx: 3.4, ry: 3.2, amp: -2150, rimAmp: 850, rimRadiusRatio: 1.2, flatPower: 2.8, maxRadiusNorm: 6.5 },
  // Antoniadi Crater (21.5N, 60.8E, -2,100 m)
  { lon: 60.8, lat: 21.5, rx: 3.4, ry: 3.2, amp: -950, rimAmp: 800, rimRadiusRatio: 1.2, flatPower: 2.8, maxRadiusNorm: 6.5 },
  // Huygens Crater (-13.9S, 55.6E, -1,100 m)
  { lon: 55.6, lat: -13.9, rx: 3.8, ry: 3.7, amp: -1950, rimAmp: 1200, rimRadiusRatio: 1.18, centralPeakAmp: 750, centralPeakSigma: 0.22, flatPower: 2.8, maxRadiusNorm: 6.5 },
  // Schiaparelli Crater (-2.7S, 16.7E, -1,000 m)
  { lon: 16.7, lat: -2.7, rx: 3.8, ry: 3.8, amp: -1150, rimAmp: 850, rimRadiusRatio: 1.18, flatPower: 2.8, maxRadiusNorm: 6.5 },
  // Herschel Crater (-14.5S, 129.8E, -900 m)
  { lon: 129.8, lat: -14.5, rx: 2.6, ry: 2.5, amp: -950, rimAmp: 800, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Holden Crater (-26.4S, -34.0E, -2,200 m)
  { lon: -34.0, lat: -26.4, rx: 1.3, ry: 1.2, amp: -950, rimAmp: 650, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Eberswalde Crater (-23.86S, -33.27E, -1,400 m delta bench)
  { lon: -33.27, lat: -23.86, rx: 0.55, ry: 0.5, amp: -450, rimAmp: 350, rimRadiusRatio: 1.2, flatPower: 2.5, maxRadiusNorm: 5.5 },
  // Columbus Crater (-29.8S, -166.1E, -250 m paleolake basin)
  { lon: -166.1, lat: -29.8, rx: 1.05, ry: 0.95, amp: -1650, rimAmp: 520, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Airy-0 & Meridiani Craters (-5.07S, 0.0E / Endeavour -2.28, -5.23 / Victoria -2.05, -5.5 / Miyamoto -2.9, -7.0)
  { lon: 0.0, lat: -5.07, rx: 0.35, ry: 0.35, amp: -620, rimAmp: 200, rimRadiusRatio: 1.2, flatPower: 2.4, maxRadiusNorm: 5.0 },
  { lon: -5.23, lat: -2.28, rx: 0.25, ry: 0.25, amp: -320, rimAmp: 360, rimRadiusRatio: 1.15, flatPower: 2.4, maxRadiusNorm: 5.0 },
  { lon: -7.0, lat: -2.9, rx: 1.25, ry: 1.2, amp: -550, rimAmp: 420, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 5.5 },
  // Pettit (12.4N, -173.9E), Secchi (-58.3S, 101.8E), Zunil (7.7N, 166.2E)
  { lon: -173.9, lat: 12.4, rx: 0.85, ry: 0.82, amp: -650, rimAmp: 520, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 5.5 },
  { lon: 101.8, lat: -58.3, rx: 2.0, ry: 1.6, amp: -650, rimAmp: 620, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 5.5 },
  { lon: 166.2, lat: 7.7, rx: 0.14, ry: 0.14, amp: -550, rimAmp: 240, rimRadiusRatio: 1.22, flatPower: 2.6, maxRadiusNorm: 5.0 },
  // Lowell Crater (-52.3S, -81.4E)
  { lon: -81.4, lat: -52.3, rx: 2.2, ry: 1.5, amp: -2100, rimAmp: 850, rimRadiusRatio: 1.2, centralPeakAmp: 700, centralPeakSigma: 0.24, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Russell Crater (-54.9S, 12.9E, +500 m)
  { lon: 12.9, lat: -54.9, rx: 1.4, ry: 1.0, amp: -150, rimAmp: 650, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Vernal Crater (5.9N, -4.5E, -1,650 m)
  { lon: -4.5, lat: 5.9, rx: 0.65, ry: 0.65, amp: -250, rimAmp: 400, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 6.0 },
];

function evalEllipticalFeatures(
  lonDeg: number,
  latDeg: number,
  features: EllipticalFeature[]
): number {
  let total = 0;
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const dy = (latDeg - f.lat) / f.ry;
    const maxR2 = f.maxRadiusNorm ?? 6.5;
    if (dy * dy >= maxR2) continue;
    const dx = wrapLonDiff(lonDeg, f.lon) / f.rx;
    const r2 = dx * dx + dy * dy;
    if (r2 >= maxR2) continue;

    const p = f.flatPower ?? 2.0;
    const r = Math.sqrt(r2);
    const bodyWeight = p === 2.0 ? Math.exp(-r2) : Math.exp(-Math.pow(r, p));
    total += f.amp * bodyWeight;

    if (f.rimAmp) {
      const rimRatio = f.rimRadiusRatio ?? 1.22;
      const dRim = r - rimRatio;
      total += f.rimAmp * Math.exp(-(dRim * dRim) / 0.09);
    }
    if (f.centralPeakAmp) {
      const peakSigma = f.centralPeakSigma ?? 0.24;
      total += f.centralPeakAmp * Math.exp(-r2 / (peakSigma * peakSigma));
    }
  }
  return total;
}

interface LandmarkMolaAnchor {
  lat: number;
  lon: number;
  targetElevM: number;
  sigmaDeg: number;
  invSigma2: number;
  cutoffDeg: number;
  geology: MarsSiteGeology;
  deltaM: number;
}

const RAW_LANDMARK_SPECS: Array<[number, number, number, number, MarsSiteGeology]> = [
  // Primary & Notable Landmarks
  [18.65, -133.8, 21229, 0.95, 'volcanic-basalt'], // olympus-mons
  [-13.9, -59.2, -7000, 0.75, 'canyon-scree'], // valles-marineris
  [-42.4, 70.5, -7152, 2.2, 'aeolian-plain'], // hellas-planitia (NASA MOLA datum floor)
  [46.7, -168.0, -3800, 2.5, 'polar-ice'], // arcadia-planitia
  [-5.4, 137.8, -4500, 0.25, 'delta-sedimentary'], // gale-crater landing floor (leaves Mount Sharp intact)
  [33.69, -13.0, -2100, 1.2, 'canyon-scree'], // cydonia-region
  [85.0, 0.0, -2000, 2.0, 'polar-ice'], // north-polar-cap
  [1.5, -112.5, 14058, 0.22, 'volcanic-basalt'], // tharsis-montes (Pavonis ridge)
  [39.5, -172.0, -3500, 1.6, 'polar-ice'], // swim-arcadia-ice
  [-9.1, -119.1, 11500, 0.42, 'volcanic-basalt'], // arsia-lava-cave (skylight floor/flank)
  [18.49, 77.38, -2480, 0.14, 'delta-sedimentary'], // jezero-western-fan
  [23.99, -18.96, -2200, 1.0, 'delta-sedimentary'], // mawrth-vallis
  [18.2, -24.63, -3000, 1.1, 'delta-sedimentary'], // oxia-planum
  [11.28, 166.37, -2700, 0.55, 'volcanic-basalt'], // cerberus-fossae
  [49.8, -20.7, -4800, 2.2, 'aeolian-plain'], // acidalia-planitia
  [8.4, 69.5, 1450, 1.8, 'volcanic-basalt'], // syrtis-major (NASA MOLA volcanic shield plateau)
  [-23.86, -33.27, -1400, 0.45, 'delta-sedimentary'], // eberswalde-delta
  [45.1, 24.5, -3300, 1.0, 'polar-ice'], // odyssey-ice-deuteronilus
  [21.0, 74.5, -1600, 0.9, 'volcanic-basalt'], // odyssey-thermal-nili
  [-39.7, -155.0, 2200, 2.0, 'crater-breccia'], // mgs-magnetic-sirenum
  [-49.7, -43.4, -5200, 2.0, 'crater-breccia'], // argyre-planitia
  [72.77, 164.58, -4600, 0.55, 'polar-ice'], // korolev-crater
  [-84.5, 160.0, 1500, 2.0, 'polar-ice'], // south-polar-cap
  [-6.8, -96.5, 6200, 1.2, 'canyon-scree'], // noctis-labyrinths
  [1.48, -112.96, 14100, 0.05, 'volcanic-basalt'], // pavonis-skylight

  // Craters & Basins
  [-5.07, 0.0, -1450, 0.45, 'crater-breccia'], // airy-zero
  [21.5, 60.8, -2100, 1.2, 'crater-breccia'], // antoniadi-crater
  [21.9, -8.0, -3800, 0.95, 'delta-sedimentary'], // becquerel-crater
  [23.8, 32.1, -2900, 1.2, 'crater-breccia'], // cassini-crater
  [-29.8, -166.1, -250, 0.75, 'delta-sedimentary'], // columbus-crater
  [-2.28, -5.23, -1350, 0.16, 'crater-breccia'], // endeavour-crater
  [-14.58, 175.42, -1950, 0.95, 'crater-breccia'], // gusev-crater
  [-14.5, 129.8, -900, 1.1, 'crater-breccia'], // herschel-crater
  [-26.4, -34.0, -2200, 0.85, 'crater-breccia'], // holden-crater
  [-13.9, 55.6, -1100, 1.2, 'crater-breccia'], // huygens-crater
  [50.5, 29.3, -7030, 1.1, 'crater-breccia'], // lyot-crater
  [21.9, -22.5, -4400, 0.75, 'delta-sedimentary'], // mclaughlin-crater
  [48.4, 139.6, -4950, 0.85, 'crater-breccia'], // mie-crater
  [-2.9, -7.0, -1850, 0.7, 'delta-sedimentary'], // miyamoto-crater
  [42.1, 44.4, -3800, 0.85, 'polar-ice'], // moreux-crater
  [12.4, -173.9, -3200, 0.75, 'crater-breccia'], // pettit-crater
  [-54.9, 12.9, 500, 0.9, 'aeolian-plain'], // russell-crater
  [-2.7, 16.7, -1000, 1.2, 'crater-breccia'], // schiaparelli-crater
  [-58.3, 101.8, 400, 1.0, 'crater-breccia'], // secchi-crater
  [-28.0, 74.1, -4100, 0.95, 'delta-sedimentary'], // terby-crater
  [-2.05, -5.5, -1410, 0.12, 'crater-breccia'], // victoria-crater
  [5.9, -4.5, -1650, 0.65, 'crater-breccia'], // vernal-crater
  [7.7, 166.2, -2750, 0.35, 'crater-breccia'], // zunil-crater
  [54.7, -146.7, -4400, 0.9, 'polar-ice'], // milankovic-crater
  [65.2, -9.3, -5050, 0.9, 'crater-breccia'], // lomonosov-crater

  // Outflow Channels, Valleys & Chasmata
  [21.9, -62.5, -3100, 1.1, 'canyon-scree'], // kasei-valles
  [12.6, -58.3, -2500, 0.9, 'delta-sedimentary'], // maja-valles
  [4.9, -49.1, -1950, 0.8, 'canyon-scree'], // nanedi-vallis
  [-28.4, -42.0, -600, 0.85, 'canyon-scree'], // nirgal-vallis
  [7.8, -42.1, -3100, 0.95, 'delta-sedimentary'], // shalbatana-vallis
  [19.1, -37.8, -3650, 1.0, 'delta-sedimentary'], // simud-vallis
  [15.6, -35.7, -3720, 1.0, 'delta-sedimentary'], // tiu-valles
  [2.6, -21.5, -3200, 0.95, 'delta-sedimentary'], // ares-vallis-head
  [-10.5, -73.6, -5500, 0.9, 'canyon-scree'], // melas-chasma-floor
  [-4.0, -72.5, -4800, 0.8, 'canyon-scree'], // ophir-chasma
  [-8.0, -48.1, -4700, 0.9, 'canyon-scree'], // ganges-chasma
  [-1.1, -76.2, -5200, 0.7, 'canyon-scree'], // hebes-chasma
  [-37.6, 88.8, -4600, 0.85, 'canyon-scree'], // dao-vallis
  [-40.9, 90.0, -4800, 0.85, 'canyon-scree'], // harmakhis-vallis
  [-42.1, 104.5, -1200, 0.95, 'canyon-scree'], // reull-vallis

  // Volcanoes, Plains, Polar & Chaos Features
  [40.5, -109.9, 6800, 1.6, 'volcanic-basalt'], // alba-mons
  [2.5, -124.4, 7100, 0.45, 'volcanic-basalt'], // biblis-tholus (rim plateau)
  [-30.2, 92.8, -1100, 1.2, 'volcanic-basalt'], // hadriacus-mons
  [32.1, 150.2, 5300, 0.8, 'volcanic-basalt'], // hecates-tholus
  [-21.7, -65.0, 3500, 2.0, 'volcanic-basalt'], // thaumasia-planum
  [28.4, -39.6, -3750, 2.0, 'aeolian-plain'], // chryse-planitia
  [46.7, 117.5, -4600, 2.5, 'polar-ice'], // utopia-planitia
  [67.0, -135.0, -4400, 2.5, 'polar-ice'], // vastitas-borealis
  [10.4, -65.9, 1600, 1.8, 'volcanic-basalt'], // lunae-planum
  [0.2, -2.5, -1350, 1.6, 'aeolian-plain'], // sinus-meridiani
  [2.0, 42.0, 900, 2.2, 'crater-breccia'], // terra-sabaea
  [-45.0, 35.0, 1400, 2.2, 'crater-breccia'], // noachis-terra
  [21.0, 15.0, -800, 2.2, 'crater-breccia'], // arabia-terra
  [81.2, 170.0, -4300, 1.2, 'aeolian-plain'], // olympia-undae
  [82.9, -47.1, -3800, 0.9, 'polar-ice'], // chasma-boreale
  [13.4, -90.7, 8000, 0.75, 'volcanic-basalt'], // tharsis-tholus
  [-5.0, -162.0, -1800, 2.0, 'aeolian-plain'], // medusae-fossae
  [3.0, 154.7, -2900, 2.0, 'volcanic-basalt'], // elysium-planitia
  [12.9, 87.0, -3700, 2.0, 'aeolian-plain'], // isidis-planitia
  [24.8, -164.0, -3900, 2.2, 'aeolian-plain'], // amazonis-planitia
  [-13.4, -61.4, -6800, 0.85, 'canyon-scree'], // coprates-chasma
  [-6.6, -70.9, -4900, 0.85, 'canyon-scree'], // candor-chasma
  [11.8, -104.1, 18225, 0.7, 'volcanic-basalt'], // ascraeus-mons
  [-8.3, -120.1, 17761, 0.55, 'volcanic-basalt'], // arsia-mons-peak
  [1.5, -112.9, 14058, 0.14, 'volcanic-basalt'], // pavonis-mons-peak
  [2.5, -79.5, -2400, 0.9, 'canyon-scree'], // echus-chasma
  [0.8, -35.4, -3800, 0.95, 'delta-sedimentary'], // hydraotes-chaos
  [34.0, -31.0, -4350, 1.5, 'delta-sedimentary'], // chryse-acidalia-pass
  [43.8, 49.4, -3100, 1.2, 'polar-ice'], // protonilus-glaciers
  [5.5, 148.0, -2900, 1.2, 'aeolian-plain'], // cerberus-palus
  [-37.2, -170.9, 800, 0.95, 'canyon-scree'], // gorgonum-chaos
  [-67.0, 131.0, 600, 1.2, 'polar-ice'], // prometheus-mons
];

const LANDMARK_ANCHORS: LandmarkMolaAnchor[] = RAW_LANDMARK_SPECS.map(
  ([lat, lon, targetElevM, sigmaDeg, geology]) => ({
    lat,
    lon,
    targetElevM,
    sigmaDeg,
    invSigma2: 1 / (sigmaDeg * sigmaDeg),
    cutoffDeg: sigmaDeg * 3.0,
    geology,
    deltaM: 0,
  })
);

export function classifyMarsSiteGeology(latDeg: number, lonDeg: number): MarsSiteGeology {
  let bestDist2 = Infinity;
  let bestType: MarsSiteGeology = Math.abs(latDeg) > 72 ? 'polar-ice' : 'aeolian-plain';
  for (let i = 0; i < LANDMARK_ANCHORS.length; i++) {
    const a = LANDMARK_ANCHORS[i];
    const dy = latDeg - a.lat;
    const searchDeg = Math.max(2.5, a.sigmaDeg * 2.2);
    if (dy > searchDeg || dy < -searchDeg) continue;
    const dx = wrapLonDiff(lonDeg, a.lon);
    if (dx > searchDeg || dx < -searchDeg) continue;
    const normD2 = (dx * dx + dy * dy) / (searchDeg * searchDeg);
    if (normD2 < 1.0 && normD2 < bestDist2) {
      bestDist2 = normD2;
      bestType = a.geology;
    }
  }
  return bestType;
}

interface BoulderSample {
  heightM: number;
  mask: number; // 0 = sand/dust regolith, 1 = exposed angular rock face
  darkTone: number; // 0 = dusty ochre, 1 = dark vesicular basalt / shadow rock
}

/**
 * Seam-free 3D cellular angular rock & boulder field evaluated on the 3D unit sphere
 * using 8 enclosing lattice corners (fast O(8) cellular lookup, zero polar seam).
 */
function evalAngularBoulderLayer(
  px: number,
  py: number,
  pz: number,
  seed: number,
  occupancyChance: number,
  maxRadius: number,
  minRadius: number,
  heightAmpM: number
): BoulderSample {
  const sx = px - 0.5;
  const sy = py - 0.5;
  const sz = pz - 0.5;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const iz = Math.floor(sz);

  let bestH = 0;
  let bestMask = 0;
  let bestTone = 0;

  for (let ox = 0; ox <= 1; ox++) {
    const cx = ix + ox;
    for (let oy = 0; oy <= 1; oy++) {
      const cy = iy + oy;
      for (let oz = 0; oz <= 1; oz++) {
        const cz = iz + oz;
        const h0 = hashInt3(cx, cy, cz, seed);
        const occ = (h0 >>> 24) / 255;
        if (occ > occupancyChance) continue;

        const jx = cx + 0.18 + (((h0 >>> 16) & 255) / 255) * 0.64;
        const jy = cy + 0.18 + (((h0 >>> 8) & 255) / 255) * 0.64;
        const jz = cz + 0.18 + ((h0 & 255) / 255) * 0.64;

        const dx = px - jx;
        const dy = py - jy;
        const dz = pz - jz;
        const d2 = dx * dx + dy * dy + dz * dz;

        const h1 = hashInt3(cx, cy, cz, seed + 17);
        const rad = minRadius + ((h1 & 255) / 255) * (maxRadius - minRadius);
        if (d2 >= rad * rad) continue;

        const invRad = 1 / rad;
        const radial = Math.sqrt(d2) * invRad;
        // Angular rock cleavage: combine radial envelope with faceted axial profile
        const facet =
          Math.max(
            Math.abs(dx) * 1.15,
            Math.abs(dy) * 1.15,
            Math.abs(dz) * 1.15,
            (Math.abs(dx) + Math.abs(dy) + Math.abs(dz)) * 0.68
          ) * invRad;
        const u = clamp(radial * 0.45 + facet * 0.55, 0, 1);
        if (u >= 1) continue;

        const rockScale = 0.55 + (((h1 >>> 8) & 255) / 255) * 0.85;
        const rawProfile = 1 - u * u;
        const rockH = heightAmpM * rockScale * Math.pow(rawProfile, 0.58);
        const mask = smoothstep(0.98, 0.55, u);
        if (rockH > bestH) {
          bestH = rockH;
          bestMask = mask;
          bestTone = ((h1 >>> 16) & 255) / 255;
        }
      }
    }
  }

  return { heightM: bestH, mask: bestMask, darkTone: bestTone };
}

/**
 * Evaluates meter & sub-meter 3D outcrops, boulders, cobbles, scree, and wind ripples
 * at unit-sphere normal (nx, ny, nz). Strictly fast & skipped at orbital levels (< 10).
 */
function sampleMicroRockReliefMeters(
  nx: number,
  ny: number,
  nz: number,
  terrainLevel: number,
  geology: MarsSiteGeology
): { reliefM: number; rockMask: number; ripple: number; darkTone: number } {
  const outcropWeight =
    geology === 'canyon-scree'
      ? 1.45
      : geology === 'volcanic-basalt'
        ? 1.35
        : geology === 'crater-breccia'
          ? 1.25
          : geology === 'delta-sedimentary'
            ? 1.05
            : geology === 'polar-ice'
              ? 0.85
              : 0.65;

  const boulderDensity =
    geology === 'canyon-scree'
      ? 0.52
      : geology === 'volcanic-basalt'
        ? 0.48
        : geology === 'crater-breccia'
          ? 0.44
          : geology === 'delta-sedimentary'
            ? 0.36
            : geology === 'polar-ice'
              ? 0.28
              : 0.22;

  let reliefM = 0;
  let rockMask = 0;
  let darkTone = 0.4;

  // Fine wind-blown Martian regolith ripples / sastrugi / terraced bedding (~40-200 m -> ~3 m)
  const fineRegolith = fbm3D(nx * 6400.0 + 1.8, ny * 6400.0 - 4.6, nz * 6400.0 + 7.5, 2);
  let ripple = 0;
  if (geology === 'delta-sedimentary' || geology === 'canyon-scree') {
    // Stepped sedimentary strata benches
    const strataRaw = fbm3D(nx * 24000.0 + 3.4, ny * 24000.0 - 1.2, nz * 24000.0 + 6.7, 2);
    const bench = Math.sin(strataRaw * 9.0) * 0.45 + strataRaw * 0.55;
    ripple = bench;
    reliefM += 1.9 * fineRegolith + 1.15 * outcropWeight * bench;
  } else {
    // Crisp aeolian mega-ripples & sastrugi ridges
    ripple = ridged3D(nx * 145000.0 + 5.1, ny * 145000.0 - 3.7, nz * 145000.0 + 2.3, 1);
    reliefM += 1.65 * fineRegolith + 0.38 * ripple;
  }

  // Level 13+: Exposed bedrock outcrops & cluster blocks (~2-5 m high, ~8-20 m across)
  if (terrainLevel >= 13) {
    const outcropScale = 950_000;
    const outcrop = evalAngularBoulderLayer(
      nx * outcropScale + 12.4,
      ny * outcropScale - 7.1,
      nz * outcropScale + 4.8,
      101,
      boulderDensity * 0.65,
      0.42,
      0.2,
      3.1 * outcropWeight
    );
    reliefM += outcrop.heightM;
    if (outcrop.mask > rockMask) {
      rockMask = outcrop.mask;
      darkTone = outcrop.darkTone;
    }
  }

  // Level 15+: Discrete meter-scale 3D angular boulders & rocks (~0.4-1.9 m tall)
  if (terrainLevel >= 15) {
    const boulderScale = 3_600_000;
    const boulder = evalAngularBoulderLayer(
      nx * boulderScale - 21.3,
      ny * boulderScale + 15.9,
      nz * boulderScale - 9.4,
      233,
      boulderDensity,
      0.38,
      0.16,
      1.35 * outcropWeight
    );
    reliefM += boulder.heightM;
    if (boulder.mask > rockMask) {
      rockMask = boulder.mask;
      darkTone = boulder.darkTone;
    }
  }

  // Level 17+: Sub-meter 3D cobbles & sharp rock edge facets (~0.15-0.55 m)
  if (terrainLevel >= 17) {
    const cobbleScale = 11_500_000;
    const cobble = evalAngularBoulderLayer(
      nx * cobbleScale + 44.2,
      ny * cobbleScale - 18.6,
      nz * cobbleScale + 31.1,
      409,
      Math.min(0.62, boulderDensity * 1.15),
      0.35,
      0.14,
      0.42 * outcropWeight
    );
    reliefM += cobble.heightM;
    if (cobble.mask > rockMask) {
      rockMask = cobble.mask;
      darkTone = cobble.darkTone;
    }
  }

  return { reliefM, rockMask, ripple, darkTone };
}

/**
 * Evaluates sub-meter / meter-scale site-specific 3D rock, boulder, cobble & ripple relief
 * for close-range surface inspection (terrainLevel >= 13) on top of MDEM200M topography.
 */
export function sampleRockMicroReliefAtLatLon(
  latDeg: number,
  lonDeg: number,
  terrainLevel: number
): number {
  if (terrainLevel < 13) return 0;
  const lonRad = lonDeg * DEG_TO_RAD;
  const latRad = latDeg * DEG_TO_RAD;
  const cosLat = Math.cos(latRad);
  const nx = cosLat * Math.cos(lonRad);
  const ny = cosLat * Math.sin(lonRad);
  const nz = Math.sin(latRad);
  const geology = classifyMarsSiteGeology(latDeg, lonDeg);
  return sampleMicroRockReliefMeters(nx, ny, nz, terrainLevel, geology).reliefM;
}

/**
 * Returns Mars surface elevation in meters from the NASA PDS 4-pixel/degree MOLA MEGDR.
 * During its one-time startup fetch only, falls back to the calibrated local model.
 * Procedural rock detail remains a visual overlay and is never added to elevations.
 */
/**
 * Fast single-pass micro-rock sample at (latDeg, lonDeg) for vectorized tile shading.
 */
export function sampleMarsRockMicroSample(
  latDeg: number,
  lonDeg: number,
  terrainLevel: number,
  geology: MarsSiteGeology
): { reliefM: number; rockMask: number; ripple: number; darkTone: number } {
  const lonRad = lonDeg * DEG_TO_RAD;
  const latRad = latDeg * DEG_TO_RAD;
  const cosLat = Math.cos(latRad);
  return sampleMicroRockReliefMeters(
    cosLat * Math.cos(lonRad),
    cosLat * Math.sin(lonRad),
    Math.sin(latRad),
    terrainLevel,
    geology
  );
}

/**
 * Evaluates directional sunlit rock/boulder micro-shading & mineral albedo RGBA
 * directly aligned with the MOLA heightfield used by the globe.
 * Accepts optional pre-resolved `geology` so tile loops skip per-pixel classification.
 */
export function sampleMarsRockShadingPixel(
  latDeg: number,
  lonDeg: number,
  pixelSizeMeters: number,
  terrainLevel: number,
  geology?: MarsSiteGeology
): [number, number, number, number] {
  const siteGeology = geology ?? classifyMarsSiteGeology(latDeg, lonDeg);
  const lonRad = lonDeg * DEG_TO_RAD;
  const latRad = latDeg * DEG_TO_RAD;
  const cosLat = Math.cos(latRad);
  const sinLat = Math.sin(latRad);
  const cosLon = Math.cos(lonRad);
  const sinLon = Math.sin(lonRad);

  // Unit normal + East/North tangent vectors on unit sphere
  const nx = cosLat * cosLon;
  const ny = cosLat * sinLon;
  const nz = sinLat;

  const ex = -sinLon;
  const ey = cosLon;
  const ux = -sinLat * cosLon;
  const uy = -sinLat * sinLon;
  const uz = cosLat;

  const stepMeters = clamp(pixelSizeMeters * 0.72, 0.28, 3.8);
  const eps = stepMeters / MARS_MEAN_RADIUS_M;

  const center = sampleMicroRockReliefMeters(nx, ny, nz, terrainLevel, siteGeology);
  const east = sampleMicroRockReliefMeters(
    nx + ex * eps,
    ny + ey * eps,
    nz,
    terrainLevel,
    siteGeology
  );
  const north = sampleMicroRockReliefMeters(
    nx + ux * eps,
    ny + uy * eps,
    nz + uz * eps,
    terrainLevel,
    siteGeology
  );

  // Local 3D slope vector in ENU meters
  const dHdE = (east.reliefM - center.reliefM) / stepMeters;
  const dHdN = (north.reliefM - center.reliefM) / stepMeters;
  const invLen = 1 / Math.sqrt(dHdE * dHdE + dHdN * dHdN + 1);
  const snE = -dHdE * invLen;
  const snN = -dHdN * invLen;
  const snU = invLen;

  // Match camera-relative upper-right solar direction for cohesive 3D relief shading
  const sunDot = clamp(snE * 0.56 + snN * 0.38 + snU * 0.73, 0.14, 1.35);
  const shade = 0.52 + 0.58 * sunDot;

  let baseR = 176;
  let baseG = 122;
  let baseB = 80;

  if (center.rockMask > 0.08) {
    // Exposed Martian rock / boulder mineral colors by geological province
    if (siteGeology === 'polar-ice') {
      baseR = lerp(196, 224, center.darkTone);
      baseG = lerp(188, 218, center.darkTone);
      baseB = lerp(182, 214, center.darkTone);
    } else if (siteGeology === 'delta-sedimentary') {
      baseR = lerp(168, 122, center.darkTone);
      baseG = lerp(118, 86, center.darkTone);
      baseB = lerp(84, 62, center.darkTone);
    } else {
      // Dark volcanic basalt / fractured breccia blocks dusted lightly with iron oxide
      baseR = lerp(108, 66, center.darkTone);
      baseG = lerp(82, 52, center.darkTone);
      baseB = lerp(66, 44, center.darkTone);
    }
  } else {
    // Wind-rippled dust / regolith apron
    const rippleShade = 0.92 + center.ripple * 0.1;
    if (siteGeology === 'polar-ice') {
      baseR = 205 * rippleShade;
      baseG = 192 * rippleShade;
      baseB = 182 * rippleShade;
    } else {
      baseR = 186 * rippleShade;
      baseG = 132 * rippleShade;
      baseB = 86 * rippleShade;
    }
  }

  // Slight crevice ambient occlusion along rock bases
  const ao = 1 - clamp(center.rockMask * (1 - sunDot) * 0.25, 0, 0.35);
  const r = clamp(Math.round(baseR * shade * ao), 0, 255);
  const g = clamp(Math.round(baseG * shade * ao), 0, 255);
  const b = clamp(Math.round(baseB * shade * ao), 0, 255);

  // Stronger alpha where discrete 3D rocks & sharp ridges emerge; translucent across flat dust
  const slopeMag = clamp(Math.hypot(dHdE, dHdN) * 0.55, 0, 1);
  const alpha = clamp(Math.round(52 + center.rockMask * 168 + slopeMag * 48), 0, 235);
  return [r, g, b, alpha];
}
