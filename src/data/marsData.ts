export type TargetCategory = 'rover' | 'satellite' | 'landmark';

export type TelemetryMode = 'realtime' | 'simulation100x';

export interface SurvivalHazardNotes {
  slopeSteepness: string;
  dustRisk: string;
  radiationLevel: string;
  thermalRange: string;
  astronautAdvisory: string;
}

export interface MarsTarget {
  id: string;
  name: string;
  shortName: string;
  category: TargetCategory;
  region: string;
  latitude: number; // Degrees North (+), South (-)
  longitude: number; // Degrees East (+), West (-)
  elevationLabel: string;
  elevationMeters: number; // Positive/negative surface elevation or orbital altitude
  missionStatus: string;
  agency: string;
  epochOrSol: string;
  scientificSignificance: string;
  survivalNotes: SurvivalHazardNotes;
  // Satellite orbital parameters (only for category === 'satellite')
  orbit?: {
    altitudeMeters: number;
    inclinationDeg: number;
    raanDeg: number; // Right Ascension of Ascending Node / Longitude of Ascending Node
    initialPhaseDeg: number;
    periodMinutes: number;
    orbitalVelocityKmS: number;
  };
  // Surface traverse waypoints [lon, lat] (only for rovers with traverses)
  traversePath?: Array<[number, number]>;
}

export interface HazardZone {
  id: string;
  name: string;
  hazardType: 'Slope & Landslide' | 'Dust Storm Corridor' | 'Radiation Uplands' | 'Perchlorate & Electrostatic';
  severity: 'High' | 'Severe' | 'Extreme';
  latitude: number;
  longitude: number;
  semiMajorAxisMeters: number;
  semiMinorAxisMeters: number;
  rotationDeg: number;
  summary: string;
}

export interface MapLayerState {
  baseImagery: boolean;
  molaOverlay: boolean;
  slopeHazardMode: boolean;
  roverTraverses: boolean;
  orbitTrails: boolean;
  hazardZones: boolean;
}

export const MARS_CONSTANTS = {
  EQUATORIAL_RADIUS: 3396190.0,
  POLAR_RADIUS: 3376200.0,
  MU_MARS: 4.282837e13, // Gravitational parameter (m^3 / s^2)
  SOL_SECONDS: 88775.244, // Mean solar day on Mars in Earth seconds
  // Perseverance Landing: Feb 18, 2021 20:55 UTC (Sol 0 reference)
  SOL_EPOCH_MS: Date.UTC(2021, 1, 18, 20, 55, 0),
};

export const CATEGORY_COLORS: Record<TargetCategory, string> = {
  rover: '#FF5722',
  satellite: '#06B6D4',
  landmark: '#F59E0B',
};

export const CATEGORY_LABELS: Record<TargetCategory, string> = {
  rover: 'Rover',
  satellite: 'Orbiter',
  landmark: 'Landmark',
};

