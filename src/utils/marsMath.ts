import { MARS_CONSTANTS, MarsTarget, TargetCategory } from '../data/marsData';

export interface MartianSolTime {
  sol: number;
  hours: string;
  minutes: string;
  seconds: string;
  mtcFormatted: string;
}

/**
 * Computes current Martian Sol (anchored to Perseverance Sol 0 epoch)
 * and Coordinated Mars Time (MTC) using Mars's 88,775.244s solar day.
 */
export function computeMartianSol(nowMs: number, simulationMultiplier = 1, simElapsedSec = 0): MartianSolTime {
  const effectiveMs = nowMs + simElapsedSec * 1000 * (simulationMultiplier > 1 ? simulationMultiplier : 0);
  const elapsedSeconds = Math.max(0, (effectiveMs - MARS_CONSTANTS.SOL_EPOCH_MS) / 1000);
  const totalSols = elapsedSeconds / MARS_CONSTANTS.SOL_SECONDS;
  const sol = Math.floor(totalSols);
  const fractionOfSol = totalSols - sol;
  const marsHoursTotal = fractionOfSol * 24;
  const hrs = Math.floor(marsHoursTotal);
  const minsTotal = (marsHoursTotal - hrs) * 60;
  const mins = Math.floor(minsTotal);
  const secs = Math.floor((minsTotal - mins) * 60);

  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    sol,
    hours: pad(hrs),
    minutes: pad(mins),
    seconds: pad(secs),
    mtcFormatted: `${pad(hrs)}:${pad(mins)}:${pad(secs)} MTC`,
  };
}

/**
 * Formats latitude and longitude with crisp degree symbols and N/S/E/W hemispheres.
 */
export function formatLatLon(latDeg: number, lonDeg: number, decimals = 4): string {
  const latHem = latDeg >= 0 ? 'N' : 'S';
  const lonHem = lonDeg >= 0 ? 'E' : 'W';
  return `${Math.abs(latDeg).toFixed(decimals)}° ${latHem}, ${Math.abs(lonDeg).toFixed(decimals)}° ${lonHem}`;
}

import { LiveOrbiterElements } from '../services/marsOrbiterSync';

const J2000_EPOCH_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const MARS_J2 = 0.00196045;
const MARS_W0_DEG = 176.63;
const MARS_WDOT_DEG_PER_DAY = 350.89198226;
const DEFAULT_ORBIT_EPOCH_MS = Date.UTC(2025, 0, 1, 0, 0, 0);

function getMarsRotationRad(epochMs: number): number {
  const daysSinceJ2000 = (epochMs - J2000_EPOCH_MS) / 86_400_000;
  const wDeg = MARS_W0_DEG + MARS_WDOT_DEG_PER_DAY * daysSinceJ2000;
  return (wDeg * Math.PI) / 180;
}

function solveKeplerEccentricAnomaly(meanAnomalyRad: number, e: number): number {
  const M = ((meanAnomalyRad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  let E = M + e * Math.sin(M);
  for (let iter = 0; iter < 4; iter++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    E -= f / fp;
  }
  return E;
}

function propagateOrbitPoint(
  a: number,
  e: number,
  incRad: number,
  raanRad: number,
  argPeriRad: number,
  meanAnomalyRad: number,
  marsRotRad: number
): { x: number; y: number; z: number; r: number } {
  const E = solveKeplerEccentricAnomaly(meanAnomalyRad, e);
  const halfE = E / 2;
  const trueAnomaly =
    2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(halfE), Math.sqrt(1 - e) * Math.cos(halfE));
  const r = a * (1 - e * Math.cos(E));
  const u = argPeriRad + trueAnomaly;

  const cosO = Math.cos(raanRad);
  const sinO = Math.sin(raanRad);
  const cosI = Math.cos(incRad);
  const sinI = Math.sin(incRad);
  const cosU = Math.cos(u);
  const sinU = Math.sin(u);

  const xMci = r * (cosO * cosU - sinO * sinU * cosI);
  const yMci = r * (sinO * cosU + cosO * sinU * cosI);
  const zMci = r * (sinU * sinI);

  // Rotate Mars-Centered Inertial (MCI) into Mars Body-Fixed (IAU_MARS)
  const cosW = Math.cos(marsRotRad);
  const sinW = Math.sin(marsRotRad);
  return {
    x: xMci * cosW + yMci * sinW,
    y: -xMci * sinW + yMci * cosW,
    z: zMci,
    r,
  };
}

function getOrbitalStateAtEpoch(
  target: MarsTarget,
  epochMs: number,
  liveElements?: LiveOrbiterElements
) {
  const orbit = target.orbit!;
  const altitudeMeters = liveElements?.altitudeMeters ?? orbit.altitudeMeters;
  const e = liveElements?.eccentricity ?? 0.002;
  const a = MARS_CONSTANTS.EQUATORIAL_RADIUS + altitudeMeters;
  const incRad = ((liveElements?.inclinationDeg ?? orbit.inclinationDeg) * Math.PI) / 180;
  const raan0Rad = ((liveElements?.raanDeg ?? orbit.raanDeg) * Math.PI) / 180;
  const argPeri0Rad = ((liveElements?.argPeriapsisDeg ?? 0) * Math.PI) / 180;
  const ma0Rad = ((liveElements?.meanAnomalyAtEpochDeg ?? orbit.initialPhaseDeg) * Math.PI) / 180;
  const refEpochMs = liveElements?.epochMs ?? DEFAULT_ORBIT_EPOCH_MS;

  const n = Math.sqrt(MARS_CONSTANTS.MU_MARS / Math.pow(a, 3));
  const dtSec = (epochMs - refEpochMs) / 1000;

  const p = a * (1 - e * e);
  const j2Factor = n * MARS_J2 * Math.pow(MARS_CONSTANTS.EQUATORIAL_RADIUS / p, 2);
  const raanRate = -1.5 * j2Factor * Math.cos(incRad);
  const argPeriRate = 0.75 * j2Factor * (5 * Math.cos(incRad) * Math.cos(incRad) - 1);

  return {
    a,
    e,
    incRad,
    raanRad: raan0Rad + raanRate * dtSec,
    argPeriRad: argPeri0Rad + argPeriRate * dtSec,
    meanAnomalyRad: ma0Rad + n * dtSec,
    marsRotRad: getMarsRotationRad(epochMs),
  };
}

/**
 * Computes 3D Cartesian position in the Mars Body-Fixed (IAU_MARS) frame
 * at the given UTC epoch timestamp (ms), accounting for Keplerian motion,
 * J2 nodal/apsidal precession, and Mars's sidereal rotation.
 */
export function computeSatelliteCartesian(
  target: MarsTarget,
  epochMs: number = Date.now(),
  liveElements?: LiveOrbiterElements
): { x: number; y: number; z: number; latDeg: number; lonDeg: number; altKm: number; velocityKmS: number } {
  const effectiveMs = epochMs > 0 ? epochMs : Date.now();
  const state = getOrbitalStateAtEpoch(target, effectiveMs, liveElements);
  const pt = propagateOrbitPoint(
    state.a,
    state.e,
    state.incRad,
    state.raanRad,
    state.argPeriRad,
    state.meanAnomalyRad,
    state.marsRotRad
  );

  const latDeg = (Math.asin(Math.max(-1, Math.min(1, pt.z / pt.r))) * 180) / Math.PI;
  const lonDeg = (Math.atan2(pt.y, pt.x) * 180) / Math.PI;
  const altKm = (pt.r - MARS_CONSTANTS.EQUATORIAL_RADIUS) / 1000;
  const velocityKmS = Math.sqrt(MARS_CONSTANTS.MU_MARS * (2 / pt.r - 1 / state.a)) / 1000;

  return {
    x: pt.x,
    y: pt.y,
    z: pt.z,
    latDeg,
    lonDeg,
    altKm,
    velocityKmS,
  };
}

/**
 * Samples a full 360-degree orbital ring or trailing arc for a satellite
 * aligned to the instantaneous inertial orbital plane in Mars body-fixed coordinates.
 */
export function sampleSatelliteOrbitArc(
  target: MarsTarget,
  epochMs: number = Date.now(),
  arcDegrees = 360,
  steps = 128,
  trailingOnly = false,
  liveElements?: LiveOrbiterElements
): Array<{ x: number; y: number; z: number }> {
  const effectiveMs = epochMs > 0 ? epochMs : Date.now();
  const state = getOrbitalStateAtEpoch(target, effectiveMs, liveElements);
  const arcRad = (arcDegrees * Math.PI) / 180;
  const points: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    const meanAnomaly = trailingOnly
      ? state.meanAnomalyRad - arcRad * (1 - frac)
      : state.meanAnomalyRad + arcRad * frac;
    const pt = propagateOrbitPoint(
      state.a,
      state.e,
      state.incRad,
      state.raanRad,
      state.argPeriRad,
      meanAnomaly,
      state.marsRotRad
    );
    points.push({ x: pt.x, y: pt.y, z: pt.z });
  }
  return points;
}

