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

/**
 * Computes 3D Cartesian position on a Keplerian circular inclined orbit around Mars.
 * Uses Mars's gravitational parameter (MU_MARS) and equatorial radius.
 */
export function computeSatelliteCartesian(
  target: MarsTarget,
  simElapsedSeconds: number
): { x: number; y: number; z: number; latDeg: number; lonDeg: number; altKm: number } {
  const orbit = target.orbit!;
  const radius = MARS_CONSTANTS.EQUATORIAL_RADIUS + orbit.altitudeMeters;
  // Angular velocity omega = sqrt(mu / r^3) in rad/s
  const omega = Math.sqrt(MARS_CONSTANTS.MU_MARS / Math.pow(radius, 3));

  const incRad = (orbit.inclinationDeg * Math.PI) / 180;
  const raanRad = (orbit.raanDeg * Math.PI) / 180;
  const phase0Rad = (orbit.initialPhaseDeg * Math.PI) / 180;
  const theta = phase0Rad + omega * simElapsedSeconds;

  const cosO = Math.cos(raanRad);
  const sinO = Math.sin(raanRad);
  const cosI = Math.cos(incRad);
  const sinI = Math.sin(incRad);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  const x = radius * (cosO * cosT - sinO * sinT * cosI);
  const y = radius * (sinO * cosT + cosO * sinT * cosI);
  const z = radius * (sinT * sinI);

  const latDeg = (Math.asin(Math.max(-1, Math.min(1, z / radius))) * 180) / Math.PI;
  const lonDeg = (Math.atan2(y, x) * 180) / Math.PI;

  return {
    x,
    y,
    z,
    latDeg,
    lonDeg,
    altKm: orbit.altitudeMeters / 1000,
  };
}

/**
 * Samples a full 360-degree orbital ring or trailing arc for a satellite.
 */
export function sampleSatelliteOrbitArc(
  target: MarsTarget,
  simElapsedSeconds: number,
  arcDegrees = 360,
  steps = 128,
  trailingOnly = false
): Array<{ x: number; y: number; z: number }> {
  const orbit = target.orbit!;
  const radius = MARS_CONSTANTS.EQUATORIAL_RADIUS + orbit.altitudeMeters;
  const omega = Math.sqrt(MARS_CONSTANTS.MU_MARS / Math.pow(radius, 3));

  const incRad = (orbit.inclinationDeg * Math.PI) / 180;
  const raanRad = (orbit.raanDeg * Math.PI) / 180;
  const phase0Rad = (orbit.initialPhaseDeg * Math.PI) / 180;
  const currentTheta = phase0Rad + omega * simElapsedSeconds;

  const cosO = Math.cos(raanRad);
  const sinO = Math.sin(raanRad);
  const cosI = Math.cos(incRad);
  const sinI = Math.sin(incRad);

  const arcRad = (arcDegrees * Math.PI) / 180;
  const points: Array<{ x: number; y: number; z: number }> = [];

  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    const theta = trailingOnly
      ? currentTheta - arcRad * (1 - frac)
      : currentTheta + arcRad * frac;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    points.push({
      x: radius * (cosO * cosT - sinO * sinT * cosI),
      y: radius * (sinO * cosT + cosO * sinT * cosI),
      z: radius * (sinT * sinI),
    });
  }
  return points;
}

/**
 * Generates crisp, color-coded glowing SVG billboard icons (data URI) for Cesium pins.
 */
export function createGlowPinDataUri(colorHex: string, category: TargetCategory, selected = false): string {
  const size = selected ? 60 : 48;
  const center = size / 2;
  const ringRadius = selected ? 17 : 13;

  let innerShape = '';
  if (category === 'rover') {
    // Precision diamond-rover reticle
    innerShape = `<polygon points="${center},${center - 7} ${center + 7},${center} ${center},${center + 7} ${center - 7},${center}" fill="${colorHex}" stroke="#FFFFFF" stroke-width="1.5"/>`;
  } else if (category === 'satellite') {
    // Orbital spacecraft cross-wing glyph
    innerShape = `
      <rect x="${center - 11}" y="${center - 2.5}" width="22" height="5" rx="1.5" fill="${colorHex}" stroke="#FFFFFF" stroke-width="1.1"/>
      <circle cx="${center}" cy="${center}" r="4.5" fill="#0B0F17" stroke="#FFFFFF" stroke-width="1.5"/>
      <circle cx="${center}" cy="${center}" r="2" fill="${colorHex}"/>
    `;
  } else {
    // Landmark triangle summit beacon
    innerShape = `<polygon points="${center},${center - 8} ${center + 7.5},${center + 5.5} ${center - 7.5},${center + 5.5}" fill="${colorHex}" stroke="#FFFFFF" stroke-width="1.5"/>`;
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${colorHex}" stop-opacity="0.78"/>
          <stop offset="55%" stop-color="${colorHex}" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="${colorHex}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="${center}" cy="${center}" r="${center - 2}" fill="url(#glow)"/>
      <circle cx="${center}" cy="${center}" r="${ringRadius}" fill="#07090E" fill-opacity="0.72" stroke="${colorHex}" stroke-width="${selected ? 2.4 : 1.75}"/>
      ${innerShape}
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
