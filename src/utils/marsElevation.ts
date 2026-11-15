/**
 * High-precision MOLA-calibrated Martian elevation model with:
 *  - Authentic planetary crustal dichotomy (Arabia/Tharsis/Aeolis/Chryse undulations)
 *  - Extensive calibrated provinces, volcanic shields, chasmata/outflow channels,
 *    polar layered domes, and named impact craters/basins
 *  - Seam-free, pole-distortion-free 3D unit-sphere fBm & ridged geological relief
 *    supporting continuous sub-meter precision below 1 km.
 */

const DEG_TO_RAD = Math.PI / 180;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
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
  { lon: -65.0, lat: -21.7, rx: 14.0, ry: 9.5, amp: 2700, flatPower: 2.2, maxRadiusNorm: 7.5 }, // Thaumasia Planum (+3,500 m)
  { lon: -65.9, lat: 10.4, rx: 10.5, ry: 8.5, amp: 2750, flatPower: 2.2, maxRadiusNorm: 7.0 }, // Lunae Planum (+1,600 m)
  { lon: -71.0, lat: 39.7, rx: 11.0, ry: 7.5, amp: 3100, flatPower: 2.2, maxRadiusNorm: 7.0 }, // Tempe Terra block
  { lon: 148.0, lat: 24.5, rx: 16.0, ry: 12.0, amp: 2250, flatPower: 2.0, maxRadiusNorm: 7.5 }, // Elysium Rise pedestal
  { lon: 42.0, lat: 2.0, rx: 18.0, ry: 12.0, amp: 1350, flatPower: 2.0, maxRadiusNorm: 7.0 }, // Terra Sabaea crest (+900 m)
  { lon: -155.0, lat: -39.5, rx: 22.0, ry: 12.0, amp: 1850, flatPower: 2.0, maxRadiusNorm: 7.0 }, // Terra Sirenum crest (+2,200 m)
  { lon: 142.0, lat: -30.0, rx: 22.0, ry: 13.0, amp: 650, flatPower: 2.0, maxRadiusNorm: 7.0 }, // Terra Cimmeria
  { lon: 35.0, lat: -45.0, rx: 20.0, ry: 13.0, amp: 1050, flatPower: 2.0, maxRadiusNorm: 7.0 }, // Noachis Terra (+1,400 m)
  { lon: -170.9, lat: -37.2, rx: 8.0, ry: 6.5, amp: 600, flatPower: 2.0, maxRadiusNorm: 6.5 }, // Gorgonum Chaos (+800 m)
  { lon: 131.0, lat: -67.0, rx: 15.0, ry: 8.0, amp: 500, flatPower: 2.0, maxRadiusNorm: 6.5 }, // Prometheus Mons (+600 m)

  // Low-Lying Plains & Ancient Depressed Terrains
  { lon: 15.0, lat: 21.0, rx: 22.0, ry: 13.0, amp: 1250, flatPower: 2.2, maxRadiusNorm: 7.0 }, // Arabia Terra shelf (~ -800 m)
  { lon: 69.5, lat: 8.4, rx: 10.0, ry: 9.0, amp: -450, flatPower: 2.2, maxRadiusNorm: 6.5 }, // Syrtis Major volcanic plain (~ -1,200 m)
  { lon: -5.53, lat: -1.95, rx: 13.0, ry: 11.0, amp: -950, flatPower: 2.2, maxRadiusNorm: 6.5 }, // Meridiani / Margaritifer basin (-1,400 m)
  { lon: -24.63, lat: 18.2, rx: 8.0, ry: 6.5, amp: -900, flatPower: 2.0, maxRadiusNorm: 6.5 }, // Oxia Planum (-3,000 m)
  { lon: -19.0, lat: 24.0, rx: 7.0, ry: 5.5, amp: 650, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Mawrth Vallis shelf (-2,200 m)
  { lon: 74.5, lat: 21.0, rx: 6.5, ry: 5.5, amp: 1250, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Nili Fossae / Jezero plateau (-1,600 m)
  { lon: 135.62, lat: 4.5, rx: 8.5, ry: 6.5, amp: -900, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Elysium / InSight plain (-2,655 m)
  { lon: 148.0, lat: 5.5, rx: 8.5, ry: 6.0, amp: 1050, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Cerberus Palus (-2,900 m)
  { lon: 166.37, lat: 11.28, rx: 6.5, ry: 4.5, amp: 850, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Cerberus Fossae (-2,700 m)
  { lon: -162.0, lat: -5.0, rx: 14.0, ry: 7.5, amp: 550, flatPower: 2.2, maxRadiusNorm: 6.5 }, // Medusae Fossae (-1,800 m)
  { lon: -33.27, lat: -23.86, rx: 9.0, ry: 6.5, amp: -1850, flatPower: 2.0, maxRadiusNorm: 6.5 }, // Holden / Eberswalde basin (-1,400..-2,200 m)
  { lon: -42.0, lat: -28.4, rx: 8.0, ry: 5.5, amp: -950, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Nirgal Vallis (-600 m)
  { lon: -19.4, lat: -23.9, rx: 8.5, ry: 6.5, amp: -1500, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Margaritifer / Mars-6 (-1,200 m)
  { lon: 47.0, lat: -45.0, rx: 9.0, ry: 6.5, amp: -1750, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Western Hellas flank / Mars-2 (-1,400 m)
  { lon: -158.0, lat: -45.0, rx: 9.5, ry: 6.5, amp: -2450, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Southern Sirenum depression / Mars-3 (-1,800 m)
  { lon: 104.5, lat: -42.1, rx: 7.0, ry: 5.5, amp: -1850, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Reull Vallis trough (-1,200 m)
  { lon: -9.46, lat: 40.75, rx: 8.0, ry: 5.5, amp: 1400, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Cydonia Mensae (-2,100 m)
  { lon: 23.8, lat: 41.5, rx: 9.5, ry: 6.5, amp: 450, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Deuteronilus Mensae (-3,350 m)
  { lon: 49.4, lat: 43.8, rx: 7.5, ry: 5.5, amp: 700, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Protonilus Mensae (-3,100 m)
  { lon: 163.5, lat: 34.2, rx: 8.5, ry: 6.0, amp: 950, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Phlegra Montes (-2,750 m)
  { lon: 170.0, lat: 81.2, rx: 14.0, ry: 4.5, amp: -1850, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Olympia Undae polar dune sea (-4,300 m)

  // Major Impact Basins & Northern Lowland Plains
  { lon: 70.5, lat: -42.4, rx: 20.5, ry: 14.2, amp: -7650, rimAmp: 350, rimRadiusRatio: 1.35, flatPower: 2.6, maxRadiusNorm: 7.5 }, // Hellas Planitia
  { lon: 58.0, lat: -40.0, rx: 10.0, ry: 7.0, amp: -1200, flatPower: 2.0, maxRadiusNorm: 6.0 }, // Western Hellas deepest pocket (~ -8,200 m)
  { lon: -43.4, lat: -49.7, rx: 13.2, ry: 9.6, amp: -5850, rimAmp: 850, rimRadiusRatio: 1.32, flatPower: 2.4, maxRadiusNorm: 7.5 }, // Argyre Planitia (-5,200 m)
  { lon: 87.5, lat: 12.9, rx: 11.8, ry: 11.2, amp: -2550, rimAmp: 450, rimRadiusRatio: 1.28, flatPower: 2.6, maxRadiusNorm: 7.0 }, // Isidis Planitia (-3,700 m)
  { lon: 117.5, lat: 46.7, rx: 24.0, ry: 17.0, amp: -950, flatPower: 2.6, maxRadiusNorm: 7.0 }, // Utopia Planitia (-4,600 m)
  { lon: -20.7, lat: 49.8, rx: 20.0, ry: 13.5, amp: -1050, flatPower: 2.4, maxRadiusNorm: 7.0 }, // Acidalia Planitia (-4,800 m)
  { lon: -168.0, lat: 46.7, rx: 20.0, ry: 13.0, amp: -250, flatPower: 2.2, maxRadiusNorm: 7.0 }, // Arcadia Planitia (-3,800 m)
  { lon: -164.0, lat: 24.8, rx: 18.0, ry: 13.0, amp: -550, flatPower: 2.4, maxRadiusNorm: 7.0 }, // Amazonis Planitia (-3,900 m)
  { lon: -39.6, lat: 28.4, rx: 14.0, ry: 10.5, amp: -600, flatPower: 2.2, maxRadiusNorm: 7.0 }, // Chryse Planitia (-3,750 m)
  { lon: 154.7, lat: 3.0, rx: 14.0, ry: 10.0, amp: -1250, flatPower: 2.2, maxRadiusNorm: 7.0 }, // Elysium Planitia (-2,900 m)
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
  // Arsia Mons (+17,761 m; -8.3N, -120.1E)
  {
    lon: -120.1,
    lat: -8.3,
    peakAmp: 17250,
    sigmaDeg: 2.35,
    calderaRadiusDeg: 0.68,
    calderaDepth: 650,
    cutoffDeg2: 32.0,
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
  // Biblis Tholus (+7,100 m; 2.5N, -124.4E)
  { lon: -124.4, lat: 2.5, peakAmp: 5450, sigmaDeg: 1.1, calderaRadiusDeg: 0.22, calderaDepth: 420, cutoffDeg2: 9.0 },
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
  // Valles Marineris system: Ius -> Melas -> Coprates -> Eos (starts east of Noctis Labyrinths)
  { lon1: -88.0, lat1: -7.5, lon2: -77.5, lat2: -8.6, halfWidthDeg: 1.45, depthM: -6800, shoulderAmp: 650 }, // Ius Chasma
  { lon1: -84.0, lat1: -4.8, lon2: -74.0, lat2: -5.4, halfWidthDeg: 1.1, depthM: -5200, shoulderAmp: 450 }, // Tithonium Chasma
  { lon1: -77.5, lat1: -8.6, lon2: -69.0, lat2: -11.4, halfWidthDeg: 2.2, depthM: -6500, shoulderAmp: 600 }, // Melas Chasma (-5,500 m)
  { lon1: -73.0, lat1: -6.6, lon2: -66.0, lat2: -7.0, halfWidthDeg: 1.6, depthM: -6050, shoulderAmp: 500 }, // Candor Chasma (-4,900 m)
  { lon1: -73.2, lat1: -4.0, lon2: -69.5, lat2: -4.3, halfWidthDeg: 1.25, depthM: -5600, shoulderAmp: 400 }, // Ophir Chasma (-4,800 m)
  { lon1: -77.0, lat1: -1.1, lon2: -75.2, lat2: -1.2, halfWidthDeg: 1.0, depthM: -4600, shoulderAmp: 350 }, // Hebes Chasma (-5,200 m)
  { lon1: -69.0, lat1: -11.4, lon2: -56.0, lat2: -14.2, halfWidthDeg: 1.45, depthM: -8450, shoulderAmp: 750 }, // Coprates Chasma (-6,800 to -7,000 m)
  { lon1: -56.0, lat1: -14.2, lon2: -42.0, lat2: -12.0, halfWidthDeg: 1.75, depthM: -5800, shoulderAmp: 450 }, // Eos & Capri Chasma
  { lon1: -51.5, lat1: -8.0, lon2: -45.5, lat2: -8.2, halfWidthDeg: 1.35, depthM: -5600, shoulderAmp: 380 }, // Ganges Chasma (-4,700 m)
  { lon1: -42.0, lat1: -12.0, lon2: -35.4, lat2: 0.8, halfWidthDeg: 2.1, depthM: -2650 }, // Hydraotes Chaos outflow (-3,800 m)
  { lon1: -42.1, lat1: 7.8, lon2: -35.7, lat2: 19.1, halfWidthDeg: 1.8, depthM: -750 }, // Shalbatana / Simud / Tiu Valles (-3,100..-3,720 m)
  { lon1: -21.5, lat1: 2.6, lon2: -33.5, lat2: 19.5, halfWidthDeg: 1.6, depthM: -850 }, // Ares Vallis (-3,200 m)
  // Kasei Valles & Echus Chasma northern outflow system
  { lon1: -79.5, lat1: 2.5, lon2: -74.0, lat2: 12.0, halfWidthDeg: 1.5, depthM: -1900, shoulderAmp: 300 }, // Echus Chasma (-2,400 m)
  { lon1: -74.0, lat1: 12.0, lon2: -62.5, lat2: 21.9, halfWidthDeg: 1.65, depthM: -550 }, // Kasei Valles (-3,100 m)
  { lon1: -62.5, lat1: 21.9, lon2: -54.0, lat2: 24.5, halfWidthDeg: 2.1, depthM: -250 }, // Lower Kasei into Chryse
  { lon1: -58.3, lat1: 12.6, lon2: -49.1, lat2: 4.9, halfWidthDeg: 1.3, depthM: -850 }, // Maja / Nanedi Valles (-2,500..-1,950 m)
  // Hellas eastern outflow canyons: Dao & Harmakhis Valles
  { lon1: 92.5, lat1: -33.5, lon2: 83.5, lat2: -39.2, halfWidthDeg: 1.25, depthM: -4250 }, // Dao Vallis (-4,600 m)
  { lon1: 94.0, lat1: -41.5, lon2: 84.5, lat2: -40.6, halfWidthDeg: 1.15, depthM: -4150 }, // Harmakhis Vallis (-4,800 m)
  // Chasma Boreale polar spiral canyon
  { lon1: -35.0, lat1: 84.0, lon2: -62.0, lat2: 81.2, halfWidthDeg: 1.35, depthM: -2350 }, // (-3,800 m)
];

const CRATER_FEATURES: EllipticalFeature[] = [
  // Deepest Northern Hemisphere Crater: Lyot (50.5N, 29.3E, -7,030 m)
  { lon: 29.3, lat: 50.5, rx: 2.1, ry: 1.7, amp: -4450, rimAmp: 1100, rimRadiusRatio: 1.18, centralPeakAmp: 950, centralPeakSigma: 0.24, flatPower: 3.0, maxRadiusNorm: 6.5 },
  // Lomonosov Crater (65.2N, -9.3E, -5,050 m)
  { lon: -9.3, lat: 65.2, rx: 1.8, ry: 1.2, amp: -1550, rimAmp: 750, rimRadiusRatio: 1.18, centralPeakAmp: 400, centralPeakSigma: 0.24, flatPower: 2.8, maxRadiusNorm: 6.0 },
  // Mie Crater (48.4N, 139.6E, -4,950 m)
  { lon: 139.6, lat: 48.4, rx: 1.5, ry: 1.1, amp: -1350, rimAmp: 700, rimRadiusRatio: 1.18, flatPower: 2.8, maxRadiusNorm: 6.0 },
  // Korolev Crater (72.77N, -164.54E, -4,600 m with water-ice mound)
  { lon: -164.54, lat: 72.77, rx: 1.7, ry: 0.9, amp: -1950, rimAmp: 800, rimRadiusRatio: 1.18, centralPeakAmp: 1350, centralPeakSigma: 0.55, flatPower: 3.0, maxRadiusNorm: 6.0 },
  // Milankovic Crater (54.7N, -146.7E, -4,400 m)
  { lon: -146.7, lat: 54.7, rx: 1.4, ry: 1.0, amp: -1150, rimAmp: 650, rimRadiusRatio: 1.18, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Moreux Crater (42.1N, 44.4E, -3,800 m)
  { lon: 44.4, lat: 42.1, rx: 1.3, ry: 1.05, amp: -1550, rimAmp: 750, rimRadiusRatio: 1.18, centralPeakAmp: 650, centralPeakSigma: 0.24, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Gale Crater (-5.4S, 137.8E, -4,500 m) + Mount Sharp foothills (-4.74S, 137.39E, -3,780 m)
  { lon: 137.65, lat: -5.1, rx: 1.45, ry: 1.45, amp: -3150, rimAmp: 1050, rimRadiusRatio: 1.24, flatPower: 2.8, maxRadiusNorm: 6.5 },
  { lon: 137.38, lat: -4.74, rx: 0.16, ry: 0.16, amp: 880, flatPower: 2.0, maxRadiusNorm: 5.5 }, // Mount Sharp climb
  // Jezero Crater (18.44N, 77.45E, -2,570 m)
  { lon: 77.48, lat: 18.42, rx: 0.48, ry: 0.46, amp: -1450, rimAmp: 620, rimRadiusRatio: 1.24, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Gusev Crater (-14.57S, 175.47E, -1,950 m)
  { lon: 175.47, lat: -14.57, rx: 1.45, ry: 1.4, amp: -2050, rimAmp: 700, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Terby Crater (-28.0S, 74.1E, -4,100 m)
  { lon: 74.1, lat: -28.0, rx: 1.6, ry: 1.4, amp: -2750, rimAmp: 800, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Becquerel Crater (21.9N, -8.0E, -3,800 m)
  { lon: -8.0, lat: 21.9, rx: 1.5, ry: 1.4, amp: -2450, rimAmp: 750, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // McLaughlin Crater (21.9N, -22.5E, -4,400 m)
  { lon: -22.5, lat: 21.9, rx: 0.9, ry: 0.85, amp: -2150, rimAmp: 650, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Cassini Crater (23.8N, 32.1E, -2,900 m)
  { lon: 32.1, lat: 23.8, rx: 3.4, ry: 3.2, amp: -2150, rimAmp: 850, rimRadiusRatio: 1.2, flatPower: 2.8, maxRadiusNorm: 6.5 },
  // Antoniadi Crater (21.5N, 60.8E, -2,100 m)
  { lon: 60.8, lat: 21.5, rx: 3.4, ry: 3.2, amp: -1550, rimAmp: 800, rimRadiusRatio: 1.2, flatPower: 2.8, maxRadiusNorm: 6.5 },
  // Huygens Crater (-13.9S, 55.6E, -1,100 m)
  { lon: 55.6, lat: -13.9, rx: 3.8, ry: 3.7, amp: -1950, rimAmp: 1200, rimRadiusRatio: 1.18, centralPeakAmp: 750, centralPeakSigma: 0.22, flatPower: 2.8, maxRadiusNorm: 6.5 },
  // Schiaparelli Crater (-2.7S, 16.7E, -1,000 m)
  { lon: 16.7, lat: -2.7, rx: 3.8, ry: 3.8, amp: -1650, rimAmp: 850, rimRadiusRatio: 1.18, flatPower: 2.8, maxRadiusNorm: 6.5 },
  // Herschel Crater (-14.5S, 129.8E, -900 m)
  { lon: 129.8, lat: -14.5, rx: 2.6, ry: 2.5, amp: -1350, rimAmp: 800, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Holden Crater (-26.4S, -34.0E, -2,200 m)
  { lon: -34.0, lat: -26.4, rx: 1.3, ry: 1.2, amp: -1350, rimAmp: 650, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Lowell Crater (-52.3S, -81.4E)
  { lon: -81.4, lat: -52.3, rx: 2.2, ry: 1.5, amp: -2100, rimAmp: 850, rimRadiusRatio: 1.2, centralPeakAmp: 700, centralPeakSigma: 0.24, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Russell Crater (-54.9S, 12.9E, +500 m)
  { lon: 12.9, lat: -54.9, rx: 1.4, ry: 1.0, amp: -150, rimAmp: 650, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 6.0 },
  // Vernal Crater (5.9N, -4.5E, -1,650 m)
  { lon: -4.5, lat: 5.9, rx: 0.65, ry: 0.65, amp: -650, rimAmp: 400, rimRadiusRatio: 1.2, flatPower: 2.6, maxRadiusNorm: 6.0 },
];

function evalEllipticalFeatures(
  lonDeg: number,
  latDeg: number,
  features: EllipticalFeature[]
): number {
  let total = 0;
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const dx = wrapLonDiff(lonDeg, f.lon) / f.rx;
    const dy = (latDeg - f.lat) / f.ry;
    const r2 = dx * dx + dy * dy;
    const maxR2 = f.maxRadiusNorm ?? 6.5;
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

/**
 * Computes a realistic MOLA-calibrated Martian terrain height (in meters)
 * for any (lonDeg, latDeg) using extensive planetary provinces, volcanic shields,
 * canyon networks, basins, impact craters, and isotropic 3D unit-sphere relief.
 */
export function sampleMarsElevationMeters(lonDeg: number, latDeg: number): number {
  const lonRad = lonDeg * DEG_TO_RAD;
  const latRad = latDeg * DEG_TO_RAD;
  const cosLat = Math.cos(latRad);
  const nx = cosLat * Math.cos(lonRad);
  const ny = cosLat * Math.sin(lonRad);
  const nz = Math.sin(latRad);

  // Domain-warped coordinates for natural planetary dichotomy & macro ridges
  const warpX = fbm3D(nx * 2.6 + 1.3, ny * 2.6 - 0.7, nz * 2.6 + 2.1, 3);
  const warpY = fbm3D(nx * 2.6 - 2.4, ny * 2.6 + 1.9, nz * 2.6 - 1.1, 3);

  // Authentic Mars crustal dichotomy boundary:
  // rises north across Arabia Terra (~24N), dips south across Tharsis (-8S),
  // Meridiani/Chryse (-3S), and Aeolis/Gale (-9S)
  const dichotomyBoundaryLat =
    3.5 +
    12.5 * Math.cos((lonDeg - 32.0) * DEG_TO_RAD) -
    10.5 * Math.cos((lonDeg + 108.0) * DEG_TO_RAD) -
    8.5 * Math.exp(-Math.pow(wrapLonDiff(lonDeg, 138.0) / 26.0, 2)) -
    9.5 * Math.exp(-Math.pow(wrapLonDiff(lonDeg, -10.0) / 24.0, 2)) +
    warpX * 3.8;
  const dichotomy = -1750 - 2050 * Math.tanh((latDeg - dichotomyBoundaryLat) / 14.5);

  // Subtle macro-warped coordinates for broad regional provinces (keeps pinpoint craters exact)
  const warpedLon = lonDeg + warpX * 1.05;
  const warpedLat = clamp(latDeg + warpY * 0.85, -89.99, 89.99);

  // 1. Broad Crustal Provinces & Major Impact Basins
  const provinces = evalEllipticalFeatures(warpedLon, warpedLat, REGIONAL_PROVINCES);

  // 2. Volcanic Shields, Tholi, Basal Scarps & Summit Calderas
  let volcanoes = 0;
  for (let i = 0; i < VOLCANO_FEATURES.length; i++) {
    const v = VOLCANO_FEATURES[i];
    const dx = wrapLonDiff(lonDeg, v.lon);
    const dy = latDeg - v.lat;
    const r2 = dx * dx + dy * dy;
    if (r2 >= v.cutoffDeg2) continue;
    const r = Math.sqrt(r2);
    const lobeWarp = 1 + 0.055 * fbm3D(nx * 14 + 3.1, ny * 14 - 1.4, nz * 14 + 0.8, 2);
    const effR = r * lobeWarp;
    volcanoes += v.peakAmp * Math.exp(-(effR * effR) / (v.sigmaDeg * v.sigmaDeg));
    if (v.scarpRadiusDeg && v.scarpAmp) {
      volcanoes += v.scarpAmp * (0.5 - 0.5 * Math.tanh((effR - v.scarpRadiusDeg) / 0.38));
    }
    if (v.calderaRadiusDeg && v.calderaDepth) {
      volcanoes -= v.calderaDepth * Math.exp(-(r2) / (v.calderaRadiusDeg * v.calderaRadiusDeg));
    }
  }

  // 3. Tectonic Chasmata & Outflow Channel Segments (with raised canyon shoulders)
  let canyons = 0;
  for (let i = 0; i < CANYON_SEGMENTS.length; i++) {
    const seg = CANYON_SEGMENTS[i];
    const minSegLat = Math.min(seg.lat1, seg.lat2) - seg.halfWidthDeg * 3.5;
    const maxSegLat = Math.max(seg.lat1, seg.lat2) + seg.halfWidthDeg * 3.5;
    if (latDeg < minSegLat || latDeg > maxSegLat) continue;

    const { distDeg } = segmentOffsetDeg(lonDeg, latDeg, seg.lon1, seg.lat1, seg.lon2, seg.lat2);
    const w = seg.halfWidthDeg;
    if (distDeg > w * 3.8) continue;

    const u = distDeg / w;
    canyons += seg.depthM * Math.exp(-Math.pow(u, 2.35));
    if (seg.shoulderAmp) {
      const sh = u - 1.55;
      canyons += seg.shoulderAmp * Math.exp(-(sh * sh) / 0.45);
    }
  }

  // 4. Named Impact Craters (pinpoint coordinates)
  const craters = evalEllipticalFeatures(lonDeg, latDeg, CRATER_FEATURES);

  // 5. Planum Boreum & Planum Australe Polar Layered Ice Caps
  const polarBoreum = latDeg > 76 ? 1950 * Math.exp(-Math.pow((90 - latDeg) / 7.2, 2)) : 0;
  const polarAustrale = latDeg < -76 ? 1350 * Math.exp(-Math.pow((-90 - latDeg) / 7.8, 2)) : 0;

  // 6. Geological Roughness (damped in flat lowland plains, stronger in southern highlands)
  const highlandFactor = clamp(0.42 + 0.65 * (0.5 - 0.5 * Math.tanh((latDeg - dichotomyBoundaryLat) / 14.0)), 0.35, 1.1);
  const macroFbm = fbm3D(nx * 5.2 + warpX * 0.45, ny * 5.2 + warpY * 0.45, nz * 5.2, 4);
  const macroRidges = ridged3D(nx * 9.5 + 4.2, ny * 9.5 - 2.1, nz * 9.5 + 1.7, 3);
  const macroTerrain = highlandFactor * (420 * macroFbm + 190 * macroRidges);

  return (
    dichotomy +
    provinces +
    volcanoes +
    canyons +
    craters +
    polarBoreum +
    polarAustrale +
    macroTerrain
  );
}

/**
 * Returns the MOLA-calibrated Mars surface elevation at latitude/longitude in meters.
 * Scales smoothly from planetary landforms (level 0..3) to mesoscale ridges/craters (level 4..7)
 * and continuous sub-kilometer micro-topography (level 8+), returning continuous float meters
 * so slopes and elevation deltas under 1 km preserve full precision.
 */
export function getMarsElevation(latDeg: number, lonDeg: number, terrainLevel = 0): number {
  const baseElevation = sampleMarsElevationMeters(lonDeg, latDeg);
  if (terrainLevel < 4) return baseElevation;

  const lonRad = lonDeg * DEG_TO_RAD;
  const latRad = latDeg * DEG_TO_RAD;
  const cosLat = Math.cos(latRad);
  const nx = cosLat * Math.cos(lonRad);
  const ny = cosLat * Math.sin(lonRad);
  const nz = Math.sin(latRad);

  // Mesoscale tectonic ridges, eroded crater rims, and valley networks (wavelength ~10-40 km)
  const warp = fbm3D(nx * 34.0 + 7.1, ny * 34.0 - 3.3, nz * 34.0 + 5.2, 2) * 0.45;
  const mesoRidges = ridged3D(nx * 46.0 + warp, ny * 46.0 - warp, nz * 46.0 + warp * 0.5, 3);
  const mesoBasins = fbm3D(nx * 68.0 - 2.7, ny * 68.0 + 6.4, nz * 68.0 - 4.1, 3);
  let relief = 115 * mesoRidges + 85 * mesoBasins;

  // Sub-kilometer micro-topography (wavelength ~50 m to ~3 km) for close-up precision
  if (terrainLevel >= 7) {
    const microRidges = ridged3D(nx * 380.0 + 11.4, ny * 380.0 - 8.2, nz * 380.0 + 3.7, 3);
    const microDunes = fbm3D(nx * 1450.0 - 5.9, ny * 1450.0 + 9.3, nz * 1450.0 - 2.4, 3);
    relief += 26 * microRidges + 8.5 * microDunes;
  }

  if (terrainLevel >= 10) {
    const fineRegolith = fbm3D(nx * 6400.0 + 1.8, ny * 6400.0 - 4.6, nz * 6400.0 + 7.5, 2);
    relief += 1.8 * fineRegolith;
  }

  return baseElevation + relief;
}