/**
 * Generates crisp, color-coded glowing SVG billboard icons (data URI) for Cesium pins.
 */
export function createGlowPinDataUri(colorHex: string, category: TargetCategory, selected = false): string {
  const size = selected ? 30 : 24;
  const center = size / 2;
  const ringRadius = selected ? 8.5 : 6.5;

  let innerShape = '';
  if (category === 'rover') {
    // Precision diamond-rover reticle (half radius)
    innerShape = `<polygon points="${center},${center - 3.6} ${center + 3.6},${center} ${center},${center + 3.6} ${center - 3.6},${center}" fill="${colorHex}" stroke="#FFFFFF" stroke-width="0.9"/>`;
  } else if (category === 'satellite') {
    // Orbital spacecraft cross-wing glyph (half radius)
    innerShape = `
      <rect x="${center - 5.5}" y="${center - 1.3}" width="11" height="2.6" rx="0.8" fill="${colorHex}" stroke="#FFFFFF" stroke-width="0.7"/>
      <circle cx="${center}" cy="${center}" r="2.3" fill="#0B0F17" stroke="#FFFFFF" stroke-width="0.9"/>
      <circle cx="${center}" cy="${center}" r="1.0" fill="${colorHex}"/>
    `;
  } else {
    // Landmark triangle summit beacon (half radius)
    innerShape = `<polygon points="${center},${center - 4} ${center + 3.8},${center + 2.8} ${center - 3.8},${center + 2.8}" fill="${colorHex}" stroke="#FFFFFF" stroke-width="0.9"/>`;
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${colorHex}" stop-opacity="0.8"/>
          <stop offset="55%" stop-color="${colorHex}" stop-opacity="0.24"/>
          <stop offset="100%" stop-color="${colorHex}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="${center}" cy="${center}" r="${center - 1}" fill="url(#glow)"/>
      <circle cx="${center}" cy="${center}" r="${ringRadius}" fill="#07090E" fill-opacity="0.78" stroke="${colorHex}" stroke-width="${selected ? 1.5 : 1.1}"/>
      ${innerShape}
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const satelliteSpriteCache = new Map<string, string>();

/**
 * Draws high-resolution (256x256 transparent PNG data URL) top-down/isometric
 * spacecraft illustrations for MRO and MAVEN so close-up inspection never fails from CORS.
 */
function getSatelliteSpriteKey(satelliteId: string): string {
  if (satelliteId === 'mro' || satelliteId === 'imager-i-map') return 'mro';
  if (satelliteId === 'odyssey' || satelliteId === 'mars-observer' || satelliteId === 'mars-climate-orbiter') return 'odyssey';
  if (satelliteId === 'mars-express' || satelliteId === 'msr-ero') return 'mars-express';
  if (satelliteId === 'tgo' || satelliteId === 'tianwen-1' || satelliteId === 'mmx-orbiter') return 'tgo';
  if (satelliteId === 'hope' || satelliteId === 'mars-relay-eq1' || satelliteId === 'mars-relay-polar') return 'hope';
  if (satelliteId === 'mgs') return 'mgs';
  if (satelliteId === 'viking-1-orbiter' || satelliteId === 'viking-2-orbiter' || satelliteId === 'mariner-9') return 'viking-1-orbiter';
  if (satelliteId === 'mangalyaan' || satelliteId === 'phobos-2' || satelliteId === 'nozomi') return 'mangalyaan';
  return 'maven';
}

export function createSatelliteSprite(satelliteId: string): string {
  const spriteKey = getSatelliteSpriteKey(satelliteId);
  const cached = satelliteSpriteCache.get(spriteKey);
  if (cached) return cached;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;

  // Soft orbital rim halo so dark solar panels read cleanly against deep space
  const halo = ctx.createRadialGradient(cx, cy, 18, cx, cy, 118);
  halo.addColorStop(0, 'rgba(34, 211, 238, 0.16)');
  halo.addColorStop(0.65, 'rgba(56, 189, 248, 0.06)');
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  if (spriteKey === 'mro') {
    drawMroSpacecraft(ctx, cx, cy);
  } else if (spriteKey === 'odyssey') {
    drawOdysseySpacecraft(ctx, cx, cy);
  } else if (spriteKey === 'mars-express') {
    drawMarsExpressSpacecraft(ctx, cx, cy);
  } else if (spriteKey === 'tgo') {
    drawTgoSpacecraft(ctx, cx, cy);
  } else if (spriteKey === 'hope') {
    drawHopeSpacecraft(ctx, cx, cy);
  } else if (spriteKey === 'mgs') {
    drawMgsSpacecraft(ctx, cx, cy);
  } else if (spriteKey === 'viking-1-orbiter') {
    drawVikingOrbiterSpacecraft(ctx, cx, cy);
  } else if (spriteKey === 'mangalyaan') {
    drawMangalyaanSpacecraft(ctx, cx, cy);
  } else {
    drawMavenSpacecraft(ctx, cx, cy);
  }

  const dataUrl = canvas.toDataURL('image/png');
  satelliteSpriteCache.set(spriteKey, dataUrl);
  return dataUrl;
}

function drawSolarPanelGrid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cols: number,
  rows: number
) {
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, '#071738');
  grad.addColorStop(0.45, '#123a7a');
  grad.addColorStop(0.7, '#0c2757');
  grad.addColorStop(1, '#06132e');

  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // Subtle metallic frame
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x, y, w, h);

  // Inner copper/gold busbar trace
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
  ctx.lineWidth = 0.9;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);

  // Photovoltaic cell grid lines
  ctx.strokeStyle = 'rgba(147, 197, 253, 0.32)';
  ctx.lineWidth = 0.8;
  for (let c = 1; c < cols; c++) {
    const gx = x + (w * c) / cols;
    ctx.beginPath();
    ctx.moveTo(gx, y + 1);
    ctx.lineTo(gx, y + h - 1);
    ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    const gy = y + (h * r) / rows;
    ctx.beginPath();
    ctx.moveTo(x + 1, gy);
    ctx.lineTo(x + w - 1, gy);
    ctx.stroke();
  }
}