export const MARS_TARGETS: MarsTarget[] = [
  // ======================== ROVERS ========================
  {
    id: 'perseverance',
    name: 'Perseverance Rover',
    shortName: 'Perseverance',
    category: 'rover',
    region: 'Jezero Crater Delta & Rim',
    latitude: 18.4447,
    longitude: 77.4508,
    elevationLabel: '-2,569 m (Crater Floor)',
    elevationMeters: -2569,
    missionStatus: 'Active Surface Ops',
    agency: 'NASA / JPL',
    epochOrSol: 'Landed Feb 2021',
    scientificSignificance:
      'Exploring an ancient river delta and lacustrine fan in Jezero Crater to seek biosignatures of past microbial life, cache core samples for Mars Sample Return, and validate MOXIE in-situ oxygen production.',
    survivalNotes: {
      slopeSteepness: 'Moderate (8°–19° along Neretva Vallis delta scarps)',
      dustRisk: 'Moderate · Seasonal afternoon dust devils & electrostatic fine silt',
      radiationLevel: 'Elevated (~240 mSv/yr surface GCR, thin CO₂ shielding)',
      thermalRange: '-85 °C night to -12 °C daytime peak',
      astronautAdvisory:
        'High-value landing zone: flat basaltic pads near Octavia E. Butler site, accessible water-bearing clays, and proven O₂ ISRU viability. Watch boulder fields along the western crater rim.',
    },
    // Representative multi-waypoint traverse across Jezero Crater floor -> Séítah -> Three Forks -> Neretva Vallis -> Bright Angel -> Western Rim
    traversePath: [
      [77.4508, 18.4447], // Octavia E. Butler Landing
      [77.439, 18.438],   // Artuby Ridge approach
      [77.422, 18.429],   // South Séítah edge
      [77.405, 18.435],   // Séítah dune traverse
      [77.418, 18.452],   // Return north around Séítah
      [77.392, 18.464],   // Three Forks sample depot
      [77.372, 18.472],   // Hawksbill Gap / Delta front
      [77.351, 18.481],   // Belva Crater rim overlook
      [77.329, 18.488],   // Neretva Vallis channel
      [77.311, 18.497],   // Bright Angel mudstone outcrop
      [77.289, 18.508],   // Jezero Western Rim ascent (Witch Hazel Hill)
    ],
  },
  {
    id: 'curiosity',
    name: 'Curiosity Rover',
    shortName: 'Curiosity',
    category: 'rover',
    region: 'Gale Crater / Aeolis Mons',
    latitude: -4.5895,
    longitude: 137.4417,
    elevationLabel: '-4,501 m (Aeolis Palus)',
    elevationMeters: -4501,
    missionStatus: 'Active Surface Ops',
    agency: 'NASA / JPL',
    epochOrSol: 'Landed Aug 2012',
    scientificSignificance:
      'Ascending Mount Sharp (Aeolis Mons) inside Gale Crater, documenting a transition from ancient habitable freshwater lakes and organic-bearing mudstones to hyper-arid sulfate-rich strata.',
    survivalNotes: {
      slopeSteepness: 'Steep (15°–26° on Mount Sharp sulfate-bearing foothills)',
      dustRisk: 'High · Deep wind-blown Bagnold sand ripples & wheel-wear ventifacts',
      radiationLevel: 'Moderate (~210 mSv/yr; deeper crater floor adds atmospheric column)',
      thermalRange: '-78 °C night to +2 °C peak midday soil',
      astronautAdvisory:
        'Deep elevation increases atmospheric column density for aerocapture, but sharp wind-carved bedrock ridges require reinforced rover tires and route planning around active sand sheets.',
    },
    traversePath: [
      [137.4417, -4.5895], // Bradbury Landing
      [137.434, -4.598],   // Yellowknife Bay
      [137.421, -4.618],   // Pahrump Hills
      [137.406, -4.642],   // Bagnold Dunes flank
      [137.392, -4.668],   // Vera Rubin Ridge
      [137.381, -4.695],   // Glen Torridon clay unit
      [137.372, -4.718],   // Gediz Vallis ridge
    ],
  },
  {
    id: 'zhurong',
    name: 'Zhurong Rover',
    shortName: 'Zhurong',
    category: 'rover',
    region: 'Southern Utopia Planitia',
    latitude: 25.066,
    longitude: 109.925,
    elevationLabel: '-4,099 m (Lowland Plains)',
    elevationMeters: -4099,
    missionStatus: 'Hibernation / Standby',
    agency: 'CNSA (Tianwen-1)',
    epochOrSol: 'Landed May 2021',
    scientificSignificance:
      'Investigated southern Utopia Planitia with ground-penetrating radar, revealing polygonal subsurface structures and hydrated mineral crusts indicative of late Amazonian water/ice activity.',
    survivalNotes: {
      slopeSteepness: 'Low (1°–4° across vast smooth sedimentary lowlands)',
      dustRisk: 'Severe · Heavy seasonal dust deposition degraded solar arrays',
      radiationLevel: 'Moderate (~215 mSv/yr; -4.1 km elevation improves shielding)',
      thermalRange: '-95 °C winter night to -15 °C summer day',
      astronautAdvisory:
        'Flat terrain ideal for heavy cargo landers and long-range pressurized rovers, but solar-dependent habitats face multi-month winter dust accumulation and require active dust mitigation.',
    },
    traversePath: [
      [109.925, 25.066],
      [109.923, 25.059],
      [109.921, 25.052],
      [109.919, 25.048],
    ],
  },

  // ======================== ORBITING SATELLITES ========================
  {
    id: 'mro',
    name: 'Mars Reconnaissance Orbiter (MRO)',
    shortName: 'MRO',
    category: 'satellite',
    region: 'Sun-Synchronous Polar Orbit (300 km)',
    latitude: 0,
    longitude: 0,
    elevationLabel: '300 km Altitude · 93° Inclination',
    elevationMeters: 300000,
    missionStatus: 'Operational Relay & Recon',
    agency: 'NASA / JPL',
    epochOrSol: 'Orbit Insertion Mar 2006',
    scientificSignificance:
      'Carries the 0.3 m/pixel HiRISE telescope, CTX context imager, CRISM spectrometer, and SHARAD subsurface radar—serving as Mars’s primary high-bandwidth orbital relay and landing-site scout.',
    survivalNotes: {
      slopeSteepness: 'N/A · Near-polar 93° retrograde orbit (global coverage)',
      dustRisk: 'Monitors global dust storm opacity (Tau) & atmospheric dust plumes',
      radiationLevel: 'Orbital (~450 mSv/yr unshielded space environment)',
      thermalRange: '-120 °C eclipse to +85 °C sunlit bus',
      astronautAdvisory:
        'Primary UHF/Ka-band data relay lifeline for surface crews. Provides 30 cm resolution hazard scouting for boulder fields, slope stability, and buried water-ice glaciers.',
    },
    orbit: {
      altitudeMeters: 300000,
      inclinationDeg: 93,
      raanDeg: 42,
      initialPhaseDeg: 28,
      periodMinutes: 112.4,
      orbitalVelocityKmS: 3.41,
    },
  },
  {
    id: 'maven',
    name: 'MAVEN Orbiter',
    shortName: 'MAVEN',
    category: 'satellite',
    region: 'Upper Atmosphere / Relay Orbit (450 km)',
    latitude: 0,
    longitude: 0,
    elevationLabel: '450 km Altitude · 75° Inclination',
    elevationMeters: 450000,
    missionStatus: 'Operational Space Weather & Relay',
    agency: 'NASA / GSFC / LASP',
    epochOrSol: 'Orbit Insertion Sep 2014',
    scientificSignificance:
      'Measures solar wind stripping of Mars’s upper atmosphere and ionosphere, revealing how Mars transitioned from a warm, wet planet to a cold desert world while providing UHF comms relay.',
    survivalNotes: {
      slopeSteepness: 'N/A · High-inclination 75° orbit',
      dustRisk: 'Tracks upper-atmospheric hydrogen escape driven by global dust storms',
      radiationLevel: 'Critical Solar Particle Event (SPE) early-warning sentinel',
      thermalRange: 'External solar flux ~590 W/m² (43% of Earth insolation)',
      astronautAdvisory:
        'Essential space-weather sentinel for astronaut EVA safety: detects incoming coronal mass ejections and solar energetic proton storms before they hit surface habitats.',
    },
    orbit: {
      altitudeMeters: 450000,
      inclinationDeg: 75,
      raanDeg: 158,
      initialPhaseDeg: 145,
      periodMinutes: 121.8,
      orbitalVelocityKmS: 3.34,
    },
  },

  // ======================== LANDMARKS & ASTRONAUT TARGETS ========================
  {
    id: 'olympus-mons',
    name: 'Olympus Mons',
    shortName: 'Olympus Mons',
    category: 'landmark',
    region: 'Tharsis Volcanic Province',
    latitude: 18.65,
    longitude: -133.8,
    elevationLabel: '+21,229 m (Datum Peak)',
    elevationMeters: 21229,
    missionStatus: 'Geologic Target / High-Risk Zone',
    agency: 'IGU / NASA Planetary Gazetteer',
    epochOrSol: 'Shield Volcano (~600 km wide)',
    scientificSignificance:
      'The tallest planetary mountain and shield volcano in the Solar System, rising nearly three times higher than Mount Everest above the Martian datum, topped by six nested collapse calderas.',
    survivalNotes: {
      slopeSteepness: 'Extreme at 8 km basal scarp (30°–55° cliffs); gentle 5° upper shield',
      dustRisk: 'Low at summit · Summit pokes above most lower-altitude dust storms',
      radiationLevel: 'Severe · Atmospheric pressure drops to ~0.03 kPa (5% of datum)',
      thermalRange: '-110 °C night to -25 °C day at summit caldera',
      astronautAdvisory:
        'Unviable for aerocapture landings due to ultra-thin air at +21 km elevation. However, lava tubes along the lower flanks offer natural cosmic-radiation shielding for subterranean bases.',
    },
  },
  {
    id: 'valles-marineris',
    name: 'Valles Marineris',
    shortName: 'Valles Marineris',
    category: 'landmark',
    region: 'Coprates / Melas Chasma',
    latitude: -13.9,
    longitude: -59.2,
    elevationLabel: '-7,000 m (Canyon Floor)',
    elevationMeters: -7000,
    missionStatus: 'Primary Habitation Candidate',
    agency: 'IGU / NASA Planetary Gazetteer',
    epochOrSol: '4,000 km Rift System',
    scientificSignificance:
      'A tectonic canyon system spanning over 4,000 km—nearly one-fifth of Mars’s circumference—exposing kilometers of ancient crustal stratigraphy, sulfate deposits, and recurring slope features.',
    survivalNotes: {
      slopeSteepness: 'Severe (35°–65° unstable canyon walls & massive landslide aprons)',
      dustRisk: 'High · Katabatic canyon winds & morning water-ice fog in deep troughs',
      radiationLevel: 'Reduced · High atmospheric pressure (~1.1 kPa) + canyon wall horizon shielding',
      thermalRange: '-68 °C night to +12 °C sunlit canyon floor',
      astronautAdvisory:
        'Highest surface atmospheric pressure on Mars improves aerobraking and reduces EVA suit strain. Land strictly on broad central floor plains away from unstable talus slopes.',
    },
  },
  {
    id: 'hellas-planitia',
    name: 'Hellas Planitia',
    shortName: 'Hellas Planitia',
    category: 'landmark',
    region: 'Southern Highlands Impact Basin',
    latitude: -42.4,
    longitude: 70.5,
    elevationLabel: '-7,152 m (Deepest Basin)',
    elevationMeters: -7152,
    missionStatus: 'Pressurized Basin / Dust Origin',
    agency: 'IGU / NASA Planetary Gazetteer',
    epochOrSol: '2,300 km Impact Basin',
    scientificSignificance:
      'The largest visible impact structure on Mars and lowest surface elevation (-7.15 km below datum), hosting lobate debris aprons that preserve thick buried water-ice glaciers.',
    survivalNotes: {
      slopeSteepness: 'Low on central floor (2°–6°); rugged around outer basin rim',
      dustRisk: 'Extreme · Primary genesis zone for planet-encircling dust storms',
      radiationLevel: 'Lowest surface GCR dose on Mars due to ~1.16 kPa atmospheric column',
      thermalRange: '-82 °C night to +5 °C summer floor',
      astronautAdvisory:
        'Surface pressure exceeds the Armstrong limit for water boiling (~1.16 kPa), aiding liquid-water ISRU and landing deceleration. Must rely on nuclear/fission power during regional dust blackouts.',
    },
  },
];

