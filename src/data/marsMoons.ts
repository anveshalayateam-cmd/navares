/**
 * Martian natural satellites — illustrative real-time orbits.
 * Orbital elements: JPL Horizons / MAR099 mean geometric elements
 * (Brozović, Jacobson & Park 2025, AJ 170:42; ssd.jpl.nasa.gov).
 * Physical sizes: Ernst et al. 2023 mean radii.
 * 3D models: NASA/JPL-Caltech Science 3D Resources (glTF).
 */

export interface MarsMoonDefinition {
  id: 'phobos' | 'deimos';
  name: string;
  /** Mean radius (m) — Ernst et al. 2023 */
  meanRadiusMeters: number;
  /** Semi-major axis from Mars center (m) — JPL MAR099 mean geometric */
  semiMajorAxisMeters: number;
  /** Mean altitude above Mars mean equatorial radius (~3396 km) */
  altitudeAboveSurfaceMeters: number;
  eccentricity: number;
  /** Inclination to local Laplace / near-equatorial plane (deg) */
  inclinationDeg: number;
  /** Sidereal orbital period (minutes) */
  periodMinutes: number;
  /** Approximate orbital speed (km/s) at mean distance */
  orbitalVelocityKmS: number;
  /** JPL Horizons major-body id */
  horizonsId: string;
  /** NASA Science glTF (glB) model URL — NASA/JPL-Caltech */
  modelUrl: string;
  modelCredit: string;
  modelPageUrl: string;
}

/** Mars volumetric mean radius used for altitude display (m). */
export const MARS_MEAN_RADIUS_METERS = 3_389_500;
export const MARS_EQUATORIAL_RADIUS_METERS = 3_396_190;

export const MARS_MOONS: MarsMoonDefinition[] = [
  {
    id: 'phobos',
    name: 'Phobos',
    meanRadiusMeters: 11_080, // 11.08 km
    semiMajorAxisMeters: 9_374_960, // ~9375 km
    altitudeAboveSurfaceMeters: 9_374_960 - MARS_EQUATORIAL_RADIUS_METERS, // ~5979 km ≈ 6000 km
    eccentricity: 0.0151,
    inclinationDeg: 1.08,
    periodMinutes: 7.6539 * 60, // ~459.2 min
    orbitalVelocityKmS: 2.138,
    horizonsId: '401',
    modelUrl:
      'https://assets.science.nasa.gov/content/dam/science/psd/mars/resources/gltf_files/24878_Phobos_1_1000.glb',
    modelCredit: 'NASA/JPL-Caltech',
    modelPageUrl: 'https://science.nasa.gov/resource/phobos-mars-moon-3d-model/',
  },
  {
    id: 'deimos',
    name: 'Deimos',
    meanRadiusMeters: 6_270, // 6.27 km
    semiMajorAxisMeters: 23_457_500, // ~23458 km
    altitudeAboveSurfaceMeters: 23_457_500 - MARS_EQUATORIAL_RADIUS_METERS, // ~20061 km ≈ 22000 km class
    eccentricity: 0.0003,
    inclinationDeg: 1.79,
    periodMinutes: 30.2984 * 60, // ~1817.9 min
    orbitalVelocityKmS: 1.351,
    horizonsId: '402',
    modelUrl:
      'https://assets.science.nasa.gov/content/dam/science/psd/mars/resources/gltf_files/24879_Deimos_1_1000.glb',
    modelCredit: 'NASA/JPL-Caltech',
    modelPageUrl: 'https://science.nasa.gov/resource/deimos-mars-moon-3d-model/',
  },
];