function drawMroSpacecraft(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.14); // Subtle isometric roll angle

  // Massive symmetrical rectangular solar array wings on long articulated yokes
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-22, -7);
  ctx.lineTo(-46, -15);
  ctx.moveTo(-22, 7);
  ctx.lineTo(-46, 15);
  ctx.moveTo(22, -7);
  ctx.lineTo(46, -15);
  ctx.moveTo(22, 7);
  ctx.lineTo(46, 15);
  ctx.stroke();

  drawSolarPanelGrid(ctx, -124, -23, 78, 46, 6, 4);
  drawSolarPanelGrid(ctx, 46, -23, 78, 46, 6, 4);

  // SHARAD radar dipole antennas extending aft
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-9, 26);
  ctx.lineTo(-24, 58);
  ctx.moveTo(9, 26);
  ctx.lineTo(24, 58);
  ctx.stroke();

  // Prominent protruding black HiRISE telescope barrel
  ctx.save();
  ctx.translate(0, 24);
  const barrelGrad = ctx.createLinearGradient(-13, 0, 13, 0);
  barrelGrad.addColorStop(0, '#020617');
  barrelGrad.addColorStop(0.35, '#1e293b');
  barrelGrad.addColorStop(0.7, '#020617');
  barrelGrad.addColorStop(1, '#334155');
  ctx.fillStyle = barrelGrad;
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(-13, -2, 26, 36, 3);
  ctx.fill();
  ctx.stroke();

  // HiRISE ribbed optical baffle rings
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.38)';
  ctx.lineWidth = 1;
  for (let ry = 8; ry <= 24; ry += 8) {
    ctx.beginPath();
    ctx.moveTo(-12, ry);
    ctx.lineTo(12, ry);
    ctx.stroke();
  }

  // HiRISE optical aperture lens
  const lensGrad = ctx.createRadialGradient(0, 34, 1, 0, 34, 12);
  lensGrad.addColorStop(0, '#38bdf8');
  lensGrad.addColorStop(0.45, '#0c4a6e');
  lensGrad.addColorStop(1, '#020617');
  ctx.fillStyle = lensGrad;
  ctx.beginPath();
  ctx.ellipse(0, 34, 12, 4.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();

  // Rectangular black/gold spacecraft bus
  const busGrad = ctx.createLinearGradient(-24, -26, 24, 26);
  busGrad.addColorStop(0, '#0f172a');
  busGrad.addColorStop(0.45, '#1e293b');
  busGrad.addColorStop(0.68, '#d97706');
  busGrad.addColorStop(1, '#facc15');
  ctx.fillStyle = busGrad;
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-24, -26, 48, 52, 4);
  ctx.fill();
  ctx.stroke();

  // Gold MLI lower foil blanket inset on black rectangular bus
  const foilInsetGrad = ctx.createLinearGradient(-20, 2, 20, 22);
  foilInsetGrad.addColorStop(0, '#fde047');
  foilInsetGrad.addColorStop(0.55, '#ca8a04');
  foilInsetGrad.addColorStop(1, '#92400e');
  ctx.fillStyle = foilInsetGrad;
  ctx.fillRect(-20, 4, 40, 18);
  ctx.strokeStyle = 'rgba(120, 53, 15, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-20, 10);
  ctx.lineTo(20, 18);
  ctx.moveTo(-14, 22);
  ctx.lineTo(16, 4);
  ctx.stroke();

  // Giant white circular 3-meter High-Gain Parabolic Dish Antenna on top
  ctx.save();
  ctx.translate(0, -10);
  const dishGrad = ctx.createRadialGradient(-8, -8, 3, 0, 0, 29);
  dishGrad.addColorStop(0, '#ffffff');
  dishGrad.addColorStop(0.65, '#e2e8f0');
  dishGrad.addColorStop(1, '#94a3b8');

  ctx.fillStyle = dishGrad;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Dish parabolic inner contour ring
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.stroke();

  // Feed-horn tripod struts
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 24);
    ctx.lineTo(0, 0);
    ctx.stroke();
  }

  // Central feed horn sub-reflector
  ctx.fillStyle = '#e2e8f0';
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

