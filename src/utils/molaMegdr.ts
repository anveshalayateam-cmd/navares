import { decode } from 'fast-png';

const WIDTH = 5760;
const HEIGHT = 2880;
const STRIP_COUNT = 8;
const STRIP_HEIGHT = HEIGHT / STRIP_COUNT; // 360
const HEIGHT_MIN_METERS = -8206.0;
const HEIGHT_RANGE_METERS = 29435.0;
const MAX_UINT16 = 65535.0;

const MEGDR_FALLBACK_WIDTH = 1440;
const MEGDR_FALLBACK_HEIGHT = 720;
const MEGDR_FALLBACK_BYTES = MEGDR_FALLBACK_WIDTH * MEGDR_FALLBACK_HEIGHT * 2;
const MEGDR_FALLBACK_URL = '/megt90n000cb.img';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let heightValues: Uint16Array | null = null;
let fallbackView: DataView | null = null;
let heightmapLoadPromise: Promise<void> | null = null;

async function fetchWithRetry(url: string, attempts = 3): Promise<Uint8Array> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Request failed for ${url} (HTTP ${response.status} ${response.statusText}).`
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function loadChunkedPngHeightmap(): Promise<Uint16Array> {
  const combined = new Uint16Array(WIDTH * HEIGHT);
  const batchSize = 4;

  for (let base = 0; base < STRIP_COUNT; base += batchSize) {
    const indices = Array.from(
      { length: Math.min(batchSize, STRIP_COUNT - base) },
      (_, offset) => base + offset
    );

    await Promise.all(
      indices.map(async (partIdx) => {
        const url = `/mola/mars_mola_5760x2880_u16_p${partIdx}.png`;
        const encodedPng = await fetchWithRetry(url);
        const hasPngSignature = PNG_SIGNATURE.every((byte, idx) => encodedPng[idx] === byte);
        if (!hasPngSignature) {
          throw new Error(`MOLA heightmap strip at ${url} is not a valid PNG.`);
        }

        const image = decode(encodedPng);
        if (
          image.width !== WIDTH ||
          image.height !== STRIP_HEIGHT ||
          image.depth !== 16 ||
          image.channels !== 1 ||
          !(image.data instanceof Uint16Array) ||
          image.data.length !== WIDTH * STRIP_HEIGHT
        ) {
          throw new Error(
            `Expected ${WIDTH}×${STRIP_HEIGHT} 16-bit grayscale PNG for strip ${partIdx}; received ${image.width}×${image.height}, ${image.channels}-channel, ${image.depth}-bit data.`
          );
        }

        combined.set(image.data, partIdx * WIDTH * STRIP_HEIGHT);
      })
    );
  }

  return combined;
}

async function loadFallbackMegdr(): Promise<DataView> {
  const bytes = await fetchWithRetry(MEGDR_FALLBACK_URL);
  if (bytes.byteLength !== MEGDR_FALLBACK_BYTES) {
    throw new Error(
      `Fallback MOLA MEGDR has ${bytes.byteLength} bytes; expected ${MEGDR_FALLBACK_BYTES}.`
    );
  }
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Fetch and decode the bundled lossless 16-bit MOLA heightmap once.
 * Loads 8 small (~2.5 MB) 5760×360 PNG strips with retry and falls back to the
 * compact 2 MB raw NASA PDS Int16 MEGDR if any chunk cannot be retrieved.
 */
export function loadMolaMegdrRaster(): Promise<void> {
  if (!heightmapLoadPromise) {
    heightmapLoadPromise = (async () => {
      try {
        heightValues = await loadChunkedPngHeightmap();
      } catch (primaryError) {
        try {
          fallbackView = await loadFallbackMegdr();
          console.warn(
            '[MOLA] Primary 5760×2880 strips unavailable, using 1440×720 NASA PDS MEGDR fallback:',
            primaryError
          );
        } catch (fallbackError) {
          heightmapLoadPromise = null;
          throw fallbackError instanceof Error ? fallbackError : primaryError;
        }
      }
      console.info(
        `[MOLA] Melas Chasma sample (-70.5°, -10.5°): ${Math.round(sampleElevationAt(-70.5, -10.5))} m`
      );
    })();
  }
  return heightmapLoadPromise;
}

function wrapColumn(col: number, width: number): number {
  return ((col % width) + width) % width;
}

function samplePngPixel(row: number, col: number): number {
  const clampedRow = Math.max(0, Math.min(HEIGHT - 1, row));
  const wrappedCol = wrapColumn(col, WIDTH);
  const gray16 = heightValues![clampedRow * WIDTH + wrappedCol];
  return HEIGHT_MIN_METERS + (gray16 / MAX_UINT16) * HEIGHT_RANGE_METERS;
}

function sampleFallbackPixel(row: number, col: number): number {
  const clampedRow = Math.max(0, Math.min(MEGDR_FALLBACK_HEIGHT - 1, row));
  const wrappedCol = wrapColumn(col, MEGDR_FALLBACK_WIDTH);
  return fallbackView!.getInt16((clampedRow * MEGDR_FALLBACK_WIDTH + wrappedCol) * 2, false);
}

/**
 * Return bilinearly interpolated MOLA elevation in meters. Longitude wraps across the
 * dateline; latitude is clamped to the source raster's +90°N..-90°S extent. An optional
 * fallback is used only during the one-time image fetch/decode at application startup.
 */
export function sampleElevationAt(
  lonDeg: number,
  latDeg: number,
  fallback?: () => number
): number {
  const clampedLatitude = Math.max(-90, Math.min(90, latDeg));

  if (heightValues) {
    const lon360 = ((lonDeg + 180) % 360 + 360) % 360;
    const u = (lon360 / 360) * WIDTH;
    const v = ((90 - clampedLatitude) / 180) * (HEIGHT - 1);
    const col0 = Math.floor(u);
    const row0 = Math.floor(v);
    const tx = u - col0;
    const ty = v - row0;

    const northWest = samplePngPixel(row0, col0);
    const northEast = samplePngPixel(row0, col0 + 1);
    const southWest = samplePngPixel(row0 + 1, col0);
    const southEast = samplePngPixel(row0 + 1, col0 + 1);
    const north = northWest + (northEast - northWest) * tx;
    const south = southWest + (southEast - southWest) * tx;
    return north + (south - north) * ty;
  }

  if (fallbackView) {
    const lon360 = ((lonDeg % 360) + 360) % 360;
    const u = (lon360 / 360) * MEGDR_FALLBACK_WIDTH;
    const v = ((90 - clampedLatitude) / 180) * (MEGDR_FALLBACK_HEIGHT - 1);
    const col0 = Math.floor(u);
    const row0 = Math.floor(v);
    const tx = u - col0;
    const ty = v - row0;

    const northWest = sampleFallbackPixel(row0, col0);
    const northEast = sampleFallbackPixel(row0, col0 + 1);
    const southWest = sampleFallbackPixel(row0 + 1, col0);
    const southEast = sampleFallbackPixel(row0 + 1, col0 + 1);
    const north = northWest + (northEast - northWest) * tx;
    const south = southWest + (southEast - southWest) * tx;
    return north + (south - north) * ty;
  }

  return fallback ? fallback() : 0;
}