export const HAZARD_ZONES: HazardZone[] = [
  {
    id: 'hz-valles-cliffs',
    name: 'Melas & Coprates Escarpment Instability',
    hazardType: 'Slope & Landslide',
    severity: 'Extreme',
    latitude: -13.5,
    longitude: -63.0,
    semiMajorAxisMeters: 420000,
    semiMinorAxisMeters: 160000,
    rotationDeg: -14,
    summary: '35°–65° fault scarps with recurrent kilometer-scale rockslides and violent katabatic canyon downdrafts.',
  },
  {
    id: 'hz-hellas-dust',
    name: 'Hellas Dust Storm Genesis Basin',
    hazardType: 'Dust Storm Corridor',
    severity: 'Extreme',
    latitude: -42.4,
    longitude: 70.5,
    semiMajorAxisMeters: 620000,
    semiMinorAxisMeters: 480000,
    rotationDeg: 18,
    summary: 'Seasonal baroclinic dust lifting lifts opacity Tau > 4.0, reducing solar generation by >90% for weeks.',
  },
  {
    id: 'hz-tharsis-rad',
    name: 'Tharsis / Olympus High-Altitude Radiation Zone',
    hazardType: 'Radiation Uplands',
    severity: 'Severe',
    latitude: 14.0,
    longitude: -124.0,
    semiMajorAxisMeters: 780000,
    semiMinorAxisMeters: 540000,
    rotationDeg: 35,
    summary: 'Elevated +10 to +21 km volcanic plateau has <10% nominal atmospheric shielding against GCR & solar proton storms.',
  },
  {
    id: 'hz-utopia-perchlorate',
    name: 'Utopia Fine Regolith & Perchlorate Silt',
    hazardType: 'Perchlorate & Electrostatic',
    severity: 'High',
    latitude: 27.5,
    longitude: 112.0,
    semiMajorAxisMeters: 460000,
    semiMinorAxisMeters: 340000,
    rotationDeg: -10,
    summary: 'Micron-scale electrostatic dust with ~0.5–1% calcium perchlorate compromises airlock seals and solar arrays.',
  },
];