function drawMavenSpacecraft(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.08);

  // Iconic MAVEN gull-wing bent solar panels ending in long thin wingtip magnetometer booms
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);

    // Swept inner wing segment
    ctx.save();
    ctx.translate(21, -2);
    ctx.rotate(-0.28);
    drawSolarPanelGrid(ctx, 0, -14, 42, 28, 4, 3);

    // Bent outer gull-wing tip panel
    ctx.save();
    ctx.translate(42, 0);
    ctx.rotate(0.52);
    drawSolarPanelGrid(ctx, 0, -12, 34, 24, 3, 3);

    // Long thin magnetometer sensor boom extending from outer wingtip
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(34, 0);
    ctx.lineTo(66, 0);
    ctx.stroke();

    // Fluxgate magnetometer sensor head
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.3;
    ctx.fillRect(64, -3.5, 8, 7);
    ctx.strokeRect(64, -3.5, 8, 7);
    ctx.restore();

    ctx.restore();
    ctx.restore();
  }

  // Articulated Payload Platform (APP) UV spectrograph boom extending below
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(0, 18);
  ctx.lineTo(0, 48);
  ctx.stroke();

  // UV spectrograph & NGIMS sensor box
  const sensorGrad = ctx.createLinearGradient(-12, 42, 12, 58);
  sensorGrad.addColorStop(0, '#94a3b8');
  sensorGrad.addColorStop(1, '#334155');
  ctx.fillStyle = sensorGrad;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.2;
  ctx.fillRect(-13, 44, 26, 14);
  ctx.strokeRect(-13, 44, 26, 14);

  // UV sensor optical lenses
  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.arc(-6, 51, 2.5, 0, Math.PI * 2);
  ctx.arc(6, 51, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Cubic metallic MAVEN spacecraft bus with gold foil accents
  const bodyGrad = ctx.createLinearGradient(-21, -21, 21, 21);
  bodyGrad.addColorStop(0, '#f1f5f9');
  bodyGrad.addColorStop(0.5, '#94a3b8');
  bodyGrad.addColorStop(1, '#475569');
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-21, -21, 42, 42, 3);
  ctx.fill();
  ctx.stroke();

  // Gold thermal foil trim strip on bus
  ctx.fillStyle = '#eab308';
  ctx.fillRect(-18, 12, 36, 5);

  // High-Gain Antenna Dish mounted on top deck
  const hgaGrad = ctx.createRadialGradient(-5, -9, 2, 0, -4, 17);
  hgaGrad.addColorStop(0, '#ffffff');
  hgaGrad.addColorStop(0.7, '#cbd5e1');
  hgaGrad.addColorStop(1, '#64748b');
  ctx.fillStyle = hgaGrad;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(0, -4, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Dish feed tripod
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 + Math.PI / 6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 14, -4 + Math.sin(a) * 14);
    ctx.lineTo(0, -4);
    ctx.stroke();
  }
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(0, -4, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSpacecraftById(ctx: CanvasRenderingContext2D, cx: number, cy: number, id: string) {
  if (id === 'mro') drawMroSpacecraft(ctx, cx, cy);
  else if (id === 'odyssey') drawOdysseySpacecraft(ctx, cx, cy);
  else if (id === 'mars-express') drawMarsExpressSpacecraft(ctx, cx, cy);
  else if (id === 'tgo') drawTgoSpacecraft(ctx, cx, cy);
  else if (id === 'hope') drawHopeSpacecraft(ctx, cx, cy);
  else if (id === 'mgs') drawMgsSpacecraft(ctx, cx, cy);
  else if (id === 'viking-1-orbiter') drawVikingOrbiterSpacecraft(ctx, cx, cy);
  else if (id === 'mangalyaan') drawMangalyaanSpacecraft(ctx, cx, cy);
  else if (id === 'tianwen-1') drawTgoSpacecraft(ctx, cx, cy);
  else drawMavenSpacecraft(ctx, cx, cy);
}

function drawMgsSpacecraft(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.15);

  // Twin MGS swept solar wings + magnetometer wingtips
  drawSolarPanelGrid(ctx, -118, -16, 88, 32, 6, 3);
  drawSolarPanelGrid(ctx, 30, -16, 88, 32, 6, 3);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-118, 0);
  ctx.lineTo(-124, 0);
  ctx.moveTo(118, 0);
  ctx.lineTo(124, 0);
  ctx.stroke();

  // Rectangular gold-foil bus + protruding HGA dish
  const busGrad = ctx.createLinearGradient(-22, -26, 22, 26);
  busGrad.addColorStop(0, '#fde047');
  busGrad.addColorStop(0.5, '#b45309');
  busGrad.addColorStop(1, '#334155');
  ctx.fillStyle = busGrad;
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-24, -24, 48, 48, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(0, -34, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // MOLA laser altimeter nadir aperture
  ctx.fillStyle = '#06b6d4';
  ctx.beginPath();
  ctx.arc(0, 6, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawVikingOrbiterSpacecraft(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.2);

  // Iconic 4 cruciform solar array paddles
  drawSolarPanelGrid(ctx, -116, -12, 74, 24, 5, 2);
  drawSolarPanelGrid(ctx, 42, -12, 74, 24, 5, 2);
  drawSolarPanelGrid(ctx, -12, -116, 24, 74, 2, 5);
  drawSolarPanelGrid(ctx, -12, 42, 24, 74, 2, 5);

  // Octagonal gold bus + large white dish
  ctx.fillStyle = '#eab308';
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const px = Math.cos(a) * 32;
    const py = Math.sin(a) * 32;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(-8, -8, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMangalyaanSpacecraft(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.14);

  // Multi-panel 3-segment solar wing array on yoke
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(32, 0);
  ctx.stroke();
  drawSolarPanelGrid(ctx, 32, -19, 28, 38, 2, 3);
  drawSolarPanelGrid(ctx, 62, -19, 28, 38, 2, 3);
  drawSolarPanelGrid(ctx, 92, -19, 28, 38, 2, 3);

  // Gold-foil cubical spacecraft bus
  const foilGrad = ctx.createLinearGradient(-22, -22, 22, 22);
  foilGrad.addColorStop(0, '#fef08a');
  foilGrad.addColorStop(0.45, '#eab308');
  foilGrad.addColorStop(1, '#92400e');
  ctx.fillStyle = foilGrad;
  ctx.strokeStyle = '#fef9c3';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-23, -23, 46, 46, 3);
  ctx.fill();
  ctx.stroke();

  // Prominent parabolic dish antenna + feed tripod
  const dishGrad = ctx.createRadialGradient(-34, -8, 2, -28, -4, 21);
  dishGrad.addColorStop(0, '#ffffff');
  dishGrad.addColorStop(0.75, '#e2e8f0');
  dishGrad.addColorStop(1, '#94a3b8');
  ctx.fillStyle = dishGrad;
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(-28, -4, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.moveTo(-28 + Math.cos(a) * 18, -4 + Math.sin(a) * 18);
    ctx.lineTo(-28, -4);
    ctx.stroke();
  }
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(-28, -4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawOdysseySpacecraft(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.12);

  // Single iconic asymmetric solar array paddle on the left
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-22, 0);
  ctx.lineTo(-40, 0);
  ctx.stroke();
  drawSolarPanelGrid(ctx, -118, -22, 78, 44, 6, 4);

  // 6-meter Gamma Ray Spectrometer (GRS) boom extending right
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(96, 0);
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(92, -8, 16, 16, 3);
  ctx.fill();
  ctx.stroke();

  // Gold & black cubical spacecraft bus
  const busGrad = ctx.createLinearGradient(-22, -22, 22, 22);
  busGrad.addColorStop(0, '#fde047');
  busGrad.addColorStop(0.55, '#b45309');
  busGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = busGrad;
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-22, -22, 44, 44, 5);
  ctx.fill();
  ctx.stroke();

  // White HGA dish mounted above bus
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, -4, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(0, -4, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMarsExpressSpacecraft(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.08);

  // Twin long 20m MARSIS subsurface radar dipole booms (vertical)
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(0, -108);
  ctx.lineTo(0, 108);
  ctx.stroke();

  // Dual symmetric dark-blue solar wings
  drawSolarPanelGrid(ctx, -112, -18, 86, 36, 6, 3);
  drawSolarPanelGrid(ctx, 26, -18, 86, 36, 6, 3);

  // Compact metallic/gold ESA bus
  const busGrad = ctx.createLinearGradient(-20, -20, 20, 20);
  busGrad.addColorStop(0, '#facc15');
  busGrad.addColorStop(0.5, '#94a3b8');
  busGrad.addColorStop(1, '#475569');
  ctx.fillStyle = busGrad;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(-22, -22, 44, 44, 5);
  ctx.fill();
  ctx.stroke();

  // Central white HGA dish
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawTgoSpacecraft(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.14);

  // Two long rectangular solar wings on articulated yokes
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-22, 0);
  ctx.lineTo(-30, 0);
  ctx.moveTo(22, 0);
  ctx.lineTo(30, 0);
  ctx.stroke();

  drawSolarPanelGrid(ctx, -120, -16, 90, 32, 7, 3);
  drawSolarPanelGrid(ctx, 30, -16, 90, 32, 7, 3);

  // Compact cubic ESA Trace Gas Orbiter bus
  const bodyGrad = ctx.createLinearGradient(-22, -22, 22, 22);
  bodyGrad.addColorStop(0, '#f1f5f9');
  bodyGrad.addColorStop(0.55, '#94a3b8');
  bodyGrad.addColorStop(1, '#eab308');
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-22, -22, 44, 44, 3);
  ctx.fill();
  ctx.stroke();

  // Central circular High-Gain Dish Antenna
  const dishGrad = ctx.createRadialGradient(-5, -5, 2, 0, 0, 18);
  dishGrad.addColorStop(0, '#ffffff');
  dishGrad.addColorStop(0.75, '#e2e8f0');
  dishGrad.addColorStop(1, '#94a3b8');
  ctx.fillStyle = dishGrad;
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(0, 0, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 15, Math.sin(a) * 15);
    ctx.lineTo(0, 0);
    ctx.stroke();
  }
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawHopeSpacecraft(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.12);

  // Twin symmetrical multi-panel solar wing arrays
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-23, 0);
  ctx.lineTo(-32, 0);
  ctx.moveTo(23, 0);
  ctx.lineTo(32, 0);
  ctx.stroke();

  drawSolarPanelGrid(ctx, -116, -18, 40, 36, 3, 3);
  drawSolarPanelGrid(ctx, -74, -18, 42, 36, 3, 3);
  drawSolarPanelGrid(ctx, 32, -18, 42, 36, 3, 3);
  drawSolarPanelGrid(ctx, 76, -18, 40, 36, 3, 3);

  // Gold-foil cubic spacecraft bus
  const busGrad = ctx.createLinearGradient(-23, -23, 23, 23);
  busGrad.addColorStop(0, '#fef08a');
  busGrad.addColorStop(0.5, '#eab308');
  busGrad.addColorStop(1, '#92400e');
  ctx.fillStyle = busGrad;
  ctx.strokeStyle = '#fef9c3';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-23, -23, 46, 46, 3);
  ctx.fill();
  ctx.stroke();

  // Prominent white parabolic High-Gain Dish Antenna
  const dishGrad = ctx.createRadialGradient(-6, -6, 2, 0, 0, 21);
  dishGrad.addColorStop(0, '#ffffff');
  dishGrad.addColorStop(0.75, '#e2e8f0');
  dishGrad.addColorStop(1, '#94a3b8');
  ctx.fillStyle = dishGrad;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 - Math.PI / 6;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
    ctx.lineTo(0, 0);
    ctx.stroke();
  }
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

