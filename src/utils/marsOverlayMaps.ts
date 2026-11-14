import { sampleMarsElevationMeters } from '../data/marsData';

/**
 * Computes calibrated surface radiation dose (mSv/day) at (lonDeg, latDeg)
 * using Martian atmospheric column shielding calibrated to Curiosity MSL RAD (~0.64 mSv/day).
 */
export function computeSurfaceRadiationDose(lonDeg: number, latDeg: number): number {
  const elevMeters = sampleMarsElevationMeters(lonDeg, latDeg);
  const scaleHeightMeters = 11100;
  const relPressure = Math.exp(-elevMeters / scaleHeightMeters);
  const shieldingFactor = Math.exp(-0.44 * relPressure);
  const rawDose = 1.24 * shieldingFactor;
  return Math.max(0.2, Math.min(1.28, rawDose));
}

function doseToBlackGreenRgb(dose: number): [number, number, number] {
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

/**
 * Estimates daytime Martian surface temperature in Celsius at (latitude, longitude).
 * Regional ranges are constrained to the map legend: polar caps -125..-95°C,
 * high volcanic peaks -80..-65°C, mid-latitude plains -45..-30°C,
 * equatorial craters/plains -15..+5°C, and deep equatorial canyons +5..+15°C.
 */
export function getMarsSurfaceTempC(lat: number, lon: number): number {
  const latitude = Math.max(-90, Math.min(90, lat));
  const longitude = ((lon + 180) % 360 + 360) % 360 - 180;
  const absLat = Math.abs(latitude);
  const elevationMeters = sampleMarsElevationMeters(longitude, latitude);
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  // Polar caps and high-latitude ice stay at the cold end of the legend.
  if (absLat > 70) {
    return -95 - clamp((absLat - 70) * 1.5, 0, 30);
  }

  // Olympus Mons and the Tharsis Montes are colder than surrounding plains.
  if (absLat < 35 && elevationMeters >= 9000) {
    return -65 - clamp((elevationMeters - 9000) / 800, 0, 15);
  }

  // Deep Valles Marineris floor: low elevation and sunlit equatorial canyon.
  if (
    absLat < 20 &&
    longitude >= -82 &&
    longitude <= -48 &&
    elevationMeters < -2500
  ) {
    return 5 + clamp((-elevationMeters - 2500) / 450, 0, 1) * 10;
  }

  // Viking 1 and Pathfinder sit in cool northern plains despite their low latitude.
  if (
    absLat >= 14 &&
    absLat <= 28 &&
    longitude >= -55 &&
    longitude <= -25
  ) {
    return -30 - clamp(absLat - 14, 0, 15);
  }

  // Gale, Jezero, Meridiani/Opportunity and comparable equatorial plains.
  if (absLat <= 25) {
    return -15 + 20 * (1 - absLat / 25);
  }

  // Northern and mid-latitude plains trend from -30°C toward -45°C by 60°.
  return -30 - clamp((absLat - 30) / 30, 0, 1) * 15;
}

export function formatMarsSurfaceTempC(tempC: number): string {
  const rounded = Math.round(tempC);
  return `${rounded > 0 ? '+' : ''}${rounded}°C`;
}

function tempToRainbowRgb(tempC: number): [number, number, number] {
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

function elevationToGrayscaleRgb(elevMeters: number): [number, number, number] {
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
  pixelFn: (lonDeg: number, latDeg: number) => [number, number, number]
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const gridW = 1024;
  const gridH = 512;
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
      const [r, g, b] = pixelFn(lonDeg, latDeg);
      const idx = (row * gridW + col) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
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

export function generateMarsTemperatureDataUrl(width = 2048, height = 1024): string {
  return renderEquirectangularMap(width, height, (lon, lat) =>
    tempToRainbowRgb(getMarsSurfaceTempC(lat, lon))
  );
}

export function generateMarsElevationGrayscaleDataUrl(width = 2048, height = 1024): string {
  return renderEquirectangularMap(width, height, (lon, lat) =>
    elevationToGrayscaleRgb(sampleMarsElevationMeters(lon, lat))
  );
}