/**
 * Computes a realistic MOLA-inspired Martian terrain height (in meters)
 * for any (lonDeg, latDeg) so that Cesium's CustomHeightmapTerrainProvider
 * renders true 3D topography for Olympus Mons, Valles Marineris, Hellas Basin,
 * Gale Crater, and Jezero Crater.
 */
export function sampleMarsElevationMeters(lonDeg: number, latDeg: number): number {
  const wrapLonDiff = (lonA: number, lonB: number): number => {
    let d = lonA - lonB;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  };

  // Global North-South dichotomy: Northern lowlands (~ -3500 m) vs Southern highlands (~ +1400 m)
  const dichotomy = -1100 - 2450 * Math.tanh((latDeg - 8) / 22);

  // Tharsis Bulge (+4,500 m broad dome)
  const dLonTharsis = wrapLonDiff(lonDeg, -108);
  const dLatTharsis = latDeg - 2;
  const r2Tharsis = (dLonTharsis * dLonTharsis) / 950 + (dLatTharsis * dLatTharsis) / 720;
  const tharsisBulge = 4600 * Math.exp(-r2Tharsis);

  // Olympus Mons (+17,500 m shield + basal scarp + summit caldera)
  const dLonOly = wrapLonDiff(lonDeg, -133.8);
  const dLatOly = latDeg - 18.65;
  const rOly = Math.sqrt(dLonOly * dLonOly + dLatOly * dLatOly);
  let olympus = 0;
  if (rOly < 7.5) {
    const shield = 18500 * Math.exp(-(rOly * rOly) / 14.5);
    const scarpBoost = rOly < 4.5 ? 2400 : 0;
    const caldera = rOly < 0.65 ? -2200 * Math.exp(-(rOly * rOly) / 0.14) : 0;
    olympus = shield + scarpBoost + caldera;
  }

  // Tharsis Montes trio (Ascraeus, Pavonis, Arsia)
  const montes: Array<[number, number, number]> = [
    [-104.1, 11.8, 13800],
    [-112.9, 1.5, 10200],
    [-120.1, -8.3, 13200],
  ];
  let tharsisPeaks = 0;
  for (const [mLon, mLat, mAmp] of montes) {
    const dx = wrapLonDiff(lonDeg, mLon);
    const dy = latDeg - mLat;
    const r2 = dx * dx + dy * dy;
    if (r2 < 25) {
      tharsisPeaks += mAmp * Math.exp(-r2 / 3.8);
    }
  }

  // Valles Marineris Rift Canyon (-7,500 m trench centered around -13.9, -59.2 stretching E-W)
  const dLonVm = wrapLonDiff(lonDeg, -63.0);
  const dLatVm = latDeg - (-13.0 + 0.12 * dLonVm);
  let valles = 0;
  if (Math.abs(dLonVm) < 28 && Math.abs(dLatVm) < 7) {
    const alongFactor = Math.exp(-(dLonVm * dLonVm) / 280);
    const acrossFactor = Math.exp(-(dLatVm * dLatVm) / 3.6);
    valles = -8600 * alongFactor * acrossFactor;
  }

  // Hellas Planitia Impact Basin (-7,152 m basin)
  const dLonHel = wrapLonDiff(lonDeg, 70.5);
  const dLatHel = latDeg - -42.4;
  const r2Hel = (dLonHel * dLonHel) / 320 + (dLatHel * dLatHel) / 170;
  const hellas = -6800 * Math.exp(-r2Hel) + 1200 * Math.exp(-Math.pow(Math.sqrt(r2Hel) - 1.35, 2) / 0.12);

  // Elysium Mons (+12,600 m volcano)
  const dLonEly = wrapLonDiff(lonDeg, 147.2);
  const dLatEly = latDeg - 25.0;
  const r2Ely = dLonEly * dLonEly + dLatEly * dLatEly;
  const elysium = r2Ely < 36 ? 12800 * Math.exp(-r2Ely / 5.2) : 0;

  // Gale Crater + Mount Sharp central peak (-4.59, 137.44)
  const dLonGale = wrapLonDiff(lonDeg, 137.44);
  const dLatGale = latDeg - -4.59;
  const rGale = Math.sqrt(dLonGale * dLonGale + dLatGale * dLatGale);
  let gale = 0;
  if (rGale < 2.2) {
    const bowl = -2900 * Math.exp(-(rGale * rGale) / 1.1);
    const rim = 1100 * Math.exp(-Math.pow(rGale - 1.25, 2) / 0.08);
    const mountSharp = 4100 * Math.exp(-(rGale * rGale) / 0.14);
    gale = bowl + rim + mountSharp;
  }

  // Jezero Crater basin & rim (18.44, 77.45)
  const dLonJez = wrapLonDiff(lonDeg, 77.45);
  const dLatJez = latDeg - 18.44;
  const rJez = Math.sqrt(dLonJez * dLonJez + dLatJez * dLatJez);
  let jez = 0;
  if (rJez < 1.3) {
    const bowl = -1200 * Math.exp(-(rJez * rJez) / 0.22);
    const rim = 700 * Math.exp(-Math.pow(rJez - 0.45, 2) / 0.03);
    jez = bowl + rim;
  }

  // Subtle deterministic harmonic terrain roughness
  const lonRad = (lonDeg * Math.PI) / 180;
  const latRad = (latDeg * Math.PI) / 180;
  const roughness =
    320 * Math.sin(lonRad * 7 + latRad * 5) * Math.cos(latRad * 6) +
    140 * Math.cos(lonRad * 19 - latRad * 14);

  return Math.round(
    dichotomy + tharsisBulge + olympus + tharsisPeaks + valles + hellas + elysium + gale + jez + roughness
  );
}