const roverSpriteCache = new Map<string, string>();

/**
 * Draws high-resolution (256x256 transparent PNG data URL) realistic top-down/isometric
 * sprites for all Mars rovers and stationary landers sitting on the Martian surface.
 */
function getRoverSpriteKey(roverId: string): string {
  if (roverId === 'ingenuity') return 'ingenuity';
  if (roverId === 'zhurong' || roverId === 'rosalind-franklin') return 'zhurong';
  if (roverId === 'opportunity' || roverId === 'spirit' || roverId === 'opportunity-victoria' || roverId === 'spirit-homeplate') return 'opportunity';
  if (roverId === 'insight') return 'insight';
  if (roverId === 'phoenix' || roverId === 'mars-polar-lander') return 'phoenix';
  if (roverId === 'viking-1' || roverId === 'viking-2' || roverId === 'arcadia-human-probe' || roverId === 'deuteronilus-human-probe' || roverId === 'phlegra-human-probe' || roverId === 'melas-human-probe') return 'viking-1';
  if (roverId === 'beagle-2') return 'beagle-2';
  if (roverId === 'mars-3' || roverId === 'mars-2' || roverId === 'mars-6') return 'mars-3';
  if (roverId === 'schiaparelli' || roverId === 'tianwen-3-site' || roverId === 'maw-human-probe' || roverId === 'isidis-ne-syrtis-probe' || roverId === 'midway-jezero-probe') return 'schiaparelli';
  if (roverId === 'pathfinder') return 'pathfinder';
  if (roverId === 'curiosity' || roverId === 'msl-mount-sharp') return 'curiosity';
  return 'perseverance';
}

