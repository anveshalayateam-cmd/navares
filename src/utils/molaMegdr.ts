const WIDTH = 1440;
const HEIGHT = 720;
const BYTES_PER_SAMPLE = 2;
const EXPECTED_BYTES = WIDTH * HEIGHT * BYTES_PER_SAMPLE;
const MEGDR_URL = '/megt90n000cb.img';

let rasterView: DataView | null = null;
let rasterLoadPromise: Promise<void> | null = null;

/** Load the bundled NASA PDS 4-pixel/degree MOLA topography raster exactly once. */
export function loadMolaMegdrRaster(): Promise<void> {
  if (!rasterLoadPromise) {
    rasterLoadPromise = (async () => {
      const response = await fetch(MEGDR_URL);
      if (!response.ok) {
        throw new Error(`MOLA MEGDR request failed (${response.status} ${response.statusText}).`);
      }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength !== EXPECTED_BYTES) {
        throw new Error(
          `MOLA MEGDR has ${buffer.byteLength} bytes; expected ${EXPECTED_BYTES} for ${WIDTH}×${HEIGHT} Int16 samples.`
        );
      }
      rasterView = new DataView(buffer);
    })();
  }
  return rasterLoadPromise;
}

function wrapColumn(col: number): number {
  return ((col % WIDTH) + WIDTH) % WIDTH;
}

function sampleGrid(row: number, col: number): number {
  const clampedRow = Math.max(0, Math.min(HEIGHT - 1, row));
  const wrappedCol = wrapColumn(col);
  return rasterView!.getInt16((clampedRow * WIDTH + wrappedCol) * BYTES_PER_SAMPLE, false);
}

/**
 * Sample areocentric MOLA topography in meters. Bilinear interpolation keeps the raster
 * seam-free at 0°/360°E and removes visible height steps between adjacent grid posts.
 * Until the startup fetch completes, an optional source-compatible fallback can be used.
 */
export function sampleElevationAt(
  lonDeg: number,
  latDeg: number,
  fallback?: () => number
): number {
  if (!rasterView) return fallback ? fallback() : 0;

  const lon360 = ((lonDeg % 360) + 360) % 360;
  const u = (lon360 / 360) * WIDTH;
  const v = ((90 - Math.max(-90, Math.min(90, latDeg))) / 180) * (HEIGHT - 1);
  const rowPosition = v;
  const col0 = Math.floor(u);
  const row0 = Math.floor(rowPosition);
  const tx = u - col0;
  const ty = rowPosition - row0;

  const northWest = sampleGrid(row0, col0);
  const northEast = sampleGrid(row0, col0 + 1);
  const southWest = sampleGrid(row0 + 1, col0);
  const southEast = sampleGrid(row0 + 1, col0 + 1);
  const north = northWest + (northEast - northWest) * tx;
  const south = southWest + (southEast - southWest) * tx;
  return north + (south - north) * ty;
}
