/**
 * Procedural Global Martian Cloud & Horizon Veil (AI-Generated)
 *
 * Inspired by ESA Rosetta OSIRIS Mars true-color & Mars Express photography:
 *  - Smooth, globally distributed thin white translucent ice-cloud & aerosol veil
 *  - Soft zonal wind-sheared cirrus wisps and delicate eddy filaments across the globe
 *  - Gentle polar ice-haze enrichment at high latitudes without localized blotches or plumes
 *
 * Designed to pair with the camera-relative limb/horizon shader in MarsGlobe.tsx so clouds
 * remain invisible straight-on from the front while emerging across grazing edges and
 * fading softly outward into black space.
 */

const DEG_TO_RAD = Math.PI / 180;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash3(ix: number, iy: number, iz: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function quintic(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function valueNoise3D(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);

  const fx = quintic(x - ix);
  const fy = quintic(y - iy);
  const fz = quintic(z - iz);

  const c000 = hash3(ix, iy, iz);
  const c100 = hash3(ix + 1, iy, iz);
  const c010 = hash3(ix, iy + 1, iz);
  const c110 = hash3(ix + 1, iy + 1, iz);
  const c001 = hash3(ix, iy, iz + 1);
  const c101 = hash3(ix + 1, iy, iz + 1);
  const c011 = hash3(ix, iy + 1, iz + 1);
  const c111 = hash3(ix + 1, iy + 1, iz + 1);

  const x00 = c000 + (c100 - c000) * fx;
  const x10 = c010 + (c110 - c010) * fx;
  const x01 = c001 + (c101 - c001) * fx;
  const x11 = c011 + (c111 - c011) * fx;

  const y0 = x00 + (x10 - x00) * fy;
  const y1 = x01 + (x11 - x01) * fy;

  return (y0 + (y1 - y0) * fz) * 2 - 1;
}

function fbm3D(x: number, y: number, z: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fy = y;
  let fz = z;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3D(fx, fy, fz);
    norm += amp;
    fx *= 2.07;
    fy *= 2.07;
    fz *= 2.07;
    amp *= 0.5;
  }
  return sum / norm;
}

let cachedGlobalCloudCanvas: HTMLCanvasElement | null = null;

/**
 * Generates and caches a seamless 2048x1024 global wispy white Martian cloud & haze map
 * sampled on the 3D unit sphere so there are zero antimeridian seams or polar pinching.
 */
export function getGlobalMarsCloudCanvas(): HTMLCanvasElement {
  if (cachedGlobalCloudCanvas) return cachedGlobalCloudCanvas;

  const srcWidth = 1024;
  const srcHeight = 512;
  const scratch = document.createElement('canvas');
  scratch.width = srcWidth;
  scratch.height = srcHeight;
  const sctx = scratch.getContext('2d');

  const outWidth = 2048;
  const outHeight = 1024;
  const master = document.createElement('canvas');
  master.width = outWidth;
  master.height = outHeight;
  const mctx = master.getContext('2d');

  if (!sctx || !mctx) {
    cachedGlobalCloudCanvas = master;
    return master;
  }

  const imgData = sctx.createImageData(srcWidth, srcHeight);
  const data = imgData.data;

  for (let row = 0; row < srcHeight; row++) {
    const latDeg = 90 - ((row + 0.5) / srcHeight) * 180;
    const latRad = latDeg * DEG_TO_RAD;
    const cosLat = Math.cos(latRad);
    const sinLat = Math.sin(latRad);
    const absLat = Math.abs(latDeg);

    for (let col = 0; col < srcWidth; col++) {
      const lonDeg = -180 + ((col + 0.5) / srcWidth) * 360;
      const lonRad = lonDeg * DEG_TO_RAD;
      const nx = cosLat * Math.cos(lonRad);
      const ny = cosLat * Math.sin(lonRad);
      const nz = sinLat;

      // Gentle zonal wind-shear domain warp so clouds stream smoothly in silky bands
      const warpX = fbm3D(nx * 2.2 + 1.7, ny * 2.2 - 0.9, nz * 3.8 + 2.4, 3);
      const warpY = fbm3D(nx * 2.2 - 3.1, ny * 2.2 + 2.5, nz * 3.8 - 1.3, 3);
      const wx = nx + warpX * 0.24;
      const wy = ny + warpY * 0.24;
      const wz = nz + warpX * 0.07;

      // Smooth broad atmospheric haze undulating gently across the entire globe
      const broadVeil = 0.5 + 0.5 * fbm3D(wx * 2.4 + 5.1, wy * 2.4 - 2.8, wz * 4.5 + 1.2, 3);

      // Silky thin east-west stretched cirrus filaments
      const cirrusStreaks =
        0.5 + 0.5 * fbm3D(wx * 4.6 - 1.8, wy * 4.6 + 4.3, wz * 13.5 - 0.7, 4);
      const fineGossamer =
        0.5 + 0.5 * fbm3D(wx * 10.5 + 6.4, wy * 10.5 - 3.9, wz * 22.0 + 2.1, 3);

      // Subtle polar ice-haze enrichment matching Rosetta OSIRIS Mars limb photography
      const polarWave = fbm3D(wx * 3.2 + 3.9, wy * 3.2 - 1.7, wz * 3.2 + 0.8, 3);
      const polarFactor = smoothstep(42, 82, absLat + polarWave * 7.5);

      // Softly distributed global density with zero opaque patches or sharp cutouts
      const baseSmooth = 0.44 + 0.2 * broadVeil;
      const wispModulation =
        0.24 * smoothstep(0.32, 0.78, cirrusStreaks * 0.72 + fineGossamer * 0.28);
      const polarBoost = polarFactor * (0.14 + 0.1 * cirrusStreaks);

      const density = clamp(baseSmooth + wispModulation + polarBoost, 0.36, 0.96);

      // Cool pearl-white at higher latitudes transitioning to soft warm ice-white at low latitudes
      const cloudR = Math.round(252 - polarFactor * 9);
      const cloudG = Math.round(251 - polarFactor * 3);
      const cloudB = Math.round(248 + polarFactor * 6);

      const idx = (row * srcWidth + col) * 4;
      data[idx] = cloudR;
      data[idx + 1] = cloudG;
      data[idx + 2] = cloudB;
      data[idx + 3] = Math.round(density * 255);
    }
  }

  sctx.putImageData(imgData, 0, 0);
  mctx.imageSmoothingEnabled = true;
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(scratch, 0, 0, outWidth, outHeight);

  cachedGlobalCloudCanvas = master;
  return master;
}