export function createRoverSprite(roverId: string): string {
  const spriteKey = getRoverSpriteKey(roverId);
  const cached = roverSpriteCache.get(spriteKey);
  if (cached) return cached;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;

  // Subtle surface contact shadow & warm dust rim
  const shadow = ctx.createRadialGradient(cx, cy + 12, 18, cx, cy + 12, 92);
  shadow.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  shadow.addColorStop(0.55, 'rgba(0, 0, 0, 0.25)');
  shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, size, size);

  drawSurfaceCraftById(ctx, cx, cy, spriteKey);

  const dataUrl = canvas.toDataURL('image/png');
  roverSpriteCache.set(spriteKey, dataUrl);
  return dataUrl;
}

function drawSurfaceCraftById(ctx: CanvasRenderingContext2D, cx: number, cy: number, id: string) {
  if (id === 'ingenuity') {
    drawIngenuityHelicopter(ctx, cx, cy);
  } else if (id === 'zhurong') {
    drawZhurongRover(ctx, cx, cy);
  } else if (id === 'opportunity' || id === 'spirit') {
    drawMerRover(ctx, cx, cy);
  } else if (id === 'insight' || id === 'phoenix') {
    drawFanSolarLander(ctx, cx, cy, id === 'insight');
  } else if (id === 'viking-1' || id === 'viking-2') {
    drawVikingLander(ctx, cx, cy);
  } else if (id === 'beagle-2') {
    drawBeagle2Lander(ctx, cx, cy);
  } else if (id === 'mars-3') {
    drawMars3Lander(ctx, cx, cy);
  } else if (id === 'schiaparelli') {
    drawSchiaparelliProbe(ctx, cx, cy);
  } else if (id === 'pathfinder') {
    drawPathfinderAndSojourner(ctx, cx, cy);
  } else {
    drawNasaMarsRover(ctx, cx, cy, id === 'curiosity' ? 'curiosity' : 'perseverance');
  }
}

