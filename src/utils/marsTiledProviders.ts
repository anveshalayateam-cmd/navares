import { getMarsElevation } from '../data/marsData';
import {
  classifyMarsSiteGeology,
  sampleMarsRockMicroSample,
} from './marsElevation';
import {
  computeSurfaceRadiationDoseFromElev,
  doseToBlackGreenRgb,
  elevationToGrayscaleRgb,
  sampleTesTemperatureFast,
  tempToRainbowRgb,
} from './marsOverlayMaps';

export type MarsProceduralLayerMode =
  | 'elevation'
  | 'radiation'
  | 'temperature'
  | 'rock-detail';

interface CreateProceduralProviderOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Cesium: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tilingScheme: any;
  mode: MarsProceduralLayerMode;
  solarLongitudeLs?: number;
  minimumLevel?: number;
  minRenderLevel?: number;
  maximumLevel?: number;
}

const DEG_TO_RAD = Math.PI / 180;
const MARS_MEAN_RADIUS_M = 3_396_190;

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Creates a CesiumJS-compatible multi-resolution procedural ImageryProvider
 * supporting tile zoom levels up to 18:
 *  - Elevation, Radiation, and Temperature data pyramids (levels 0..13)
 *  - Site-geology-aware 3D Micro-Rock & Regolith shading tiles (levels 11..18)
 */
