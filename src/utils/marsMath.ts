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

const satelliteSpriteCache = new Map<string, string>();

/**
 * Draws high-resolution (256x256 transparent PNG data URL) top-down/isometric
 * spacecraft illustrations for MRO and MAVEN so close-up inspection never fails from CORS.
 */
export function createSatelliteSprite(satelliteId: string): string {
  const cached = satelliteSpriteCache.get(satelliteId);
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

  if (satelliteId === 'mro') {
    drawMroSpacecraft(ctx, cx, cy);
  } else if (satelliteId === 'odyssey') {
    drawOdysseySpacecraft(ctx, cx, cy);
  } else if (satelliteId === 'mars-express') {
    drawMarsExpressSpacecraft(ctx, cx, cy);
  } else if (satelliteId === 'tgo') {
    drawTgoSpacecraft(ctx, cx, cy);
  } else if (satelliteId === 'hope') {
    drawHopeSpacecraft(ctx, cx, cy);
  } else {
    drawMavenSpacecraft(ctx, cx, cy);
  }

  const dataUrl = canvas.toDataURL('image/png');
  satelliteSpriteCache.set(satelliteId, dataUrl);
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

  // Wide left & right solar array wings + deployment yokes
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-26, -6);
  ctx.lineTo(-42, -14);
  ctx.moveTo(-26, 6);
  ctx.lineTo(-42, 14);
  ctx.moveTo(26, -6);
  ctx.lineTo(42, -14);
  ctx.moveTo(26, 6);
  ctx.lineTo(42, 14);
  ctx.stroke();

  drawSolarPanelGrid(ctx, -118, -22, 76, 44, 6, 4);
  drawSolarPanelGrid(ctx, 42, -22, 76, 44, 6, 4);

  // SHARAD radar dipole antennas extending aft
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-8, 22);
  ctx.lineTo(-22, 54);
  ctx.moveTo(8, 22);
  ctx.lineTo(22, 54);
  ctx.stroke();

  // HiRISE Telescope Barrel protruding downward/forward on the bus
  ctx.save();
  ctx.translate(0, 22);
  const barrelGrad = ctx.createLinearGradient(-13, 0, 13, 0);
  barrelGrad.addColorStop(0, '#1e293b');
  barrelGrad.addColorStop(0.35, '#475569');
  barrelGrad.addColorStop(0.7, '#0f172a');
  barrelGrad.addColorStop(1, '#334155');
  ctx.fillStyle = barrelGrad;
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(-12, -2, 24, 28, 3);
  ctx.fill();
  ctx.stroke();

  // HiRISE optical baffle aperture
  const lensGrad = ctx.createRadialGradient(0, 26, 1, 0, 26, 11);
  lensGrad.addColorStop(0, '#38bdf8');
  lensGrad.addColorStop(0.45, '#0c4a6e');
  lensGrad.addColorStop(1, '#020617');
  ctx.fillStyle = lensGrad;
  ctx.beginPath();
  ctx.ellipse(0, 26, 11, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.restore();

  // Gold MLI thermal foil octagonal spacecraft bus
  const foilGrad = ctx.createLinearGradient(-26, -24, 26, 24);
  foilGrad.addColorStop(0, '#fde047');
  foilGrad.addColorStop(0.32, '#d97706');
  foilGrad.addColorStop(0.65, '#facc15');
  foilGrad.addColorStop(1, '#92400e');

  const busR = 27;
  ctx.fillStyle = foilGrad;
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const px = Math.cos(a) * busR;
    const py = Math.sin(a) * busR;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Crinkled foil facet lines
  ctx.strokeStyle = 'rgba(120, 53, 15, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-20, -10);
  ctx.lineTo(18, 12);
  ctx.moveTo(-14, 16);
  ctx.lineTo(16, -15);
  ctx.stroke();

  // Large white circular High-Gain Parabolic Dish Antenna in center
  ctx.save();
  ctx.translate(0, -5);
  const dishGrad = ctx.createRadialGradient(-7, -7, 3, 0, 0, 25);
  dishGrad.addColorStop(0, '#ffffff');
  dishGrad.addColorStop(0.65, '#e2e8f0');
  dishGrad.addColorStop(1, '#94a3b8');

  ctx.fillStyle = dishGrad;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Dish parabolic inner ring
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.stroke();

  // Feed-horn tripod struts
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 21, Math.sin(a) * 21);
    ctx.lineTo(0, 0);
    ctx.stroke();
  }

  // Central feed horn sub-reflector
  ctx.fillStyle = '#e2e8f0';
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