function drawIngenuityHelicopter(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);

  // Four slender carbon-fiber landing legs
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2.6;
  for (const [lx, ly] of [[-38, -32], [38, -32], [-38, 32], [38, 32]]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Coaxial counter-rotating carbon-fiber rotor blades
  ctx.save();
  ctx.rotate(-0.35);
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(-96, -7, 192, 14, 5);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.rotate(0.55);
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(-90, -6, 180, 12, 5);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Gold foil central fuselage box + top solar panel
  ctx.fillStyle = '#eab308';
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-18, -14, 36, 28, 4);
  ctx.fill();
  ctx.stroke();

  drawSolarPanelGrid(ctx, -28, -9, 56, 18, 4, 2);

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBeagle2Lander(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);

  // Iconic "pocket-watch" deployed circular solar petals (3 deployed, 1 semi-open)
  const petalAngles = [-Math.PI / 2, -0.15, Math.PI * 0.45, Math.PI * 0.98];
  for (let i = 0; i < petalAngles.length; i++) {
    ctx.save();
    ctx.rotate(petalAngles[i]);
    ctx.fillStyle = '#1e3a8a';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(36, 0, i === 3 ? 16 : 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Central gold-rimmed clam shell base
  ctx.fillStyle = '#eab308';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMars3Lander(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);

  // 4 opened triangular Soviet landing petals
  ctx.fillStyle = '#cbd5e1';
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 2 + Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-18, 52);
    ctx.lineTo(18, 52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Central spherical dome & whip antennas
  ctx.fillStyle = '#e2e8f0';
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawSchiaparelliProbe(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);

  const discGrad = ctx.createRadialGradient(-8, -8, 6, 0, 0, 44);
  discGrad.addColorStop(0, '#f8fafc');
  discGrad.addColorStop(0.7, '#94a3b8');
  discGrad.addColorStop(1, '#334155');
  ctx.fillStyle = discGrad;
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#eab308';
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPathfinderAndSojourner(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);

  // Opened 3-petal tetrahedral Pathfinder base with blue solar cells
  ctx.save();
  ctx.translate(-22, -10);
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI * 2) / 3 - Math.PI / 2);
    ctx.fillStyle = '#0c2a63';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(26, -52);
    ctx.lineTo(-26, -52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Central Pathfinder lander electronics core + dish mast
  ctx.fillStyle = '#e2e8f0';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-4, -3, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Distinct 6-wheeled rectangular flat-top solar panel Sojourner rover + front APXS spectrometer
  ctx.save();
  ctx.translate(46, 36);
  ctx.rotate(0.4);

  // Rocker-bogie struts & 6 wheels
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.8;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 12, -20);
    ctx.lineTo(side * 22, -20);
    ctx.moveTo(side * 12, 0);
    ctx.lineTo(side * 22, 0);
    ctx.moveTo(side * 12, 20);
    ctx.lineTo(side * 22, 20);
    ctx.stroke();

    for (const wy of [-20, 0, 20]) {
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(side * 22 - 4, wy - 6, 8, 12, 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Gold foil warm electronics box under solar panel
  ctx.fillStyle = '#d97706';
  ctx.fillRect(-13, -18, 26, 36);

  // Flat-top rectangular gridded blue solar panel deck
  drawSolarPanelGrid(ctx, -16, -22, 32, 44, 4, 5);

  // Front Alpha Proton X-Ray Spectrometer (APXS) sensor head
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(0, -32);
  ctx.stroke();
  ctx.fillStyle = '#f97316';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(0, -34, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Whip antenna aft
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-10, 18);
  ctx.lineTo(-14, 34);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

function drawNasaMarsRover(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  variant: 'perseverance' | 'curiosity'
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.22); // Crisp 3/4 top-down rover orientation

  // Prominent 6-wheel rocker-bogie suspension struts
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3.4;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 24, -44);
    ctx.lineTo(side * 48, -56);
    ctx.moveTo(side * 24, 0);
    ctx.lineTo(side * 50, 0);
    ctx.moveTo(side * 24, 40);
    ctx.lineTo(side * 48, 54);
    ctx.moveTo(side * 48, -56);
    ctx.lineTo(side * 50, 0);
    ctx.lineTo(side * 48, 54);
    ctx.stroke();
  }

  // 6 Black/metallic cleated wheels
  for (const side of [-1, 1]) {
    for (const wy of [-56, 0, 54]) {
      ctx.save();
      ctx.translate(side * 52, wy);
      ctx.fillStyle = '#090d16';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(-10, -16, 20, 32, 4);
      ctx.fill();
      ctx.stroke();

      // Wheel tread cleats
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
      ctx.lineWidth = 1.1;
      for (let ty = -10; ty <= 10; ty += 5) {
        ctx.beginPath();
        ctx.moveTo(-8, ty);
        ctx.lineTo(8, ty);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Distinctive rear-angled white/gold MMRTG nuclear power finned cylinder
  ctx.save();
  ctx.translate(0, 54);
  ctx.rotate(0.28);
  const rtgGrad = ctx.createLinearGradient(-14, -4, 14, 30);
  rtgGrad.addColorStop(0, '#f8fafc');
  rtgGrad.addColorStop(0.55, '#cbd5e1');
  rtgGrad.addColorStop(1, '#d97706');
  ctx.fillStyle = rtgGrad;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(-12, -4, 24, 32, 5);
  ctx.fill();
  ctx.stroke();
  // Gold MMRTG radial cooling fins
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.6;
  for (let fy = 3; fy <= 24; fy += 5) {
    ctx.beginPath();
    ctx.moveTo(-16, fy);
    ctx.lineTo(16, fy);
    ctx.stroke();
  }
  ctx.restore();

  // White rectangular chassis deck (WEB)
  const deckGrad = ctx.createLinearGradient(-29, -46, 29, 46);
  deckGrad.addColorStop(0, '#ffffff');
  deckGrad.addColorStop(0.55, '#e2e8f0');
  deckGrad.addColorStop(1, '#cbd5e1');
  ctx.fillStyle = deckGrad;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.roundRect(-29, -46, 58, 92, 5);
  ctx.fill();
  ctx.stroke();

  // Subtle gold foil radiator strip & UHF/HGA saucer antenna on aft deck
  ctx.fillStyle = variant === 'perseverance' ? '#eab308' : '#d97706';
  ctx.fillRect(-23, 20, 46, 15);
  ctx.fillStyle = '#f1f5f9';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(-13, 27, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Folded 5-joint robotic turret arm on the front
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-8, -46); // Joint 1: turret shoulder mount
  ctx.lineTo(-22, -62); // Joint 2: upper arm
  ctx.lineTo(-4, -74); // Joint 3: elbow fold
  ctx.lineTo(14, -70); // Joint 4: forearm fold
  ctx.lineTo(4, -88); // Joint 5: wrist to turret
  ctx.stroke();

  // Joint pivot dots
  ctx.fillStyle = '#64748b';
  for (const [jx, jy] of [
    [-8, -46],
    [-22, -62],
    [-4, -74],
    [14, -70],
  ]) {
    ctx.beginPath();
    ctx.arc(jx, jy, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Front SHERLOC / APXS rotary science turret
  ctx.fillStyle = '#f97316';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(3, -90, 9.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(3, -90, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Front-right white Remote Sensing Mast (SuperCam / ChemCam cyclops head)
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(15, -24);
  ctx.lineTo(16, -44);
  ctx.stroke();

  ctx.save();
  ctx.translate(16, -48);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(-16, -9, 32, 18, 4);
  ctx.fill();
  ctx.stroke();

  // Primary SuperCam / ChemCam cyclops optical lens + stereo Mastcams
  ctx.fillStyle = variant === 'perseverance' ? '#06b6d4' : '#ef4444';
  ctx.beginPath();
  ctx.arc(0, 0, 5.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(-10, -2, 2.5, 0, Math.PI * 2);
  ctx.arc(10, -2, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

function drawZhurongRover(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.18);

  // 6 Active suspension wheels
  for (const side of [-1, 1]) {
    for (const wy of [-38, 0, 38]) {
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(side * 38 - 8, wy - 12, 16, 24, 3);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Iconic 4-panel blue butterfly/wing solar arrays
  const drawWing = (x: number, y: number, w: number, h: number, tilt: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    drawSolarPanelGrid(ctx, -w / 2, -h / 2, w, h, 4, 3);
    ctx.restore();
  };
  drawWing(-56, -14, 54, 34, -0.18);
  drawWing(56, -14, 54, 34, 0.18);
  drawWing(-50, 30, 48, 28, 0.36);
  drawWing(50, 30, 48, 28, -0.36);

  // Gold-foil hexagonal central deck
  const hexPts: Array<[number, number]> = [
    [0, -38],
    [28, -18],
    [28, 20],
    [0, 38],
    [-28, 20],
    [-28, -18],
  ];
  const deckGrad = ctx.createLinearGradient(-28, -38, 28, 38);
  deckGrad.addColorStop(0, '#fef08a');
  deckGrad.addColorStop(0.5, '#eab308');
  deckGrad.addColorStop(1, '#b45309');
  ctx.fillStyle = deckGrad;
  ctx.strokeStyle = '#fef9c3';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  hexPts.forEach(([px, py], i) => {
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Dual-mast cameras on white navigation mast head
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(-15, -48, 30, 15, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(-7, -41, 3.4, 0, Math.PI * 2);
  ctx.arc(7, -41, 3.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMerRover(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.2);

  // 6 Rocker-bogie wheels
  for (const side of [-1, 1]) {
    for (const wy of [-42, 0, 42]) {
      ctx.fillStyle = '#090d16';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(side * 42 - 8, wy - 12, 16, 24, 3);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Iconic MER triangular/hexagonal solar-panel deck ("petals")
  ctx.save();
  ctx.fillStyle = '#0c2a63';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -50);
  ctx.lineTo(56, -12);
  ctx.lineTo(50, 26);
  ctx.lineTo(22, 44);
  ctx.lineTo(-22, 44);
  ctx.lineTo(-50, 26);
  ctx.lineTo(-56, -12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Solar cell grid & wing petal fold lines
  ctx.strokeStyle = 'rgba(147, 197, 253, 0.35)';
  ctx.lineWidth = 0.9;
  for (let x = -36; x <= 36; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, -30);
    ctx.lineTo(x, 40);
    ctx.stroke();
  }
  for (let y = -20; y <= 28; y += 12) {
    ctx.beginPath();
    ctx.moveTo(-46, y);
    ctx.lineTo(46, y);
    ctx.stroke();
  }
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-18, -22);
  ctx.lineTo(-34, 34);
  ctx.moveTo(18, -22);
  ctx.lineTo(34, 34);
  ctx.stroke();
  ctx.restore();

  // Gold central Warm Electronics Box + white Pancam masthead
  ctx.fillStyle = '#eab308';
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(-16, -20, 32, 34, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(-15, -37, 30, 12, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(-8, -31, 2.2, 0, Math.PI * 2);
  ctx.arc(8, -31, 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawFanSolarLander(ctx: CanvasRenderingContext2D, cx: number, cy: number, isInsight: boolean) {
  ctx.save();
  ctx.translate(cx, cy);

  // Dual iconic decagonal circular fan solar arrays (left & right)
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 58, 0);
    const fanGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 42);
    fanGrad.addColorStop(0, '#1e3a8a');
    fanGrad.addColorStop(0.7, '#0b2254');
    fanGrad.addColorStop(1, '#06122e');
    ctx.fillStyle = fanGrad;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI * 2) / 10;
      const px = Math.cos(a) * 40;
      const py = Math.sin(a) * 40;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Radial fan ribs
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
    ctx.lineWidth = 0.9;
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI * 2) / 10;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 38, Math.sin(a) * 38);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 3 Landing legs
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2.6;
  for (const a of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * 40, Math.sin(a) * 40);
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 42, Math.sin(a) * 42, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Central octagonal lander deck
  ctx.fillStyle = '#e2e8f0';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const px = Math.cos(a) * 24;
    const py = Math.sin(a) * 24;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (isInsight) {
    // Copper/white SEIS seismometer dome deployed beside lander
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, 20);
    ctx.quadraticCurveTo(14, 44, 0, 62);
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 68, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // Phoenix robotic soil-scoop arm
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(6, 18);
    ctx.lineTo(18, 56);
    ctx.lineTo(4, 70);
    ctx.stroke();
  }

  ctx.restore();
}

function drawVikingLander(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);

  // Stationary 3 landing legs & circular footpads (zero wheels)
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3.2;
  for (const a of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * 54, Math.sin(a) * 54);
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 56, Math.sin(a) * 56, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Hexagonal 1976 Viking body
  ctx.fillStyle = '#cbd5e1';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const px = Math.cos(a) * 32;
    const py = Math.sin(a) * 30;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Orange & white RTG thermal covers
  for (const rx of [-39, 25]) {
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 1.3;
    ctx.fillRect(rx, -11, 14, 22);
    ctx.strokeRect(rx, -11, 14, 22);
    ctx.fillStyle = '#f97316';
    ctx.fillRect(rx + 2, -9, 10, 8);
    ctx.fillRect(rx + 2, 3, 10, 6);
  }

  // White High-Gain S-band Dish Antenna + tripod feed
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -10, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 16, -10 + Math.sin(a) * 16);
    ctx.lineTo(0, -10);
    ctx.stroke();
  }

  // Soil sampler boom extending forward
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(0, 26);
  ctx.lineTo(0, 68);
  ctx.stroke();

  ctx.restore();
}

const targetPhotoFallbackCache = new Map<string, string>();

/**
 * Generates a crisp 640x320 procedural Martian terrain/spacecraft canvas fallback
 * if an external NASA photo URL fails to load in the Knowledge Card.
 */
export function createTargetPhotoFallback(target: MarsTarget): string {
  const cached = targetPhotoFallbackCache.get(target.id);
  if (cached) return cached;

  const w = 640;
  const h = 320;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Sky / Space backdrop gradient
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  if (target.category === 'satellite') {
    sky.addColorStop(0, '#02040a');
    sky.addColorStop(0.55, '#071324');
    sky.addColorStop(1, '#6c2b16');
  } else {
    sky.addColorStop(0, '#1c0f0b');
    sky.addColorStop(0.45, '#592616');
    sky.addColorStop(1, '#a94825');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  if (target.category === 'satellite') {
    // Curved Martian horizon below
    ctx.fillStyle = '#b44e29';
    ctx.beginPath();
    ctx.arc(w / 2, h + 470, 560, Math.PI * 1.15, Math.PI * 1.85);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // Subtle atmospheric limb glow
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(w / 2, h + 470, 560, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();

    drawSpacecraftById(ctx, w / 2, h * 0.42, target.id);
  } else {
    // Distant crater rim ridges & foreground regolith
    ctx.fillStyle = '#6f2e19';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.6);
    ctx.lineTo(w * 0.18, h * 0.48);
    ctx.lineTo(w * 0.42, h * 0.56);
    ctx.lineTo(w * 0.68, h * 0.44);
    ctx.lineTo(w, h * 0.57);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#471b0e';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    ctx.quadraticCurveTo(w * 0.48, h * 0.63, w, h * 0.74);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    if (target.category === 'rover') {
      drawSurfaceCraftById(ctx, w * 0.5, h * 0.68, target.id);
    }
  }

  const dataUrl = canvas.toDataURL('image/png');
  targetPhotoFallbackCache.set(target.id, dataUrl);
  return dataUrl;
}

/**
 * Formats Martian surface elevation in meters (e.g., "+21,229 m" or "-4,500 m").
 */
export function formatSurfaceElevation(meters: number): string {
  const rounded = Math.round(meters);
  const sign = rounded >= 0 ? '+' : '-';
  return `${sign}${Math.abs(rounded).toLocaleString('en-US')} m`;
}

/**
 * Formats geodesic surface distance cleanly in meters (< 1 km) or kilometers.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters).toLocaleString('en-US')} m`;
  }
  if (meters < 100000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${(meters / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} km`;
}

/**
 * Calculates estimated traverse durations for robotic rovers (~100 m/hr)
 * and pressurized EVA astronaut rovers (~15 km/hr).
 */
export function formatTraverseTimes(meters: number): { roboticRover: string; evaRover: string } {
  const formatDurationHours = (hours: number): string => {
    if (hours < 1) {
      const mins = Math.max(1, Math.round(hours * 60));
      return `${mins} min`;
    }
    if (hours < 48) {
      return `${hours.toFixed(1)} hrs`;
    }
    const sols = hours / 24.66;
    if (sols < 365) {
      return `${Math.round(sols).toLocaleString('en-US')} sols`;
    }
    return `${(sols / 668.6).toFixed(1)} Mars yrs`;
  };

  const roboticHours = meters / 100; // ~100 m/hr Curiosity/Perseverance average
  const evaHours = meters / 15000; // ~15 km/hr pressurized EVA rover
  return {
    roboticRover: formatDurationHours(roboticHours),
    evaRover: formatDurationHours(evaHours),
  };
}