export function createMarsProceduralImageryProvider({
  Cesium,
  tilingScheme,
  mode,
  solarLongitudeLs = 0,
  minimumLevel = 0,
  minRenderLevel = 0,
  maximumLevel = 12,
}: CreateProceduralProviderOptions) {
  const isRockDetail = mode === 'rock-detail';
  const tileWidth = isRockDetail ? 256 : 512;
  const tileHeight = isRockDetail ? 256 : 512;
  const effectiveMinRenderLevel = Math.max(minimumLevel, minRenderLevel);
  const errorEvent = new Cesium.Event();
  const creditLabel =
    mode === 'temperature'
      ? 'NASA MGS TES Seasonal Surface Temperature Pyramid'
      : mode === 'radiation'
        ? 'MSL RAD Atmospheric Column Shielding Model'
        : mode === 'rock-detail'
          ? 'Procedural Site-Geology Rock & Regolith Micro-Shading'
          : 'MOLA Multi-Resolution Hypsometric Pyramid';

  const scratchBySize = new Map<
    number,
    {
      offscreen: HTMLCanvasElement;
      octx: CanvasRenderingContext2D;
      imgData: ImageData;
    }
  >();

  // Reusable typed buffers for single-pass vectorized rock shading
  let rockGridCapacity = 0;
  let rockReliefBuf = new Float32Array(0);
  let rockMaskBuf = new Float32Array(0);
  let rockRippleBuf = new Float32Array(0);
  let rockToneBuf = new Float32Array(0);

  const ensureRockBuffers = (count: number) => {
    if (count <= rockGridCapacity) return;
    rockGridCapacity = count;
    rockReliefBuf = new Float32Array(count);
    rockMaskBuf = new Float32Array(count);
    rockRippleBuf = new Float32Array(count);
    rockToneBuf = new Float32Array(count);
  };

  const getScratch = (size: number) => {
    const existing = scratchBySize.get(size);
    if (existing) return existing;
    const offscreen = document.createElement('canvas');
    offscreen.width = size;
    offscreen.height = size;
    const octx = offscreen.getContext('2d');
    if (!octx) return null;
    const created = {
      offscreen,
      octx,
      imgData: octx.createImageData(size, size),
    };
    scratchBySize.set(size, created);
    return created;
  };

  const provider = {
    ready: true,
    readyPromise: Promise.resolve(true),
    rectangle: tilingScheme.rectangle,
    tileWidth,
    tileHeight,
    minimumLevel,
    maximumLevel,
    tilingScheme,
    tileDiscardPolicy: undefined,
    errorEvent,
    credit: new Cesium.Credit(creditLabel),
    hasAlphaChannel: true,
    proxy: undefined,

    getTileCredits() {
      return [];
    },

    pickFeatures() {
      return undefined;
    },

    requestImage(x: number, y: number, level: number) {
      if (level < effectiveMinRenderLevel) {
        const emptyCanvas = document.createElement('canvas');
        emptyCanvas.width = 2;
        emptyCanvas.height = 2;
        return Promise.resolve(emptyCanvas);
      }
      const canvas = document.createElement('canvas');
      canvas.width = tileWidth;
      canvas.height = tileHeight;
      const ctx = canvas.getContext('2d');
      const sampleSize = isRockDetail
        ? level >= 15
          ? 112
          : 96
        : level <= 2
          ? 128
          : level <= 5
            ? 192
            : 256;
      const scratch = getScratch(sampleSize);
      if (!ctx || !scratch) {
        return Promise.resolve(canvas);
      }

      const rect = tilingScheme.tileXYToRectangle(x, y, level);
      const westDeg = Cesium.Math.toDegrees(rect.west);
      const eastDeg = Cesium.Math.toDegrees(rect.east);
      const northDeg = Cesium.Math.toDegrees(rect.north);
      const southDeg = Cesium.Math.toDegrees(rect.south);
      const lonSpan = eastDeg - westDeg;
      const latSpan = northDeg - southDeg;
      const data = scratch.imgData.data;

      if (isRockDetail) {
        const centerLat = (northDeg + southDeg) * 0.5;
        const centerLon = ((((westDeg + eastDeg) * 0.5 + 180) % 360) + 360) % 360 - 180;
        const geology = classifyMarsSiteGeology(centerLat, centerLon);
        const gridStride = sampleSize + 1;
        ensureRockBuffers(gridStride * gridStride);

        const rockTerrainLevel = Math.max(13, Math.min(18, level + 1));
        const dLatStep = latSpan / sampleSize;
        const dLonStep = lonSpan / sampleSize;

        for (let r = 0; r <= sampleSize; r++) {
          const latDeg = Math.max(-89.999, Math.min(89.999, northDeg - r * dLatStep));
          const rowBase = r * gridStride;
          for (let c = 0; c <= sampleSize; c++) {
            const rawLon = westDeg + c * dLonStep;
            const lonDeg = ((((rawLon + 180) % 360) + 360) % 360) - 180;
            const sample = sampleMarsRockMicroSample(latDeg, lonDeg, rockTerrainLevel, geology);
            const gIdx = rowBase + c;
            rockReliefBuf[gIdx] = sample.reliefM;
            rockMaskBuf[gIdx] = sample.rockMask;
            rockRippleBuf[gIdx] = sample.ripple;
            rockToneBuf[gIdx] = sample.darkTone;
          }
        }

        const stepLatMeters = Math.max(0.28, dLatStep * DEG_TO_RAD * MARS_MEAN_RADIUS_M);
        const cosCenter = Math.max(0.14, Math.cos(centerLat * DEG_TO_RAD));
        const stepLonMeters = Math.max(
          0.28,
          dLonStep * DEG_TO_RAD * MARS_MEAN_RADIUS_M * cosCenter
        );
        const invStepLat = 1 / stepLatMeters;
        const invStepLon = 1 / stepLonMeters;

        for (let row = 0; row < sampleSize; row++) {
          const gRow = row * gridStride;
          const gNextRow = (row + 1) * gridStride;
          for (let col = 0; col < sampleSize; col++) {
            const gIdx = gRow + col;
            const hC = rockReliefBuf[gIdx];
            const hE = rockReliefBuf[gIdx + 1];
            const hS = rockReliefBuf[gNextRow + col];

            const dHdE = (hE - hC) * invStepLon;
            const dHdN = (hC - hS) * invStepLat;
            const invLen = 1 / Math.sqrt(dHdE * dHdE + dHdN * dHdN + 1);
            const snE = -dHdE * invLen;
            const snN = -dHdN * invLen;
            const snU = invLen;

            const sunDot = clamp(snE * 0.56 + snN * 0.38 + snU * 0.73, 0.16, 1.35);
            const shade = 0.52 + 0.58 * sunDot;
            const rockMask = rockMaskBuf[gIdx];
            const darkTone = rockToneBuf[gIdx];
            const ripple = rockRippleBuf[gIdx];

            let baseR = 198;
            let baseG = 88;
            let baseB = 54;

            if (rockMask > 0.08) {
              if (geology === 'polar-ice') {
                baseR = lerp(196, 224, darkTone);
                baseG = lerp(188, 218, darkTone);
                baseB = lerp(182, 214, darkTone);
              } else if (geology === 'delta-sedimentary') {
                baseR = lerp(182, 134, darkTone);
                baseG = lerp(84, 62, darkTone);
                baseB = lerp(52, 42, darkTone);
              } else {
                baseR = lerp(124, 78, darkTone);
                baseG = lerp(64, 44, darkTone);
                baseB = lerp(46, 34, darkTone);
              }
            } else {
              const rippleShade = 0.92 + ripple * 0.1;
              if (geology === 'polar-ice') {
                baseR = 205 * rippleShade;
                baseG = 192 * rippleShade;
                baseB = 182 * rippleShade;
              } else {
                baseR = 198 * rippleShade;
                baseG = 88 * rippleShade;
                baseB = 54 * rippleShade;
              }
            }

            const ao = 1 - clamp(rockMask * (1 - sunDot) * 0.25, 0, 0.35);
            const slopeMag = clamp(Math.hypot(dHdE, dHdN) * 0.55, 0, 1);
            const alpha = clampByte(50 + rockMask * 172 + slopeMag * 46);

            const idx = (row * sampleSize + col) * 4;
            data[idx] = clampByte(baseR * shade * ao);
            data[idx + 1] = clampByte(baseG * shade * ao);
            data[idx + 2] = clampByte(baseB * shade * ao);
            data[idx + 3] = alpha;
          }
        }

        scratch.octx.putImageData(scratch.imgData, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(scratch.offscreen, 0, 0, tileWidth, tileHeight);
        return Promise.resolve(canvas);
      }

      const elevLevel = Math.min(8, level);
      for (let row = 0; row < sampleSize; row++) {
        const rawLat = northDeg - ((row + 0.5) / sampleSize) * latSpan;
        const latDeg = Math.max(-89.999, Math.min(89.999, rawLat));
        for (let col = 0; col < sampleSize; col++) {
          const rawLon = westDeg + ((col + 0.5) / sampleSize) * lonSpan;
          const lonDeg = ((((rawLon + 180) % 360) + 360) % 360) - 180;
          const idx = (row * sampleSize + col) * 4;

          if (mode === 'temperature') {
            const tempC = sampleTesTemperatureFast(latDeg, lonDeg, solarLongitudeLs);
            if (tempC === null || !Number.isFinite(tempC)) {
              data[idx] = 0;
              data[idx + 1] = 0;
              data[idx + 2] = 0;
              data[idx + 3] = 0;
            } else {
              const [r, g, b] = tempToRainbowRgb(tempC);
              data[idx] = r;
              data[idx + 1] = g;
              data[idx + 2] = b;
              data[idx + 3] = 255;
            }
          } else if (mode === 'radiation') {
            const elevMeters = getMarsElevation(latDeg, lonDeg, elevLevel);
            const dose = computeSurfaceRadiationDoseFromElev(elevMeters);
            const [r, g, b] = doseToBlackGreenRgb(dose);
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
          } else {
            const elevMeters = getMarsElevation(latDeg, lonDeg, elevLevel);
            const [r, g, b] = elevationToGrayscaleRgb(elevMeters);
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
          }
        }
      }

      scratch.octx.putImageData(scratch.imgData, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(scratch.offscreen, 0, 0, tileWidth, tileHeight);

      return Promise.resolve(canvas);
    },
  };

  return provider;
}