function drawMavenSpacecraft(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.1);

  // Iconic MAVEN angled "gull-wing" solar arrays + wingtip magnetometer booms
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);

    // Swept inner wing segment
    ctx.save();
    ctx.translate(22, -2);
    ctx.rotate(-0.24);
    drawSolarPanelGrid(ctx, 0, -15, 44, 30, 4, 3);

    // Angled outer gull-wing tip panel
    ctx.save();
    ctx.translate(44, 0);
    ctx.rotate(0.42);
    drawSolarPanelGrid(ctx, 0, -13, 36, 26, 3, 3);

    // Long magnetometer boom extending from outer wingtip
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(36, 0);
    ctx.lineTo(62, 0);
    ctx.stroke();

    // Fluxgate magnetometer sensor head
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.3;
    ctx.fillRect(60, -4, 9, 8);
    ctx.strokeRect(60, -4, 9, 8);
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

  // Metallic octagonal/cube MAVEN spacecraft core with gold foil lower accents
  const bodyGrad = ctx.createLinearGradient(-22, -20, 22, 20);
  bodyGrad.addColorStop(0, '#e2e8f0');
  bodyGrad.addColorStop(0.5, '#94a3b8');
  bodyGrad.addColorStop(1, '#475569');
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-21, -20, 42, 40, 6);
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
  else drawMavenSpacecraft(ctx, cx, cy);
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
  ctx.rotate(-0.18);

  // Long articulated solar arrays
  drawSolarPanelGrid(ctx, -118, -16, 90, 32, 7, 3);
  drawSolarPanelGrid(ctx, 28, -16, 90, 32, 7, 3);

  // Hexagonal metallic/gold Trace Gas Orbiter bus
  const bodyGrad = ctx.createLinearGradient(-24, -20, 24, 20);
  bodyGrad.addColorStop(0, '#e2e8f0');
  bodyGrad.addColorStop(0.6, '#64748b');
  bodyGrad.addColorStop(1, '#ca8a04');
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const px = Math.cos(a) * 26;
    const py = Math.sin(a) * 24;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Large white HGA dish + NOMAD spectrometer optics
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(-6, -4, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.arc(12, 10, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawHopeSpacecraft(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.14);

  // Iconic UAESA Hope 3-panel radial solar array configuration
  for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    ctx.save();
    ctx.rotate(angle);
    drawSolarPanelGrid(ctx, 22, -14, 72, 28, 5, 3);
    ctx.restore();
  }

  // Hexagonal gold-honeycomb spacecraft bus
  const busGrad = ctx.createLinearGradient(-22, -22, 22, 22);
  busGrad.addColorStop(0, '#fef08a');
  busGrad.addColorStop(0.5, '#eab308');
  busGrad.addColorStop(1, '#92400e');
  ctx.fillStyle = busGrad;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    const px = Math.cos(a) * 24;
    const py = Math.sin(a) * 24;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // White central HGA dish
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

const roverSpriteCache = new Map<string, string>();

/**
 * Draws high-resolution (256x256 transparent PNG data URL) realistic top-down/isometric
 * sprites for all Mars rovers and stationary landers sitting on the Martian surface.
 */
export function createRoverSprite(roverId: string): string {
  const cached = roverSpriteCache.get(roverId);
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

  drawSurfaceCraftById(ctx, cx, cy, roverId);

  const dataUrl = canvas.toDataURL('image/png');
  roverSpriteCache.set(roverId, dataUrl);
  return dataUrl;
}

function drawSurfaceCraftById(ctx: CanvasRenderingContext2D, cx: number, cy: number, id: string) {
  if (id === 'zhurong') {
    drawZhurongRover(ctx, cx, cy);
  } else if (id === 'opportunity' || id === 'spirit') {
    drawMerRover(ctx, cx, cy);
  } else if (id === 'insight' || id === 'phoenix') {
    drawFanSolarLander(ctx, cx, cy, id === 'insight');
  } else if (id === 'viking-1') {
    drawVikingLander(ctx, cx, cy);
  } else {
    drawNasaMarsRover(ctx, cx, cy, id === 'curiosity' ? 'curiosity' : 'perseverance');
  }
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

  // 6 Rocker-bogie suspension struts
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3.2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 24, -44);
    ctx.lineTo(side * 46, -54);
    ctx.moveTo(side * 24, 0);
    ctx.lineTo(side * 48, 0);
    ctx.moveTo(side * 24, 40);
    ctx.lineTo(side * 46, 52);
    ctx.moveTo(side * 46, -54);
    ctx.lineTo(side * 48, 0);
    ctx.lineTo(side * 46, 52);
    ctx.stroke();
  }

  // 6 Aluminum/titanium cleated wheels
  for (const side of [-1, 1]) {
    for (const wy of [-54, 0, 52]) {
      ctx.save();
      ctx.translate(side * 50, wy);
      ctx.fillStyle = variant === 'perseverance' ? '#0f172a' : '#1e293b';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(-10, -16, 20, 32, 4);
      ctx.fill();
      ctx.stroke();

      // Wheel cleats
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

  // Aft finned MMRTG nuclear power battery
  ctx.save();
  ctx.translate(0, 56);
  ctx.rotate(0.12);
  const rtgGrad = ctx.createLinearGradient(-14, 0, 14, 24);
  rtgGrad.addColorStop(0, '#475569');
  rtgGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = rtgGrad;
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(-13, -6, 26, 28, 4);
  ctx.fill();
  ctx.stroke();
  // Cooling fins
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.2;
  for (let fy = 0; fy <= 18; fy += 6) {
    ctx.beginPath();
    ctx.moveTo(-16, fy);
    ctx.lineTo(16, fy);
    ctx.stroke();
  }
  ctx.restore();

  // Main Rover Warm Electronics Box (WEB) Chassis Deck
  const deckGrad = ctx.createLinearGradient(-30, -48, 30, 48);
  if (variant === 'perseverance') {
    deckGrad.addColorStop(0, '#f8fafc');
    deckGrad.addColorStop(0.55, '#e2e8f0');
    deckGrad.addColorStop(1, '#94a3b8');
  } else {
    deckGrad.addColorStop(0, '#fef3c7');
    deckGrad.addColorStop(0.45, '#e2e8f0');
    deckGrad.addColorStop(1, '#b45309');
  }
  ctx.fillStyle = deckGrad;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(-29, -46, 58, 92, 8);
  ctx.fill();
  ctx.stroke();

  // Gold foil thermal radiator strip & UHF high-gain saucer antenna
  ctx.fillStyle = '#eab308';
  ctx.fillRect(-23, 18, 46, 16);
  ctx.fillStyle = '#cbd5e1';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(-14, 26, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Articulated Robotic Arm + SHERLOC / APXS Science Turret forward
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(8, -46);
  ctx.lineTo(20, -76);
  ctx.lineTo(-4, -92);
  ctx.stroke();

  ctx.fillStyle = '#f97316';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(-6, -93, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // MastCam / SuperCam / ChemCam Remote Sensing Mast Head
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-12, -24);
  ctx.lineTo(-14, -44);
  ctx.stroke();

  ctx.save();
  ctx.translate(-14, -48);
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(-16, -9, 32, 18, 4);
  ctx.fill();
  ctx.stroke();

  // Primary laser/spectrometer lens + stereo navcams
  ctx.fillStyle = variant === 'perseverance' ? '#06b6d4' : '#ef4444';
  ctx.beginPath();
  ctx.arc(0, 0, 5.2, 0, Math.PI * 2);
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

  // 6 Wheels
  for (const side of [-1, 1]) {
    for (const wy of [-36, 0, 36]) {
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(side * 34 - 8, wy - 12, 16, 24, 3);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Iconic 4 butterfly-wing blue solar panels
  const drawWing = (x: number, y: number, w: number, h: number, tilt: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    drawSolarPanelGrid(ctx, -w / 2, -h / 2, w, h, 4, 3);
    ctx.restore();
  };
  drawWing(-52, -16, 52, 34, -0.2);
  drawWing(52, -16, 52, 34, 0.2);
  drawWing(-48, 28, 46, 28, 0.35);
  drawWing(48, 28, 46, 28, -0.35);

  // Central gold-foil/titanium deck
  const deckGrad = ctx.createLinearGradient(-22, -32, 22, 32);
  deckGrad.addColorStop(0, '#fde047');
  deckGrad.addColorStop(0.5, '#cbd5e1');
  deckGrad.addColorStop(1, '#d97706');
  ctx.fillStyle = deckGrad;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-24, -34, 48, 68, 8);
  ctx.fill();
  ctx.stroke();

  // Twin-eye stereo navigation mast
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(-14, -46, 28, 15, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(-6, -39, 3.2, 0, Math.PI * 2);
  ctx.arc(6, -39, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMerRover(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.2);

  // 6 Rocker-bogie wheels
  for (const side of [-1, 1]) {
    for (const wy of [-40, 0, 40]) {
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(side * 40 - 8, wy - 12, 16, 24, 3);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Iconic MER triangular batwing dark-blue solar array deck
  ctx.save();
  ctx.fillStyle = '#0c2a63';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -48);
  ctx.lineTo(54, -8);
  ctx.lineTo(44, 40);
  ctx.lineTo(-44, 40);
  ctx.lineTo(-54, -8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Solar grid overlay lines
  ctx.strokeStyle = 'rgba(147, 197, 253, 0.35)';
  ctx.lineWidth = 0.9;
  for (let x = -36; x <= 36; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, -30);
    ctx.lineTo(x, 38);
    ctx.stroke();
  }
  for (let y = -20; y <= 28; y += 12) {
    ctx.beginPath();
    ctx.moveTo(-44, y);
    ctx.lineTo(44, y);
    ctx.stroke();
  }
  ctx.restore();

  // Gold central Warm Electronics Box + white Pancam masthead
  ctx.fillStyle = '#eab308';
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(-16, -20, 32, 34, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(-14, -36, 28, 12, 3);
  ctx.fill();
  ctx.stroke();

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

  // 3 Landing legs & footpads
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  for (const a of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * 52, Math.sin(a) * 52);
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 54, Math.sin(a) * 54, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hexagonal 1976 Viking body + twin RTG windshields
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

  // RTG thermal shields (orange/white accents)
  ctx.fillStyle = '#f97316';
  ctx.fillRect(-38, -10, 14, 20);
  ctx.fillRect(24, -10, 14, 20);

  // Circular High-Gain S-band Dish Antenna
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -10, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

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


