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
  surfaceRadiation: string; // MSL RAD calibrated dose summary
  radiationSeverity: 'sheltered' | 'moderate' | 'critical';
  surfaceTempRange: string;
  missionStatus: string;
  agency: string;
  epochOrSol: string;
  scientificSignificance: string;
  searchKeywords?: string;
  photoUrl: string;
  photoCaption: string;
  survivalNotes: SurvivalHazardNotes;
  orbit?: {
    altitudeMeters: number;
    inclinationDeg: number;
    raanDeg: number;
    initialPhaseDeg: number;
    periodMinutes: number;
    orbitalVelocityKmS: number;
  };
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
  MU_MARS: 4.282837e13,
  SOL_SECONDS: 88775.244,
  SOL_EPOCH_MS: Date.UTC(2021, 1, 18, 20, 55, 0),
};

export const CATEGORY_COLORS: Record<TargetCategory, string> = {
  rover: '#FF5722',
  satellite: '#06B6D4',
  landmark: '#F59E0B',
};

export const CATEGORY_LABELS: Record<TargetCategory, string> = {
  rover: 'Rover / Lander',
  satellite: 'Orbiter',
  landmark: 'Landmark',
};

export const MARS_TARGETS: MarsTarget[] = [
  // ======================== ROVERS & SURFACE LANDERS (8) ========================
  {
    id: 'perseverance',
    name: 'Perseverance Rover',
    shortName: 'Perseverance',
    category: 'rover',
    region: 'Jezero Crater Delta & Rim',
    latitude: 18.4447,
    longitude: 77.4508,
    elevationLabel: '-2,570 m (Crater Floor)',
    elevationMeters: -2570,
    surfaceRadiation: '0.68 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-80°C to -15°C',
    missionStatus: 'Active Surface Ops',
    agency: 'NASA / JPL',
    epochOrSol: 'Landed Feb 2021',
    scientificSignificance:
      'Active sample-caching rover exploring an ancient river delta in Jezero Crater to seek biosignatures of past microbial life and validate MOXIE in-situ oxygen production.',
    searchKeywords: 'rover crater delta biosignature sample return moxie nasa jpl',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA24350/PIA24350~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech · Jezero Crater Delta & Perseverance Landing Zone',
    survivalNotes: {
      slopeSteepness: 'Moderate (8°–19° along Neretva Vallis delta scarps)',
      dustRisk: 'Moderate · Seasonal afternoon dust devils & electrostatic fine silt',
      radiationLevel: '0.68 mSv/day surface GCR (~248 mSv/yr)',
      thermalRange: '-85 °C night to -12 °C daytime peak',
      astronautAdvisory:
        'High-value landing zone: flat basaltic pads near Octavia E. Butler site, accessible water-bearing clays, and proven O₂ ISRU viability.',
    },
    traversePath: [
      [77.4508, 18.4447],
      [77.439, 18.438],
      [77.422, 18.429],
      [77.405, 18.435],
      [77.418, 18.452],
      [77.392, 18.464],
      [77.372, 18.472],
      [77.351, 18.481],
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
    elevationLabel: '-4,500 m (Aeolis Palus)',
    elevationMeters: -4500,
    surfaceRadiation: '0.64 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-78°C to +2°C',
    missionStatus: 'Active Surface Ops',
    agency: 'NASA / JPL',
    epochOrSol: 'Landed Aug 2012',
    scientificSignificance:
      'Active nuclear-powered rover ascending Mount Sharp inside Gale Crater, studying ancient habitable lakes, organic mudstones, and surface radiation (MSL RAD).',
    searchKeywords: 'rover crater lakebed nuclear msl rad weather rems nasa jpl',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA16239/PIA16239~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech/MSSS · Curiosity Rover Self-Portrait at Gale Crater',
    survivalNotes: {
      slopeSteepness: 'Steep (15°–26° on Mount Sharp sulfate-bearing foothills)',
      dustRisk: 'High · Deep wind-blown Bagnold sand ripples & wheel-wear ventifacts',
      radiationLevel: '0.64 mSv/day (MSL RAD calibrated baseline)',
      thermalRange: '-78 °C night to +2 °C peak midday soil',
      astronautAdvisory:
        'Deep elevation increases atmospheric column density for aerocapture, though wind-carved bedrock ridges require reinforced rover tires.',
    },
    traversePath: [
      [137.4417, -4.5895],
      [137.434, -4.598],
      [137.421, -4.618],
      [137.406, -4.642],
      [137.392, -4.668],
      [137.381, -4.695],
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
    surfaceRadiation: '0.56 mSv/day · Low-Moderate',
    radiationSeverity: 'sheltered',
    surfaceTempRange: '-95°C to -15°C',
    missionStatus: 'Hibernation / Standby',
    agency: 'CNSA (Tianwen-1)',
    epochOrSol: 'Landed May 2021',
    scientificSignificance:
      'Investigated southern Utopia Planitia with ground-penetrating radar, revealing polygonal subsurface structures and hydrated mineral crusts indicative of water-ice deposits.',
    searchKeywords: 'rover ice radar utopia planitia cnsa tianwen china',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA04029/PIA04029~small.jpg',
    photoCaption: 'NASA/JPL/ASU · Utopia Planitia Sedimentary Lowlands',
    survivalNotes: {
      slopeSteepness: 'Low (1°–4° across vast smooth sedimentary lowlands)',
      dustRisk: 'Severe · Heavy seasonal dust deposition degraded solar arrays',
      radiationLevel: '0.56 mSv/day (-4.1 km lowland atmospheric column shielding)',
      thermalRange: '-95 °C winter night to -15 °C summer day',
      astronautAdvisory:
        'Flat terrain ideal for heavy cargo landers, though solar-dependent habitats face multi-month winter dust accumulation.',
    },
    traversePath: [
      [109.925, 25.066],
      [109.923, 25.059],
      [109.921, 25.052],
      [109.919, 25.048],
    ],
  },
  {
    id: 'opportunity',
    name: 'Opportunity Rover',
    shortName: 'Opportunity',
    category: 'rover',
    region: 'Meridiani Planum / Endeavour Crater',
    latitude: -1.9462,
    longitude: -5.5266,
    elevationLabel: '-1,400 m (Equatorial Plains)',
    elevationMeters: -1400,
    surfaceRadiation: '0.72 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-82°C to +5°C',
    missionStatus: 'Completed (2004–2018)',
    agency: 'NASA / JPL',
    epochOrSol: '45.16 km Traverse Record',
    scientificSignificance:
      'Record-setting 15-year mission (45.16 km driven) across Meridiani Planum to Endeavour Crater, discovering ancient water-formed hematite "blueberries" and clay minerals.',
    searchKeywords: 'rover mer-b hematite crater water endeavour meridiani nasa',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA16559/PIA16559~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech/Cornell · Opportunity View Along Endeavour Crater Rim',
    survivalNotes: {
      slopeSteepness: 'Low on Meridiani plains (2°–5°); steep along Endeavour rim',
      dustRisk: 'Extreme during 2018 global dust storm (Tau > 10)',
      radiationLevel: '0.72 mSv/day equatorial baseline',
      thermalRange: '-82 °C night to +5 °C midday',
      astronautAdvisory:
        'Exceptionally smooth equatorial traverse corridor with abundant gypsum and clay hydration signatures; solar ops require dust-clearing redundancy.',
    },
  },
  {
    id: 'spirit',
    name: 'Spirit Rover',
    shortName: 'Spirit',
    category: 'rover',
    region: 'Gusev Crater / Columbia Hills',
    latitude: -14.5684,
    longitude: 175.4726,
    elevationLabel: '-1,900 m (Crater Basin)',
    elevationMeters: -1900,
    surfaceRadiation: '0.70 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-85°C to +10°C',
    missionStatus: 'Completed (2004–2010)',
    agency: 'NASA / JPL',
    epochOrSol: 'Landed Jan 2004',
    scientificSignificance:
      'Explored Gusev Crater and climbed Husband Hill, uncovering pure silica deposits at Home Plate that proved ancient hydrothermal hot springs existed on Mars.',
    searchKeywords: 'rover mer-a crater hydrothermal silica hot springs gusev nasa',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA03274/PIA03274~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech/Cornell · Spirit Rover Tracks & Columbia Hills Deposits',
    survivalNotes: {
      slopeSteepness: 'Moderate-Steep (12°–28° in Columbia Hills basalt outcrops)',
      dustRisk: 'Moderate-High · Loose sulfate sand traps (Troy sand hazard)',
      radiationLevel: '0.70 mSv/day surface GCR',
      thermalRange: '-85 °C winter night to +10 °C summer day',
      astronautAdvisory:
        'Bright sulfate-rich regolith beneath thin dust crusts can trap wheeled vehicles; route planning must avoid unconsolidated drift pits.',
    },
  },
  {
    id: 'insight',
    name: 'InSight Lander',
    shortName: 'InSight',
    category: 'rover',
    region: 'Elysium Planitia',
    latitude: 4.5024,
    longitude: 135.6234,
    elevationLabel: '-2,655 m (Volcanic Plains)',
    elevationMeters: -2655,
    surfaceRadiation: '0.67 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-95°C to -10°C',
    missionStatus: 'Completed (2018–2022)',
    agency: 'NASA / JPL / CNES / DLR',
    epochOrSol: '1,319 Marsquakes Detected',
    scientificSignificance:
      'Stationary geophysical lander that detected over 1,300 marsquakes with SEIS, revealing Mars’s liquid iron-alloy core radius (~1,830 km) and layered crust.',
    searchKeywords: 'lander marsquake seismometer core elysium geophysics nasa cnes dlr',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA22232/PIA22232~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech · InSight Geophysical Lander & SEIS Seismometer',
    survivalNotes: {
      slopeSteepness: 'Very Low (<2° smooth Elysium Planitia regolith)',
      dustRisk: 'High · Fine dust accumulation covered fan solar arrays over 4 years',
      radiationLevel: '0.67 mSv/day moderate equatorial exposure',
      thermalRange: '-95 °C pre-dawn to -10 °C afternoon',
      astronautAdvisory:
        'Flat, low-rock-abundance landing ellipse suitable for large crewed descent stages; seismic data confirms low structural tremor hazards for habitats.',
    },
  },
  {
    id: 'phoenix',
    name: 'Phoenix Lander',
    shortName: 'Phoenix',
    category: 'rover',
    region: 'Vastitas Borealis / Green Valley',
    latitude: 68.2188,
    longitude: -125.7492,
    elevationLabel: '-4,100 m (Arctic Lowlands)',
    elevationMeters: -4100,
    surfaceRadiation: '0.58 mSv/day · Low-Moderate',
    radiationSeverity: 'sheltered',
    surfaceTempRange: '-125°C to -20°C',
    missionStatus: 'Completed (2008)',
    agency: 'NASA / Univ. of Arizona',
    epochOrSol: 'Arctic Water-Ice Discovery',
    scientificSignificance:
      'Polar lander that trenched Arctic permafrost and directly verified pure water-ice slabs inches beneath the soil, alongside snow falling from Martian clouds.',
    searchKeywords: 'lander polar arctic ice permafrost water isru vastitas borealis nasa',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA11723/PIA11723~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech/UA/Texas A&M · Phoenix Lander on Arctic Polygon Terrain',
    survivalNotes: {
      slopeSteepness: 'Low (1°–3° polygonal permafrost plains)',
      dustRisk: 'Moderate · Severe winter CO₂ dry-ice frost buildup crushed arrays',
      radiationLevel: '0.58 mSv/day (-4.1 km lowland shielding)',
      thermalRange: '-125 °C polar winter to -20 °C summer solstice',
      astronautAdvisory:
        'Abundant near-surface water-ice (~5 cm depth) ideal for ISRU propellant & life support, but perchlorate salts (~0.6%) require water purification.',
    },
  },
  {
    id: 'viking-1',
    name: 'Viking 1 Lander',
    shortName: 'Viking 1',
    category: 'rover',
    region: 'Chryse Planitia',
    latitude: 22.697,
    longitude: -48.222,
    elevationLabel: '-3,600 m (Outflow Plain)',
    elevationMeters: -3600,
    surfaceRadiation: '0.62 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-107°C to -17°C',
    missionStatus: 'Completed (1976–1982)',
    agency: 'NASA / Langley',
    epochOrSol: 'First Successful Mars Landing',
    scientificSignificance:
      'Historic first spacecraft to successfully land and operate long-term on Mars (July 20, 1976), transmitting the first color surface panoramas and multi-year weather logs.',
    searchKeywords: 'lander historic 1976 chryse planitia first landing nasa',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA10738/PIA10738~thumb.jpg',
    photoCaption: 'NASA/JPL · Viking 1 Lander Surface Panorama in Chryse Planitia',
    survivalNotes: {
      slopeSteepness: 'Low-Moderate (3°–8° rocky outflow channel deposits)',
      dustRisk: 'Moderate · Fine reddish iron-oxide dust & scattered meter-scale boulders',
      radiationLevel: '0.62 mSv/day at -3.6 km elevation',
      thermalRange: '-107 °C night to -17 °C daytime peak',
      astronautAdvisory:
        'Preserved historic heritage site; outflow channels downstream of Valles Marineris exhibit scattered basalt boulders requiring hazard-avoidance radar.',
    },
  },

  // ======================== ORBITING SATELLITES (6) ========================
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
    surfaceRadiation: '1.23 mSv/day · Unshielded Orbit',
    radiationSeverity: 'critical',
    surfaceTempRange: '-120°C to +85°C (Bus)',
    missionStatus: 'Operational Relay & Recon',
    agency: 'NASA / JPL',
    epochOrSol: 'Orbit Insertion Mar 2006',
    scientificSignificance:
      'Carries the 0.3 m/pixel HiRISE telescope, CTX context imager, CRISM spectrometer, and SHARAD subsurface radar—serving as Mars’s primary high-bandwidth orbital relay.',
    searchKeywords: 'orbiter satellite hirise ctx sharad relay recon nasa jpl',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA07214/PIA07214~thumb.jpg',
    photoCaption: 'NASA/JPL-Caltech · Mars Reconnaissance Orbiter Spacecraft',
    survivalNotes: {
      slopeSteepness: 'N/A · Near-polar 93° retrograde orbit (global coverage)',
      dustRisk: 'Monitors global dust storm opacity (Tau) & atmospheric plumes',
      radiationLevel: '1.23 mSv/day (no atmospheric shielding in 300 km orbit)',
      thermalRange: '-120 °C eclipse to +85 °C sunlit bus',
      astronautAdvisory:
        'Primary UHF/Ka-band data relay lifeline for surface crews and 30 cm hazard scouting for boulder fields and buried water-ice.',
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
    surfaceRadiation: '1.26 mSv/day · Unshielded Orbit',
    radiationSeverity: 'critical',
    surfaceTempRange: '-115°C to +75°C (Bus)',
    missionStatus: 'Operational Space Weather & Relay',
    agency: 'NASA / GSFC / LASP',
    epochOrSol: 'Orbit Insertion Sep 2014',
    scientificSignificance:
      'Measures solar wind stripping of Mars’s upper atmosphere and ionosphere, revealing how Mars transitioned from a warm, wet planet to a cold desert world.',
    searchKeywords: 'orbiter satellite atmosphere solar wind space weather relay nasa',
    photoUrl: 'https://images-assets.nasa.gov/image/GSFC_20171208_Archive_e000979/GSFC_20171208_Archive_e000979~small.jpg',
    photoCaption: 'NASA/GSFC · MAVEN Upper Atmosphere & Space Weather Orbiter',
    survivalNotes: {
      slopeSteepness: 'N/A · High-inclination 75° orbit',
      dustRisk: 'Tracks upper-atmospheric hydrogen escape driven by global dust storms',
      radiationLevel: '1.26 mSv/day · Solar Particle Event (SPE) early-warning sentinel',
      thermalRange: 'External solar flux ~590 W/m² (43% of Earth insolation)',
      astronautAdvisory:
        'Essential space-weather sentinel for astronaut EVA safety: detects incoming coronal mass ejections and solar energetic proton storms.',
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
  {
    id: 'odyssey',
    name: 'Mars Odyssey Orbiter',
    shortName: 'Odyssey',
    category: 'satellite',
    region: 'Sun-Synchronous Polar Orbit (400 km)',
    latitude: 0,
    longitude: 0,
    elevationLabel: '400 km Altitude · 93.1° Inclination',
    elevationMeters: 400000,
    surfaceRadiation: '1.24 mSv/day · Unshielded Orbit',
    radiationSeverity: 'critical',
    surfaceTempRange: '-118°C to +80°C (Bus)',
    missionStatus: 'Operational (Longest Active Mars Craft)',
    agency: 'NASA / JPL',
    epochOrSol: 'Orbit Insertion Oct 2001',
    scientificSignificance:
      'Longest-operating spacecraft at Mars (since 2001); maps subsurface hydrogen and buried water ice via neutron spectrometers and thermal emission (THEMIS).',
    searchKeywords: 'orbiter satellite themis water ice hydrogen relay 2001 nasa jpl',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA04244/PIA04244~medium.jpg',
    photoCaption: 'NASA/JPL · 2001 Mars Odyssey Thermal & Water-Ice Mapping Orbiter',
    survivalNotes: {
      slopeSteepness: 'N/A · 93.1° sun-synchronous polar orbit',
      dustRisk: 'Maps diurnal thermal inertia to distinguish loose dust from bedrock',
      radiationLevel: '1.24 mSv/day · MARIE experiment profiled Martian orbital radiation',
      thermalRange: '-118 °C eclipse to +80 °C sunlit bus',
      astronautAdvisory:
        'THEMIS thermal inertia maps are critical for identifying rock-free regolith vs. hazardous boulder fields prior to crewed landing.',
    },
    orbit: {
      altitudeMeters: 400000,
      inclinationDeg: 93.1,
      raanDeg: 285,
      initialPhaseDeg: 210,
      periodMinutes: 118.4,
      orbitalVelocityKmS: 3.36,
    },
  },
  {
    id: 'mars-express',
    name: 'Mars Express Orbiter',
    shortName: 'Mars Express',
    category: 'satellite',
    region: 'Polar Mapping Orbit (550 km)',
    latitude: 0,
    longitude: 0,
    elevationLabel: '550 km Altitude · 86.3° Inclination',
    elevationMeters: 550000,
    surfaceRadiation: '1.27 mSv/day · Unshielded Orbit',
    radiationSeverity: 'critical',
    surfaceTempRange: '-115°C to +78°C (Bus)',
    missionStatus: 'Operational Science & Phobos Recon',
    agency: 'ESA (European Space Agency)',
    epochOrSol: 'Orbit Insertion Dec 2003',
    scientificSignificance:
      'Captures high-resolution 3D stereo color topography (HRSC) and probes kilometer-deep polar ice and potential subglacial liquid brines via MARSIS radar.',
    searchKeywords: 'orbiter satellite esa hrsc marsis radar 3d water phobos europe',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA04802/PIA04802~medium.jpg',
    photoCaption: 'ESA / NASA · Mars Express 3D Stereo & Subsurface Radar Orbiter',
    survivalNotes: {
      slopeSteepness: 'N/A · 86.3° near-polar orbit',
      dustRisk: 'Tracks global water-vapor & seasonal CO₂ dust transport',
      radiationLevel: '1.27 mSv/day unshielded orbital radiation',
      thermalRange: '-115 °C eclipse to +78 °C sunlit panels',
      astronautAdvisory:
        'MARSIS subsurface sounding identifies deep ice reservoirs and structural stratigraphy across polar and mid-latitude glaciers.',
    },
    orbit: {
      altitudeMeters: 550000,
      inclinationDeg: 86.3,
      raanDeg: 102,
      initialPhaseDeg: 305,
      periodMinutes: 127.8,
      orbitalVelocityKmS: 3.29,
    },
  },
  {
    id: 'tgo',
    name: 'Trace Gas Orbiter (TGO)',
    shortName: 'TGO',
    category: 'satellite',
    region: 'Aerobraked Science Orbit (400 km)',
    latitude: 0,
    longitude: 0,
    elevationLabel: '400 km Altitude · 74° Inclination',
    elevationMeters: 400000,
    surfaceRadiation: '1.24 mSv/day · Unshielded Orbit',
    radiationSeverity: 'critical',
    surfaceTempRange: '-115°C to +75°C (Bus)',
    missionStatus: 'Operational Trace Gas & Relay',
    agency: 'ESA / Roscosmos',
    epochOrSol: 'Orbit Insertion Oct 2016',
    scientificSignificance:
      'Hunts atmospheric trace gases such as methane with extreme sensitivity, maps near-surface water hydrogen in canyons, and relays >50% of rover telemetry.',
    searchKeywords: 'orbiter satellite exomars tgo methane water relay esa roscosmos',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA21139/PIA21139~medium.jpg',
    photoCaption: 'ESA / NASA · ExoMars Trace Gas Orbiter Communications & Science Craft',
    survivalNotes: {
      slopeSteepness: 'N/A · 74° mid-to-high latitude science orbit',
      dustRisk: 'Profiles vertical dust aerosols during regional & global storms',
      radiationLevel: '1.24 mSv/day (FREND neutron detector monitors cosmic ray flux)',
      thermalRange: '-115 °C eclipse to +75 °C sunlit bus',
      astronautAdvisory:
        'FREND neutron mapping revealed up to ~40% water-ice equivalent in Candor Chaos (Valles Marineris), a prime equatorial water resource.',
    },
    orbit: {
      altitudeMeters: 400000,
      inclinationDeg: 74,
      raanDeg: 222,
      initialPhaseDeg: 78,
      periodMinutes: 118.4,
      orbitalVelocityKmS: 3.36,
    },
  },
  {
    id: 'hope',
    name: 'Hope / Al-Amal Orbiter',
    shortName: 'Hope',
    category: 'satellite',
    region: 'Equatorial Weather Orbit (1,200 km)',
    latitude: 0,
    longitude: 0,
    elevationLabel: '1,200 km Preview · 25° Inclination',
    elevationMeters: 1200000,
    surfaceRadiation: '1.30 mSv/day · High Orbit',
    radiationSeverity: 'critical',
    surfaceTempRange: '-110°C to +82°C (Bus)',
    missionStatus: 'Operational Global Weather Monitor',
    agency: 'UAESA / MBRSC',
    epochOrSol: 'Orbit Insertion Feb 2021',
    scientificSignificance:
      'First Arab interplanetary mission; continuously tracks full-planet diurnal weather cycles, dust storms, water-ice clouds, and aurora across all longitudes.',
    searchKeywords: 'orbiter satellite uaesa hope al-amal uae arab weather clouds aurora',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA07241/PIA07241~medium.jpg',
    photoCaption: 'UAESA / NASA · Global Martian Atmosphere & Diurnal Weather Monitoring',
    survivalNotes: {
      slopeSteepness: 'N/A · 25° low-inclination equatorial synoptic orbit',
      dustRisk: 'Provides real-time hemispheric dust storm & cloud forecasting',
      radiationLevel: '1.30 mSv/day high-altitude orbital environment',
      thermalRange: '-110 °C eclipse to +82 °C solar face',
      astronautAdvisory:
        'Essential synoptic weather satellite providing multi-day forecasts of diurnal temperature swings, water-ice clouds, and dust front propagation.',
    },
    orbit: {
      altitudeMeters: 1200000,
      inclinationDeg: 25,
      raanDeg: 18,
      initialPhaseDeg: 255,
      periodMinutes: 171.2,
      orbitalVelocityKmS: 2.94,
    },
  },

  // ======================== FAMOUS LANDMARKS & SURVIVAL SITES (8) ========================
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
    surfaceRadiation: '1.18 mSv/day · Critical Exposure',
    radiationSeverity: 'critical',
    surfaceTempRange: '-110°C to -25°C',
    missionStatus: 'Geologic Target / High-Risk Zone',
    agency: 'IGU / NASA Planetary Gazetteer',
    epochOrSol: 'Shield Volcano (~600 km wide)',
    scientificSignificance:
      'The tallest planetary mountain and shield volcano in the Solar System, rising nearly three times higher than Mount Everest above the Martian datum.',
    searchKeywords: 'landmark volcano mountain shield caldera tharsis tallest peak',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA17969/PIA17969~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech/ASU · Olympus Mons Summit Caldera Complex',
    survivalNotes: {
      slopeSteepness: 'Extreme at 8 km basal scarp (30°–55° cliffs); gentle 5° upper shield',
      dustRisk: 'Low at summit · Summit pokes above most lower-altitude dust storms',
      radiationLevel: '1.18 mSv/day (0.03 kPa air offers <5% nominal shielding)',
      thermalRange: '-110 °C night to -25 °C day at summit caldera',
      astronautAdvisory:
        'Unviable for aerocapture landings due to ultra-thin air at +21 km elevation; lava tubes along lower flanks offer natural cosmic-ray shelter.',
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
    surfaceRadiation: '0.38 mSv/day · Low / Sheltered',
    radiationSeverity: 'sheltered',
    surfaceTempRange: '-65°C to +15°C',
    missionStatus: 'Primary Habitation Candidate',
    agency: 'IGU / NASA Planetary Gazetteer',
    epochOrSol: '4,000 km Rift System',
    scientificSignificance:
      'A 4,000 km tectonic canyon system—nearly one-fifth of Mars’s circumference—exposing kilometers of ancient crustal stratigraphy and thick atmospheric radiation shielding.',
    searchKeywords: 'landmark canyon rift valley chasma habitation water sheltered',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA00422/PIA00422~medium.jpg',
    photoCaption: 'NASA/JPL · Valles Marineris Grand Canyon Hemisphere Mosaic',
    survivalNotes: {
      slopeSteepness: 'Severe (35°–65° unstable canyon walls & massive landslide aprons)',
      dustRisk: 'High · Katabatic canyon winds & morning water-ice fog in deep troughs',
      radiationLevel: '0.38 mSv/day (~1.1 kPa air + canyon wall horizon shielding)',
      thermalRange: '-68 °C night to +12 °C sunlit canyon floor',
      astronautAdvisory:
        'High surface atmospheric pressure improves aerobraking and lowers radiation dose; land strictly on broad central floor plains.',
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
    elevationLabel: '-8,200 m (Deepest Basin)',
    elevationMeters: -8200,
    surfaceRadiation: '0.35 mSv/day · Minimal / Sheltered',
    radiationSeverity: 'sheltered',
    surfaceTempRange: '-82°C to +5°C',
    missionStatus: 'Pressurized Basin / Dust Origin',
    agency: 'IGU / NASA Planetary Gazetteer',
    epochOrSol: '2,300 km Impact Basin',
    scientificSignificance:
      'The deepest impact basin on Mars (-8.2 km), producing the highest surface air pressure (~11.5 mbar) and hosting buried lobate water-ice glaciers.',
    searchKeywords: 'landmark basin impact deepest pressure ice glacier dust storm',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA13097/PIA13097~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech/Univ. of Arizona · Hellas Planitia Basin Terrain',
    survivalNotes: {
      slopeSteepness: 'Low on central floor (2°–6°); rugged around outer basin rim',
      dustRisk: 'Extreme · Primary genesis zone for planet-encircling dust storms',
      radiationLevel: '0.35 mSv/day (lowest surface GCR dose on Mars at ~11.5 mbar)',
      thermalRange: '-82 °C night to +5 °C summer floor',
      astronautAdvisory:
        'Surface pressure exceeds the Armstrong limit for water boiling (~11.5 mbar), offering top radiation shielding; rely on nuclear power during dust storms.',
    },
  },
  {
    id: 'arcadia-planitia',
    name: 'Arcadia Planitia',
    shortName: 'Arcadia Planitia',
    category: 'landmark',
    region: 'Northern Lowland Ice Sheets',
    latitude: 46.7,
    longitude: -168.0,
    elevationLabel: '-3,800 m (Flat Ice Plain)',
    elevationMeters: -3800,
    surfaceRadiation: '0.57 mSv/day · Low-Moderate',
    radiationSeverity: 'sheltered',
    surfaceTempRange: '-105°C to -12°C',
    missionStatus: 'Top Human Landing Candidate',
    agency: 'NASA / SpaceX Landing Study',
    epochOrSol: 'Shallow Subsurface Water-Ice',
    scientificSignificance:
      'Smooth northern volcanic plain containing vast sheets of shallow pure water ice (<1 m deep), making it a premier SpaceX/NASA human landing & ISRU propellant site.',
    searchKeywords: 'landmark ice water isru spacex nasa human landing base plain',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA26321/PIA26321~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech/UA · Subsurface Water-Ice Exposures in Mid-Latitude Plains',
    survivalNotes: {
      slopeSteepness: 'Very Low (<2° ultra-flat landing terrain ideal for Starships/cargo)',
      dustRisk: 'Moderate · Seasonal winter haze and moderate frost cycles',
      radiationLevel: '0.57 mSv/day (-3.8 km atmospheric column shielding)',
      thermalRange: '-105 °C winter night to -12 °C summer afternoon',
      astronautAdvisory:
        'Unmatched combination of flat landing terrain, low elevation for supersonic retropropulsion, and shallow minable water ice for Sabatier fuel synthesis.',
    },
  },
  {
    id: 'gale-crater',
    name: 'Gale Crater / Mount Sharp',
    shortName: 'Gale Crater',
    category: 'landmark',
    region: 'Aeolis Quadrangle',
    latitude: -5.4,
    longitude: 137.8,
    elevationLabel: '-4,500 m Floor / +1,000 m Peak',
    elevationMeters: -4500,
    surfaceRadiation: '0.64 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-78°C to +2°C',
    missionStatus: 'Active Exploration Zone',
    agency: 'IGU / NASA Planetary Gazetteer',
    epochOrSol: '154 km Ancient Lakebed',
    scientificSignificance:
      '154 km wide impact crater centered by the 5.5 km tall Mount Sharp (Aeolis Mons), preserving billions of years of layered clay and sulfate sedimentary history.',
    searchKeywords: 'landmark crater lakebed mount sharp aeolis mons sedimentary',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA15292/PIA15292~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech/ESA/DLR · Mount Sharp Layered Peak Inside Gale Crater',
    survivalNotes: {
      slopeSteepness: 'Low on northern plain; steep 18°–30° on central peak strata',
      dustRisk: 'High · Active Bagnold dune field migrating around Mount Sharp flanks',
      radiationLevel: '0.64 mSv/day calibrated directly by Curiosity MSL RAD',
      thermalRange: '-78 °C night to +2 °C sunlit valley floor',
      astronautAdvisory:
        'Well-characterized landing zone with abundant hydrated clay minerals, though active dark dune fields must be avoided during surface traverses.',
    },
  },
  {
    id: 'cydonia-region',
    name: 'Cydonia Region (Face on Mars)',
    shortName: 'Cydonia',
    category: 'landmark',
    region: 'Acidalia-Arabia Dichotomy Boundary',
    latitude: 40.75,
    longitude: -9.46,
    elevationLabel: '-2,100 m (Dichotomy Mesas)',
    elevationMeters: -2100,
    surfaceRadiation: '0.65 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-95°C to -8°C',
    missionStatus: 'Geologic Survey Landmark',
    agency: 'IGU / NASA Planetary Gazetteer',
    epochOrSol: 'Eroded Mesa & Yardang Field',
    scientificSignificance:
      'Famous eroded mesas and fractured plains straddling the Martian crustal dichotomy boundary, formed by ancient coastal erosion, tectonic faulting, and wind abrasion.',
    searchKeywords: 'landmark cydonia face on mars mesa viking dichotomy erosion',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA02381/PIA02381~small.jpg',
    photoCaption: 'NASA/JPL/MSSS · Cydonia Mensae Eroded Mesa Complex',
    survivalNotes: {
      slopeSteepness: 'Mixed (flat lowland corridors beside 25°–40° mesa talus cliffs)',
      dustRisk: 'Moderate-High · Strong boundary-layer winds along dichotomy scarp',
      radiationLevel: '0.65 mSv/day at -2.1 km datum elevation',
      thermalRange: '-95 °C night to -8 °C afternoon',
      astronautAdvisory:
        'Geologically rich boundary between ancient southern highlands and northern ocean basin; navigate around steep mesa talus aprons.',
    },
  },
  {
    id: 'north-polar-cap',
    name: 'North Polar Ice Cap (Planum Boreum)',
    shortName: 'North Polar Cap',
    category: 'landmark',
    region: 'Planum Boreum (85° N)',
    latitude: 85.0,
    longitude: 0.0,
    elevationLabel: '-2,000 m (Ice Dome Base)',
    elevationMeters: -2000,
    surfaceRadiation: '0.66 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-140°C to -25°C',
    missionStatus: 'ISRU Water Reserve Landmark',
    agency: 'IGU / NASA Planetary Gazetteer',
    epochOrSol: '1,100 km Permanent Ice Cap',
    scientificSignificance:
      'Permanent 3 km thick water-ice cap layered with seasonal CO₂ dry ice and spiral troughs (Chasma Boreale), holding ~1.6 million km³ of water for future ISRU mining.',
    searchKeywords: 'landmark polar ice cap water co2 dry ice planum boreum isru',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA10651/PIA10651~small.jpg',
    photoCaption: 'NASA/JPL-Caltech/ASI/Univ. of Rome · Planum Boreum Layered Polar Ice Cap',
    survivalNotes: {
      slopeSteepness: 'Gentle dome (1°–3°), steep spiral trough walls (15°–25°)',
      dustRisk: 'High katabatic polar winds spiraling outward across Chasma Boreale',
      radiationLevel: '0.66 mSv/day + sub-ice radiation shielding inside ice caverns',
      thermalRange: '-140 °C polar night (CO₂ freezes out) to -25 °C summer peak',
      astronautAdvisory:
        'Extreme cold and months of polar night require nuclear RTG/fission power; virtually limitless water ice enables large-scale propellant production.',
    },
  },
  {
    id: 'tharsis-montes',
    name: 'Tharsis Montes',
    shortName: 'Tharsis Montes',
    category: 'landmark',
    region: 'Ascraeus, Pavonis & Arsia Mons',
    latitude: 1.5,
    longitude: -112.5,
    elevationLabel: '+14,900 m (Volcanic Ridge)',
    elevationMeters: 14900,
    surfaceRadiation: '1.12 mSv/day · Critical Exposure',
    radiationSeverity: 'critical',
    surfaceTempRange: '-105°C to -18°C',
    missionStatus: 'Geologic & Lava Tube Target',
    agency: 'IGU / NASA Planetary Gazetteer',
    epochOrSol: '2,100 km Volcanic Chain',
    scientificSignificance:
      'Trio of colossal aligned shield volcanoes (Ascraeus, Pavonis, and Arsia Mons) straddling the Martian equator with vast skylight lava caves on their flanks.',
    searchKeywords: 'landmark volcano volcanoes tharsis montes pavonis ascraeus arsia lava tube',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA00408/PIA00408~medium.jpg',
    photoCaption: 'NASA/JPL · Tharsis Montes Equatorial Shield Volcano Chain',
    survivalNotes: {
      slopeSteepness: 'Moderate shield flanks (5°–12°); sheer caldera collapse pits',
      dustRisk: 'Low-Moderate above +10 km plateau, high orographic water-ice clouds',
      radiationLevel: '1.12 mSv/day (high-altitude plateau has thin atmospheric shielding)',
      thermalRange: '-105 °C night to -18 °C sunlit flank',
      astronautAdvisory:
        'Unsuitable for unassisted aerocapture landings due to extreme altitude, yet deep lava tube skylights on Pavonis & Arsia offer natural radiation bunkers.',
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
 * for any (lonDeg, latDeg), including Olympus Mons, Tharsis, Valles Marineris,
 * Hellas Planitia, Argyre Planitia, Northern Lowlands, Gale Crater, Jezero Crater,
 * Arcadia Planitia, Meridiani Planum, Gusev Crater, and Planum Boreum.
 */
export function sampleMarsElevationMeters(lonDeg: number, latDeg: number): number {
  const wrapLonDiff = (lonA: number, lonB: number): number => {
    let d = lonA - lonB;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  };

  // Global North-South dichotomy: Northern lowlands (~ -3500 m) vs Southern highlands (~ +1600 m)
  const dichotomy = -1050 - 2550 * Math.tanh((latDeg - 6) / 20);

  // Tharsis Bulge (+4,600 m broad dome)
  const dLonTharsis = wrapLonDiff(lonDeg, -108);
  const dLatTharsis = latDeg - 2;
  const r2Tharsis = (dLonTharsis * dLonTharsis) / 950 + (dLatTharsis * dLatTharsis) / 720;
  const tharsisBulge = 4600 * Math.exp(-r2Tharsis);

  // Olympus Mons (+21,229 m datum peak at 18.65N, 133.8W)
  const dLonOly = wrapLonDiff(lonDeg, -133.8);
  const dLatOly = latDeg - 18.65;
  const rOly = Math.sqrt(dLonOly * dLonOly + dLatOly * dLatOly);
  let olympus = 0;
  if (rOly < 7.5) {
    const shield = 20100 * Math.exp(-(rOly * rOly) / 14.5);
    const scarpBoost = rOly < 4.5 ? 2400 : 0;
    const caldera = rOly < 0.65 ? -400 * Math.exp(-(rOly * rOly) / 0.14) : 0;
    olympus = shield + scarpBoost + caldera;
  }

  // Tharsis Montes trio (Ascraeus, Pavonis, Arsia)
  const montes: Array<[number, number, number]> = [
    [-104.1, 11.8, 12800],
    [-112.9, 1.5, 11800],
    [-120.1, -8.3, 12400],
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

  // Valles Marineris Rift Canyon (~ -7,000 m floor at -13.9S, -59.2W)
  const dLonVm = wrapLonDiff(lonDeg, -63.0);
  const dLatVm = latDeg - (-13.0 + 0.12 * dLonVm);
  let valles = 0;
  if (Math.abs(dLonVm) < 28 && Math.abs(dLatVm) < 7) {
    const alongFactor = Math.exp(-(dLonVm * dLonVm) / 280);
    const acrossFactor = Math.exp(-(dLatVm * dLatVm) / 3.6);
    valles = -11800 * alongFactor * acrossFactor;
  }

  // Hellas Planitia Impact Basin (~ -8,200 m deepest basin at 42.4S, 70.5E)
  const dLonHel = wrapLonDiff(lonDeg, 70.5);
  const dLatHel = latDeg - -42.4;
  const r2Hel = (dLonHel * dLonHel) / 320 + (dLatHel * dLatHel) / 170;
  const hellas = -9750 * Math.exp(-r2Hel) + 1200 * Math.exp(-Math.pow(Math.sqrt(r2Hel) - 1.35, 2) / 0.12);

  // Argyre Planitia Impact Basin (-5,200 m basin at 50S, 43W)
  const dLonArg = wrapLonDiff(lonDeg, -43.0);
  const dLatArg = latDeg - -50.0;
  const r2Arg = (dLonArg * dLonArg) / 170 + (dLatArg * dLatArg) / 95;
  const argyre = -5600 * Math.exp(-r2Arg) + 900 * Math.exp(-Math.pow(Math.sqrt(r2Arg) - 1.35, 2) / 0.12);

  // Elysium Mons (+12,600 m volcano)
  const dLonEly = wrapLonDiff(lonDeg, 147.2);
  const dLatEly = latDeg - 25.0;
  const r2Ely = dLonEly * dLonEly + dLatEly * dLatEly;
  const elysium = r2Ely < 36 ? 12800 * Math.exp(-r2Ely / 5.2) : 0;

  // Gale Crater (-4,500 m Aeolis Palus floor at -4.59, 137.44; Mount Sharp peak at -5.08, 137.85)
  const dLonGale = wrapLonDiff(lonDeg, 137.44);
  const dLatGale = latDeg - -4.59;
  const rGale = Math.sqrt(dLonGale * dLonGale + dLatGale * dLatGale);
  let gale = 0;
  if (rGale < 2.2) {
    const bowl = -4850 * Math.exp(-(rGale * rGale) / 1.1);
    const rim = 1100 * Math.exp(-Math.pow(rGale - 1.25, 2) / 0.08);
    const dLonSharp = wrapLonDiff(lonDeg, 137.85);
    const dLatSharp = latDeg - -5.08;
    const r2Sharp = dLonSharp * dLonSharp + dLatSharp * dLatSharp;
    const mountSharp = 4500 * Math.exp(-r2Sharp / 0.12);
    gale = bowl + rim + mountSharp;
  }

  // Jezero Crater (-2,570 m crater floor at 18.44, 77.45)
  const dLonJez = wrapLonDiff(lonDeg, 77.45);
  const dLatJez = latDeg - 18.44;
  const rJez = Math.sqrt(dLonJez * dLonJez + dLatJez * dLatJez);
  let jez = 0;
  if (rJez < 1.3) {
    const bowl = -500 * Math.exp(-(rJez * rJez) / 0.22);
    const rim = 700 * Math.exp(-Math.pow(rJez - 0.45, 2) / 0.03);
    jez = bowl + rim;
  }

  // Meridiani Planum (-1,400 m) & Gusev Crater (-1,900 m)
  const dLonMer = wrapLonDiff(lonDeg, -5.53);
  const dLatMer = latDeg - -1.95;
  const meridiani = -1600 * Math.exp(-(dLonMer * dLonMer + dLatMer * dLatMer) / 45);

  const dLonGus = wrapLonDiff(lonDeg, 175.47);
  const dLatGus = latDeg - -14.57;
  const gusev = -2700 * Math.exp(-(dLonGus * dLonGus + dLatGus * dLatGus) / 6);

  // Planum Boreum Polar Ice Dome (~1,600 m ice dome rising above -3,600 m northern basin -> ~ -2,000 m)
  const polarDome = latDeg > 78 ? 1600 * Math.exp(-Math.pow((90 - latDeg) / 7.5, 2)) : 0;

  // Subtle deterministic harmonic terrain roughness
  const lonRad = (lonDeg * Math.PI) / 180;
  const latRad = (latDeg * Math.PI) / 180;
  const roughness =
    320 * Math.sin(lonRad * 7 + latRad * 5) * Math.cos(latRad * 6) +
    140 * Math.cos(lonRad * 19 - latRad * 14);

  return Math.round(
    dichotomy +
      tharsisBulge +
      olympus +
      tharsisPeaks +
      valles +
      hellas +
      argyre +
      elysium +
      gale +
      jez +
      meridiani +
      gusev +
      polarDome +
      roughness
  );
}
