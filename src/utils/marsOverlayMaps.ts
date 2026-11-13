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

/**
 * Computes realistic daytime/mean Martian surface temperature (°C) at (lonDeg, latDeg):
 * - Polar caps (>65° N/S) & Olympus Mons summit: -125°C to -90°C
 * - Mid-latitudes (Utopia Planitia & southern highlands): -85°C to -45°C
 * - Equatorial belt (20°N–20°S), Valles Marineris, Gale & Jezero Craters: -30°C to +20°C
 */
export function computeSurfaceTemperatureC(lonDeg: number, latDeg: number): number {
  const elevMeters = sampleMarsElevationMeters(lonDeg, latDeg);
  const absLat = Math.abs(latDeg);

  // Smooth latitudinal solar heating profile: +12°C warm equatorial belt -> -118°C polar caps
  const latNorm = Math.min(1, absLat / 85);
  const baseTemp = 12 - 130 * Math.pow(latNorm, 1.55);

  // Adiabatic & thin-air cooling at high altitude (Olympus Mons +21 km drops ~85°C colder)
  // Low basins (<0 m) retain warmer thermal inertia & denser air
  const elevKm = elevMeters / 1000;
  const altitudeEffect = elevKm > 0 ? -4.4 * elevKm : -1.4 * elevKm;

  // Sunlit equatorial thermal hotspot boost around Valles Marineris & Syrtis/Jezero dark basalt
  const lonRad = (lonDeg * Math.PI) / 180;
  const basaltWarmth = 4.5 * Math.cos(lonRad * 2 - 0.7) * Math.exp(-(absLat * absLat) / 900);

  return Math.max(-125, Math.min(20, baseTemp + altitudeEffect + basaltWarmth));
}

function tempToRainbowRgb(tempC: number): [number, number, number] {
  // Map -125°C .. +20°C -> [0 .. 1]
  const t = Math.max(0, Math.min(1, (tempC - -125) / (20 - -125)));

  // Stops matching the legend:
  // 0.00 (-125°C): Deep Violet #1a0066 (26, 0, 102)
  // 0.18 (-99°C):  Blue        #0044ff (0, 68, 255)
  // 0.35 (-75°C):  Cyan        #00e5ff (0, 229, 255)
  // 0.54 (-47°C):  Green       #00e640 (0, 230, 64)
  // 0.70 (-24°C):  Yellow      #ffe600 (255, 230, 0)
  // 0.86 (0°C):    Orange      #ff6600 (255, 102, 0)
  // 1.00 (+20°C):  Red         #ff0000 (255, 0, 0)
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [26, 0, 102]],
    [0.18, [0, 68, 255]],
    [0.35, [0, 229, 255]],
    [0.54, [0, 230, 64]],
    [0.7, [255, 230, 0]],
    [0.86, [255, 102, 0]],
    [1.0, [255, 0, 0]],
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * k),
        Math.round(c0[1] + (c1[1] - c0[1]) * k),
        Math.round(c0[2] + (c1[2] - c0[2]) * k),
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
    tempToRainbowRgb(computeSurfaceTemperatureC(lon, lat))
  );
}

export function generateMarsElevationGrayscaleDataUrl(width = 2048, height = 1024): string {
  return renderEquirectangularMap(width, height, (lon, lat) =>
    elevationToGrayscaleRgb(sampleMarsElevationMeters(lon, lat))
  );
}
