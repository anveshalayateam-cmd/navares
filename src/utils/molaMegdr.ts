import { decode } from 'fast-png';

const WIDTH = 5760;
const HEIGHT = 2880;
const HEIGHT_MIN_METERS = -8206.0;
const HEIGHT_RANGE_METERS = 29435.0;
const MAX_UINT16 = 65535.0;
const HEIGHTMAP_URL = '/mars_mola_5760x2880_u16.png';

let heightValues: Uint16Array | null = null;
let heightmapLoadPromise: Promise<void> | null = null;

/** Fetch and decode the bundled lossless 16-bit MOLA heightmap exactly once. */
export function loadMolaMegdrRaster(): Promise<void> {
  if (!heightmapLoadPromise) {
    heightmapLoadPromise = (async () => {
      const response = await fetch(HEIGHTMAP_URL);
      if (!response.ok) {
        throw new Error(
          `MOLA heightmap request failed for ${HEIGHTMAP_URL} (HTTP ${response.status} ${response.statusText}).`
        );
      }

      const encodedPng = new Uint8Array(await response.arrayBuffer());
      const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      const hasPngSignature = pngSignature.every((byte, index) => encodedPng[index] === byte);
      if (!hasPngSignature) {
        const receivedSignature = Array.from(encodedPng.subarray(0, 8))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join(' ');
        throw new Error(
          `MOLA heightmap at ${HEIGHTMAP_URL} is not a valid PNG (HTTP ${response.status}; received signature ${receivedSignature || '<empty>'}).`
        );
      }
      const image = decode(encodedPng);
      if (
        image.width !== WIDTH ||
        image.height !== HEIGHT ||
        image.depth !== 16 ||
        image.channels !== 1 ||
        !(image.data instanceof Uint16Array) ||
        image.data.length !== WIDTH * HEIGHT
      ) {
        throw new Error(
          `Expected a ${WIDTH}×${HEIGHT}, single-channel 16-bit PNG; received ${image.width}×${image.height}, ${image.channels}-channel, ${image.depth}-bit data.`
        );
      }

      heightValues = image.data;
      console.info(
        `[MOLA] Melas Chasma sample (-70.5°, -10.5°): ${Math.round(sampleElevationAt(-70.5, -10.5))} m`
      );
    })();
  }
  return heightmapLoadPromise;
}

function wrapColumn(col: number): number {
  return ((col % WIDTH) + WIDTH) % WIDTH;
}

function samplePixel(row: number, col: number): number {
  const clampedRow = Math.max(0, Math.min(HEIGHT - 1, row));
  const wrappedCol = wrapColumn(col);
  const gray16 = heightValues![clampedRow * WIDTH + wrappedCol];
  return HEIGHT_MIN_METERS + (gray16 / MAX_UINT16) * HEIGHT_RANGE_METERS;
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
  if (!heightValues) return fallback ? fallback() : 0;

  const lon360 = ((lonDeg + 180) % 360 + 360) % 360;
  const u = (lon360 / 360) * WIDTH;
  const clampedLatitude = Math.max(-90, Math.min(90, latDeg));
  const v = ((90 - clampedLatitude) / 180) * (HEIGHT - 1);
  const col0 = Math.floor(u);
  const row0 = Math.floor(v);
  const tx = u - col0;
  const ty = v - row0;

  const northWest = samplePixel(row0, col0);
  const northEast = samplePixel(row0, col0 + 1);
  const southWest = samplePixel(row0 + 1, col0);
  const southEast = samplePixel(row0 + 1, col0 + 1);
  const north = northWest + (northEast - northWest) * tx;
  const south = southWest + (southEast - southWest) * tx;
  return north + (south - north) * ty;
}
