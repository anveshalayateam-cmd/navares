import { getMarsElevation } from '../data/marsData';
import {
  computeSurfaceRadiationDoseFromElev,
  doseToBlackGreenRgb,
  elevationToGrayscaleRgb,
  sampleTesTemperatureFast,
  tempToRainbowRgb,
} from './marsOverlayMaps';

export type MarsProceduralLayerMode = 'elevation' | 'radiation' | 'temperature';

interface CreateProceduralProviderOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Cesium: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tilingScheme: any;
  mode: MarsProceduralLayerMode;
  solarLongitudeLs?: number;
  maximumLevel?: number;
}

/**
 * Creates a CesiumJS-compatible multi-resolution procedural ImageryProvider
 * supporting tile zoom levels 0..12 (~10 m/px effective detail at level 12),
 * preventing texture blur or pixelation when zooming below 40 km across
 * Elevation, Radiation, and Temperature data layers.
 */
export function createMarsProceduralImageryProvider({
  Cesium,
  tilingScheme,
  mode,
  solarLongitudeLs = 0,
  maximumLevel = 12,
}: CreateProceduralProviderOptions) {
  const tileWidth = 256;
  const tileHeight = 256;
  const errorEvent = new Cesium.Event();
  const creditLabel =
    mode === 'temperature'
      ? 'NASA MGS TES Seasonal Surface Temperature Pyramid'
      : mode === 'radiation'
        ? 'MSL RAD Atmospheric Column Shielding Model'
        : 'MOLA Multi-Resolution Hypsometric Pyramid';

  const scratchBySize = new Map<
    number,
    {
      offscreen: HTMLCanvasElement;
      octx: CanvasRenderingContext2D;
      imgData: ImageData;
    }
  >();

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
    minimumLevel: 0,
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
      const canvas = document.createElement('canvas');
      canvas.width = tileWidth;
      canvas.height = tileHeight;
      const ctx = canvas.getContext('2d');
      const sampleSize = level <= 2 ? 64 : 96;
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
      const elevLevel = Math.min(8, level);

      const data = scratch.imgData.data;

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
