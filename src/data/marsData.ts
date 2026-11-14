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
  // ======================== ROVERS & SURFACE LANDERS (13) ========================
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
  {
    id: 'viking-2',
    name: 'Viking 2 Lander',
    shortName: 'Viking 2',
    category: 'rover',
    region: 'Northern Utopia Planitia',
    latitude: 47.967,
    longitude: 134.263,
    elevationLabel: '-4,500 m (Frost Plains)',
    elevationMeters: -4500,
    surfaceRadiation: '0.55 mSv/day · Low-Moderate',
    radiationSeverity: 'sheltered',
    surfaceTempRange: '-120°C to -20°C',
    missionStatus: 'Completed (1976–1980)',
    agency: 'NASA / Langley',
    epochOrSol: 'Landed Sep 1976',
    scientificSignificance:
      'Nuclear-powered sister lander to Viking 1 in northern Utopia Planitia that photographed thin seasonal water-frost coatings across vesicular basalt boulders.',
    searchKeywords: 'lander viking 2 utopia planitia frost basalt nuclear rtg nasa',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA04029/PIA04029~small.jpg',
    photoCaption: 'NASA/JPL · Viking 2 Utopia Planitia Boulder & Frost Terrain',
    survivalNotes: {
      slopeSteepness: 'Low (1°–4° boulder-strewn northern plain)',
      dustRisk: 'Moderate · Seasonal winter water-frost & fine iron-rich silt',
      radiationLevel: '0.55 mSv/day (-4.5 km lowland atmospheric shielding)',
      thermalRange: '-120 °C winter night to -20 °C summer day',
      astronautAdvisory:
        'Deep atmospheric column lowers cosmic ray dose, though dense ejecta boulders require precision terrain-relative navigation for landers.',
    },
  },
  {
    id: 'pathfinder',
    name: 'Mars Pathfinder & Sojourner',
    shortName: 'Pathfinder',
    category: 'rover',
    region: 'Ares Vallis Outflow Plain',
    latitude: 19.13,
    longitude: -33.22,
    elevationLabel: '-3,680 m (Flood Channel)',
    elevationMeters: -3680,
    surfaceRadiation: '0.61 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-82°C to -10°C',
    missionStatus: 'Completed (1997)',
    agency: 'NASA / JPL',
    epochOrSol: 'First Wheeled Mars Rover',
    scientificSignificance:
      'Pioneered airbag-cushioned Mars landing and deployed Sojourner—the first wheeled rover on another planet—analyzing flood-deposited conglomerates in Ares Vallis.',
    searchKeywords: 'rover lander pathfinder sojourner ares vallis 1997 flood rocks nasa',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA00626/PIA00626~thumb.jpg',
    photoCaption: 'NASA/JPL · Mars Pathfinder Lander & Sojourner Rover in Ares Vallis',
    survivalNotes: {
      slopeSteepness: 'Low-Moderate (3°–7° ancient catastrophic flood plain)',
      dustRisk: 'Moderate · Magnetic dust trap tests revealed strongly magnetic airborne silt',
      radiationLevel: '0.61 mSv/day at -3.68 km elevation',
      thermalRange: '-82 °C pre-dawn to -10 °C midday',
      astronautAdvisory:
        'Diverse rock types washed down from the southern highlands offer a natural geological sample cache within a compact traverse radius.',
    },
  },
  {
    id: 'beagle-2',
    name: 'Beagle 2 Lander',
    shortName: 'Beagle 2',
    category: 'rover',
    region: 'Isidis Planitia',
    latitude: 11.5265,
    longitude: 90.4295,
    elevationLabel: '-3,650 m (Impact Basin)',
    elevationMeters: -3650,
    surfaceRadiation: '0.61 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-88°C to -12°C',
    missionStatus: 'Located Intact by MRO (2015)',
    agency: 'ESA / UK Space Agency',
    epochOrSol: 'Landed Dec 2003',
    scientificSignificance:
      'British astrobiology lander carried by Mars Express; imaged intact on Isidis Planitia by MRO HiRISE in 2015 with three of four solar petals deployed.',
    searchKeywords: 'lander probe beagle 2 esa uk isidis planitia mars express hirise',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA19106/PIA19106~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech/Univ. of Arizona · HiRISE Discovery of Beagle 2 in Isidis Planitia',
    survivalNotes: {
      slopeSteepness: 'Very Low (<2° smooth Isidis Planitia basin floor)',
      dustRisk: 'Moderate · Fine basin dust & mild equatorial winds',
      radiationLevel: '0.61 mSv/day at -3.65 km elevation',
      thermalRange: '-88 °C night to -12 °C daytime',
      astronautAdvisory:
        'Smooth equatorial basin floor provides low landing hazard and reasonable aerobraking density; heritage hardware site.',
    },
  },
  {
    id: 'mars-3',
    name: 'Mars 3 Lander',
    shortName: 'Mars 3',
    category: 'rover',
    region: 'Ptolemaeus Crater',
    latitude: -45.0,
    longitude: -158.0,
    elevationLabel: '-1,800 m (Crater Basin)',
    elevationMeters: -1800,
    surfaceRadiation: '0.70 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-105°C to -15°C',
    missionStatus: 'First Soft Landing (1971)',
    agency: 'USSR / Lavochkin',
    epochOrSol: 'Landed Dec 1971',
    scientificSignificance:
      'First spacecraft in history to achieve a soft landing on Mars (December 2, 1971), transmitting for 20 seconds during an intense planet-encircling dust storm.',
    searchKeywords: 'lander probe mars 3 ussr soviet 1971 ptolemaeus crater historic first',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA02318/PIA02318~small.jpg',
    photoCaption: 'NASA/JPL-Caltech/MSSS · Ptolemaeus Crater & Mars 3 Search Region',
    survivalNotes: {
      slopeSteepness: 'Low-Moderate (3°–9° eroded crater floor)',
      dustRisk: 'Severe · Landed during peak 1971 global dust storm',
      radiationLevel: '0.70 mSv/day southern mid-latitude exposure',
      thermalRange: '-105 °C night to -15 °C afternoon',
      astronautAdvisory:
        'Mid-latitude southern craters experience strong seasonal dust storms; high-wind survivability and dust-tolerant communications are critical.',
    },
  },
  {
    id: 'schiaparelli',
    name: 'Schiaparelli EDM',
    shortName: 'Schiaparelli',
    category: 'rover',
    region: 'Meridiani Planum',
    latitude: -2.05,
    longitude: -6.21,
    elevationLabel: '-1,450 m (Equatorial Plain)',
    elevationMeters: -1450,
    surfaceRadiation: '0.72 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-82°C to +4°C',
    missionStatus: 'EDL Test Impact Site (2016)',
    agency: 'ESA / Roscosmos',
    epochOrSol: 'ExoMars 2016 EDM',
    scientificSignificance:
      'ExoMars Entry, Descent and Landing Demonstrator Module designed to test European supersonic parachutes, Doppler radar, and liquid retro-propulsion on Meridiani Planum.',
    searchKeywords: 'lander probe schiaparelli edm esa exomars meridiani planum',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA17630/PIA17630~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech/Univ. of Arizona · Meridiani Planum & Schiaparelli EDL Zone',
    survivalNotes: {
      slopeSteepness: 'Low (<3° flat Meridiani Planum plain)',
      dustRisk: 'Moderate-High · Equatorial dust storm season peaks Oct–Dec',
      radiationLevel: '0.72 mSv/day equatorial baseline',
      thermalRange: '-82 °C night to +4 °C midday',
      astronautAdvisory:
        'Flat equatorial landing ellipse adjacent to Opportunity traverse corridor; validates high-altitude retropropulsion tolerances.',
    },
  },

  // ======================== ORBITING SATELLITES (10) ========================
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
    name: 'Mars Odyssey Orbiter (Ice & Thermal DB)',
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
      'Longest-operating spacecraft at Mars (since 2001); powers the 2001 Mars Odyssey Thermal (THEMIS) & Neutron Spectrometer Subsurface Water-Ice Database.',
    searchKeywords: 'orbiter satellite themis hend neutron subsurface water ice database hydrogen relay 2001 nasa jpl',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA04244/PIA04244~medium.jpg',
    photoCaption: 'NASA/JPL · 2001 Mars Odyssey Thermal & Neutron Subsurface Ice Mapping Orbiter',
    survivalNotes: {
      slopeSteepness: 'N/A · 93.1° sun-synchronous polar orbit',
      dustRisk: 'Maps diurnal thermal inertia to distinguish loose dust from bedrock',
      radiationLevel: '1.24 mSv/day · MARIE experiment profiled Martian orbital radiation',
      thermalRange: '-118 °C eclipse to +80 °C sunlit bus',
      astronautAdvisory:
        'THEMIS thermal inertia & GRS/HEND hydrogen maps locate shallow buried water-ice reservoirs and rock-free landing zones.',
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
    searchKeywords: 'orbiter satellite esa psa hrsc marsis radar 3d water phobos europe',
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
    searchKeywords: 'orbiter satellite exomars tgo methane water relay esa psa roscosmos',
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
  {
    id: 'mgs',
    name: 'Mars Global Surveyor (MGS)',
    shortName: 'MGS',
    category: 'satellite',
    region: 'Mapping Polar Orbit (378 km)',
    latitude: 0,
    longitude: 0,
    elevationLabel: '378 km Altitude · 92.9° Inclination',
    elevationMeters: 378000,
    surfaceRadiation: '1.24 mSv/day · Unshielded Orbit',
    radiationSeverity: 'critical',
    surfaceTempRange: '-118°C to +80°C (Bus)',
    missionStatus: 'Archive Reference (1997–2006)',
    agency: 'NASA / JPL / GSFC',
    epochOrSol: 'MOLA & Magnetic Field Mapper',
    scientificSignificance:
      'Mapped Mars’s global topography with the MOLA laser altimeter (463 m/px DEM) and discovered remnant crustal magnetic anomalies across the southern highlands.',
    searchKeywords: 'orbiter satellite mgs mola topography magnetic field crustal anomaly nasa gsfc',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA07944/PIA07944~thumb.jpg',
    photoCaption: 'NASA/JPL · Mars Global Surveyor MOLA & Crustal Magnetic Mapper',
    survivalNotes: {
      slopeSteepness: 'N/A · 92.9° sun-synchronous 2:00 PM mapping orbit',
      dustRisk: 'Captured global MOC storm onset & dust devil tracks',
      radiationLevel: '1.24 mSv/day unshielded mapping orbit',
      thermalRange: '-118 °C eclipse to +80 °C sunlit solar arrays',
      astronautAdvisory:
        'Produced the foundational MOLA elevation datum and identified localized crustal mini-magnetospheres that partially deflect solar wind.',
    },
    orbit: {
      altitudeMeters: 378000,
      inclinationDeg: 92.9,
      raanDeg: 132,
      initialPhaseDeg: 192,
      periodMinutes: 117.1,
      orbitalVelocityKmS: 3.37,
    },
  },
  {
    id: 'viking-1-orbiter',
    name: 'Viking 1 Orbiter',
    shortName: 'Viking Orbiter',
    category: 'satellite',
    region: 'Inclined Reconnaissance Orbit (500 km)',
    latitude: 0,
    longitude: 0,
    elevationLabel: '500 km Preview · 39.3° Inclination',
    elevationMeters: 500000,
    surfaceRadiation: '1.26 mSv/day · Unshielded Orbit',
    radiationSeverity: 'critical',
    surfaceTempRange: '-115°C to +75°C (Bus)',
    missionStatus: 'Completed Recon (1976–1980)',
    agency: 'NASA / JPL',
    epochOrSol: 'Viking MDIM Mosaic Survey',
    scientificSignificance:
      'Captured the iconic Viking MDIM global color mosaic used across planetary cartography, scouted Chryse Planitia landing sites, and observed Phobos close-up.',
    searchKeywords: 'orbiter satellite viking 1 mdim mosaic imagery 1976 phobos nasa jpl',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA20029/PIA20029~small.jpg',
    photoCaption: 'NASA/JPL · Viking Orbiter Global Mapping & Phobos Reconnaissance',
    survivalNotes: {
      slopeSteepness: 'N/A · 39.3° mid-latitude inclination reconnaissance orbit',
      dustRisk: 'Imaged two major 1977 global dust storms & polar cap retreat',
      radiationLevel: '1.26 mSv/day unshielded orbital radiation',
      thermalRange: '-115 °C eclipse to +75 °C sunlit bus',
      astronautAdvisory:
        'Viking MDIM 2.1 mosaic remains the baseline optical albedo and landform reference for cross-checking modern surface change.',
    },
    orbit: {
      altitudeMeters: 500000,
      inclinationDeg: 39.3,
      raanDeg: 315,
      initialPhaseDeg: 44,
      periodMinutes: 124.8,
      orbitalVelocityKmS: 3.31,
    },
  },
  {
    id: 'mangalyaan',
    name: 'Mars Orbiter Mission (Mangalyaan)',
    shortName: 'Mangalyaan',
    category: 'satellite',
    region: 'Low-Inclination Atmospheric Orbit (600 km)',
    latitude: 0,
    longitude: 0,
    elevationLabel: '600 km Preview · 15.0° Inclination',
    elevationMeters: 600000,
    surfaceRadiation: '1.27 mSv/day · Unshielded Orbit',
    radiationSeverity: 'critical',
    surfaceTempRange: '-115°C to +80°C (Bus)',
    missionStatus: 'Completed (2014–2022)',
    agency: 'ISRO (ISSDC)',
    epochOrSol: '8-Year Interplanetary Mission',
    scientificSignificance:
      'India’s first interplanetary mission; operated 8 years capturing full-disk Mars Color Camera views, exospheric deuterium/hydrogen ratios, and Valles Marineris haze.',
    searchKeywords: 'orbiter satellite isro issdc mangalyaan mom india atmosphere',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA19396/PIA19396~thumb.jpg',
    photoCaption: 'ISRO / NASA · Mangalyaan Equatorial Weather & Limb Survey Orbit',
    survivalNotes: {
      slopeSteepness: 'N/A · 15° equatorial inclination synoptic orbit',
      dustRisk: 'Monitored regional dust storm opacity & Phobos albedo',
      radiationLevel: '1.27 mSv/day unshielded orbital radiation',
      thermalRange: '-115 °C eclipse to +80 °C sunlit solar panel',
      astronautAdvisory:
        'ISRO ISSDC orbital data provides wide-angle limb dust and cloud profiles along low-latitude equatorial landing corridors.',
    },
    orbit: {
      altitudeMeters: 600000,
      inclinationDeg: 15.0,
      raanDeg: 78,
      initialPhaseDeg: 118,
      periodMinutes: 130.9,
      orbitalVelocityKmS: 3.26,
    },
  },
  {
    id: 'tianwen-1',
    name: 'Tianwen-1 Orbiter',
    shortName: 'Tianwen-1',
    category: 'satellite',
    region: 'Polar Remote Sensing Orbit (350 km)',
    latitude: 0,
    longitude: 0,
    elevationLabel: '350 km Preview · 86.9° Inclination',
    elevationMeters: 350000,
    surfaceRadiation: '1.24 mSv/day · Unshielded Orbit',
    radiationSeverity: 'critical',
    surfaceTempRange: '-118°C to +78°C (Bus)',
    missionStatus: 'Operational Global Mapping & Relay',
    agency: 'CNSA',
    epochOrSol: 'Orbit Insertion Feb 2021',
    scientificSignificance:
      'Chinese orbiter that imaged Utopia Planitia at sub-meter resolution to guide Zhurong’s landing and performs global radar sounding, mineral spectroscopy, and magnetometry.',
    searchKeywords: 'orbiter satellite tianwen 1 cnsa zhurong relay radar china',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA00571/PIA00571~thumb.jpg',
    photoCaption: 'CNSA / NASA · Tianwen-1 Polar Remote Sensing & Relay Orbit',
    survivalNotes: {
      slopeSteepness: 'N/A · 86.9° polar mapping orbit',
      dustRisk: 'Tracks northern hemisphere dust & winter frost evolution',
      radiationLevel: '1.24 mSv/day unshielded polar orbit',
      thermalRange: '-118 °C eclipse to +78 °C sunlit panels',
      astronautAdvisory:
        'Subsurface radar & mineralogical mapping across Utopia Planitia complements NASA SHARAD and ESA MARSIS datasets.',
    },
    orbit: {
      altitudeMeters: 350000,
      inclinationDeg: 86.9,
      raanDeg: 194,
      initialPhaseDeg: 274,
      periodMinutes: 115.4,
      orbitalVelocityKmS: 3.39,
    },
  },

  // ======================== LOCATIONS, ICE & LAVA TUBE DATABASES (25) ========================
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
    agency: 'USGS / IAU Planetary Gazetteer',
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
    agency: 'USGS / IAU Planetary Gazetteer',
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
    agency: 'USGS / IAU Planetary Gazetteer',
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
    agency: 'USGS / IAU Planetary Gazetteer',
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
    agency: 'USGS / IAU Planetary Gazetteer',
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
    agency: 'USGS / IAU Planetary Gazetteer',
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
    agency: 'USGS / IAU Planetary Gazetteer',
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
  {
    id: 'swim-arcadia-ice',
    name: 'SWIM Subsurface Water Ice Zone (Arcadia/Erebus)',
    shortName: 'SWIM Ice Zone',
    category: 'landmark',
    region: 'Arcadia Planitia / Erebus Montes',
    latitude: 39.5,
    longitude: -172.0,
    elevationLabel: '-3,500 m (SWIM Ice Sheet)',
    elevationMeters: -3500,
    surfaceRadiation: '0.58 mSv/day · Low-Moderate',
    radiationSeverity: 'sheltered',
    surfaceTempRange: '-102°C to -10°C',
    missionStatus: 'NASA SWIM Priority ISRU Target',
    agency: 'PSI / NASA JPL SWIM Project',
    epochOrSol: 'Shallow Buried Ice (<1 m)',
    scientificSignificance:
      'NASA Subsurface Water Ice Mapping (SWIM) radar-verified buried water-ice sheet lying less than 1 meter beneath smooth volcanic dust—ideal for astronaut ISRU water/fuel production.',
    searchKeywords: 'swim subsurface water ice mapping arcadia erebus isru radar propellant nasa psi',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA26321/PIA26321~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech/UA · SWIM Radar-Verified Shallow Water-Ice Deposit',
    survivalNotes: {
      slopeSteepness: 'Very Low (<2° flat basaltic regolith ideal for heavy cargo)',
      dustRisk: 'Moderate · Thin dust overburden masks shallow cohesive ice table',
      radiationLevel: '0.58 mSv/day (-3.5 km northern lowland shielding)',
      thermalRange: '-102 °C winter night to -10 °C summer day',
      astronautAdvisory:
        'Top-ranked human ISRU site: radar, neutron, and thermal consistency confirm pure minable ice within shovel depth for Sabatier LOX/CH₄ fuel.',
    },
  },
  {
    id: 'arsia-lava-cave',
    name: 'Arsia Mons Skylight / Lava Tube Cave',
    shortName: 'Arsia Lava Cave',
    category: 'landmark',
    region: 'Arsia Mons Southern Flank',
    latitude: -9.1,
    longitude: -119.1,
    elevationLabel: '+11,500 m (Subterranean Vault)',
    elevationMeters: 11500,
    surfaceRadiation: '0.02 mSv/day (Inside Tube) / 1.05 Surface',
    radiationSeverity: 'sheltered',
    surfaceTempRange: '-65°C Stable Subterranean',
    missionStatus: 'Natural Radiation Shelter Target',
    agency: 'USGS / NASA MRO HiRISE Catalog',
    epochOrSol: '~150 m Skylight Pit',
    scientificSignificance:
      'Natural subterranean basalt lava tube accessed via a vertical collapse skylight on Arsia Mons, offering near-complete shielding from cosmic radiation, solar flares, and micrometeorites.',
    searchKeywords: 'lava tube cave skylight arsia mons shelter radiation bunker subterranean',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA21664/PIA21664~small.jpg',
    photoCaption: 'NASA/JPL-Caltech/Univ. of Arizona · Arsia Mons Collapse Skylight Pit',
    survivalNotes: {
      slopeSteepness: 'Extreme vertical pit walls (90° drop >100 m); smooth internal tube floor',
      dustRisk: 'Zero wind & dust inside sealed subterranean lava caverns',
      radiationLevel: '1.05 mSv/day at rim · <0.02 mSv/day beneath basalt ceiling',
      thermalRange: '-65 °C stable cave interior (buffered from +100°C diurnal swings)',
      astronautAdvisory:
        'Requires crane/winch descent through skylight; once pressurized with inflatable liners, basalt roof blocks >98% of galactic cosmic rays.',
    },
  },
  {
    id: 'jezero-western-fan',
    name: 'Jezero Western Fan & Margin Carbonates',
    shortName: 'Jezero Fan',
    category: 'landmark',
    region: 'Jezero Crater Western Shore',
    latitude: 18.49,
    longitude: 77.38,
    elevationLabel: '-2,480 m (Ancient Delta)',
    elevationMeters: -2480,
    surfaceRadiation: '0.68 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-80°C to -14°C',
    missionStatus: 'High-Priority Astrobiology Zone',
    agency: 'NASA / M2020 Science Team',
    epochOrSol: '3.7 Ga Carbonate Shoreline',
    scientificSignificance:
      'High-priority astrobiology sampling zone preserving ancient shoreline carbonate precipitates (magnesite) and fine-grained delta mudstones capable of trapping microfossils.',
    searchKeywords: 'jezero western fan margin carbonates astrobiology delta shoreline perseverance',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA25022/PIA25022~small.jpg',
    photoCaption: 'NASA/JPL-Caltech/ASU/MSSS · Jezero Crater Western Delta Fan Strata',
    survivalNotes: {
      slopeSteepness: 'Moderate-Steep (12°–25° terraced delta fronts & channel boulders)',
      dustRisk: 'Moderate · Fine carbonate-clay dust along paleoshoreline terraces',
      radiationLevel: '0.68 mSv/day moderate crater basin dose',
      thermalRange: '-80 °C night to -14 °C daytime',
      astronautAdvisory:
        'Prime scientific traverse adjacent to Perseverance cache depot; hydrated carbonate outcrops also yield extractable bound water.',
    },
  },
  {
    id: 'mawrth-vallis',
    name: 'Mawrth Vallis',
    shortName: 'Mawrth Vallis',
    category: 'landmark',
    region: 'Arabia Terra / Chryse Margin',
    latitude: 23.99,
    longitude: -18.96,
    elevationLabel: '-2,200 m (Clay Outflow Channel)',
    elevationMeters: -2200,
    surfaceRadiation: '0.66 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-88°C to -10°C',
    missionStatus: 'Former Landing Site Finalist',
    agency: 'NASA / ESA Landing Study',
    epochOrSol: 'Phyllosilicate Clay Strata',
    scientificSignificance:
      'Ancient catastrophic outflow channel exposing 200-meter-thick stacks of iron/magnesium phyllosilicate clays—former finalist for both Curiosity and ExoMars.',
    searchKeywords: 'mawrth vallis phyllosilicate clay outflow channel nasa esa landing finalist',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA11011/PIA11011~thumb.jpg',
    photoCaption: 'NASA/JPL-Caltech/Univ. of Arizona · Mawrth Vallis Bright Phyllosilicate Clays',
    survivalNotes: {
      slopeSteepness: 'Gentle channel plateaus; steep 20°–35° layered clay scarps',
      dustRisk: 'Moderate · Bright clay dust & basaltic caprock ridges',
      radiationLevel: '0.66 mSv/day at -2.2 km elevation',
      thermalRange: '-88 °C night to -10 °C midday',
      astronautAdvisory:
        'Phyllosilicate clays lock up to 10% water by weight in mineral lattices—recoverable by thermal ovens for emergency habitat water.',
    },
  },
  {
    id: 'oxia-planum',
    name: 'Oxia Planum (Rosalind Franklin Site)',
    shortName: 'Oxia Planum',
    category: 'landmark',
    region: 'Chryse Basin Eastern Margin',
    latitude: 18.2,
    longitude: -24.63,
    elevationLabel: '-3,000 m (Clay-Bearing Plain)',
    elevationMeters: -3000,
    surfaceRadiation: '0.64 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-84°C to -8°C',
    missionStatus: 'ExoMars Rosalind Franklin Target',
    agency: 'ESA / Rosalind Franklin Mission',
    epochOrSol: '3.9 Ga Aqueous Plain',
    scientificSignificance:
      'Clay-bearing ancient delta plain selected as the landing site for ESA’s Rosalind Franklin rover to drill 2 meters deep in search of preserved organic biosignatures.',
    searchKeywords: 'oxia planum exomars rosalind franklin rover landing site clay biosignatures esa',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA18817/PIA18817~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech/UA · Oxia Planum Hydrated Clay Plain & Fan',
    survivalNotes: {
      slopeSteepness: 'Very Low (1°–4° broad safe landing ellipse)',
      dustRisk: 'Moderate · Thin sand sheets & low wind-eroded yardangs',
      radiationLevel: '0.64 mSv/day (-3.0 km low-elevation atmospheric protection)',
      thermalRange: '-84 °C pre-dawn to -8 °C daytime peak',
      astronautAdvisory:
        'Certified engineering-safe landing plain with dense air for parachutes/retropropulsion and rich water-bearing smectite clays.',
    },
  },
  {
    id: 'cerberus-fossae',
    name: 'Cerberus Fossae',
    shortName: 'Cerberus Fossae',
    category: 'landmark',
    region: 'Southeastern Elysium Rise',
    latitude: 11.28,
    longitude: 166.37,
    elevationLabel: '-2,700 m (Tectonic Fissures)',
    elevationMeters: -2700,
    surfaceRadiation: '0.67 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-85°C to -8°C',
    missionStatus: 'Active Seismic Epicenter',
    agency: 'NASA InSight / USGS',
    epochOrSol: 'Young Volcanic Rift (~50 ka)',
    scientificSignificance:
      'Geologically young volcanic fissure system (<10 Ma, with ~50,000-year dark ash mantling) and the confirmed epicenter of major active marsquakes detected by InSight.',
    searchKeywords: 'cerberus fossae marsquake seismic fissure volcano insight elysium',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA21063/PIA21063~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech/Univ. of Arizona · Cerberus Fossae Tectonic Fissures',
    survivalNotes: {
      slopeSteepness: 'Extreme along graben walls (40°–70° fault cliffs); flat adjacent plains',
      dustRisk: 'Moderate-High · Active rockfalls triggered by marsquakes',
      radiationLevel: '0.67 mSv/day moderate equatorial dose',
      thermalRange: '-85 °C night to -8 °C afternoon',
      astronautAdvisory:
        'Potential deep geothermal heat signature for future power, but habitats must be sited >15 km clear of active fault scarps to avoid boulder falls.',
    },
  },
  {
    id: 'acidalia-planitia',
    name: 'Acidalia Planitia',
    shortName: 'Acidalia Planitia',
    category: 'landmark',
    region: 'Northern Lowlands Basin',
    latitude: 49.8,
    longitude: -20.7,
    elevationLabel: '-4,800 m (Deep Lowland Plain)',
    elevationMeters: -4800,
    surfaceRadiation: '0.53 mSv/day · Low / Sheltered',
    radiationSeverity: 'sheltered',
    surfaceTempRange: '-110°C to -12°C',
    missionStatus: 'Historic & Fiction Landmark',
    agency: 'USGS / IAU Planetary Gazetteer',
    epochOrSol: 'Ares III Setting ("The Martian")',
    scientificSignificance:
      'Vast low-elevation northern plain (-4.8 km) shaped by ancient megafloods from Chryse and Kasei Valles—famous as the Ares III landing region in Andy Weir’s "The Martian".',
    searchKeywords: 'acidalia planitia the martian ares iii watney lowland plain northern',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA13652/PIA13652~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech/ASU · Acidalia Planitia Dark Lowland Plains',
    survivalNotes: {
      slopeSteepness: 'Low (1°–4°), though interspersed with dense pitted cones & boulders',
      dustRisk: 'Moderate-High · Seasonal northern baroclinic storm fronts',
      radiationLevel: '0.53 mSv/day (-4.8 km deep atmospheric column shielding)',
      thermalRange: '-110 °C winter night to -12 °C summer afternoon',
      astronautAdvisory:
        'Deep elevation yields high surface pressure (~9 mbar) and strong cosmic-ray attenuation; inspect HiRISE rock counts before landing.',
    },
  },
  {
    id: 'syrtis-major',
    name: 'Syrtis Major Planum',
    shortName: 'Syrtis Major',
    category: 'landmark',
    region: 'Eastern Equatorial Shield',
    latitude: 8.4,
    longitude: 69.5,
    elevationLabel: '-1,200 m (Dark Basaltic Shield)',
    elevationMeters: -1200,
    surfaceRadiation: '0.73 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-75°C to +14°C',
    missionStatus: 'Thermal Inertia & Basalt Target',
    agency: 'USGS / Mars Odyssey THEMIS',
    epochOrSol: '1,300 km Low-Relief Shield',
    scientificSignificance:
      'Mars’s classic dark albedo feature—a broad, low-relief basaltic shield volcano whose sun-absorbing bedrock exhibits high daytime temperatures and distinct thermal inertia.',
    searchKeywords: 'syrtis major basalt volcano dark albedo thermal inertia caldera',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA04109/PIA04109~small.jpg',
    photoCaption: 'NASA/JPL/MSSS · Syrtis Major Dark Basalt Shield & Calderas',
    survivalNotes: {
      slopeSteepness: 'Gentle (1°–3°); steep central Nili & Meroe Patera calderas',
      dustRisk: 'Low · High wind scour sweeps dust off exposed basalt bedrock',
      radiationLevel: '0.73 mSv/day equatorial baseline',
      thermalRange: '-75 °C night to +14 °C warm dark basalt daytime peak',
      astronautAdvisory:
        'Low-albedo basalt absorbs solar warmth and stays remarkably dust-free for solar arrays; adjacent to Jezero Crater & Nili Fossae.',
    },
  },
  {
    id: 'eberswalde-delta',
    name: 'Eberswalde Crater Delta',
    shortName: 'Eberswalde Delta',
    category: 'landmark',
    region: 'Margaritifer Terra',
    latitude: -23.86,
    longitude: -33.27,
    elevationLabel: '-1,400 m (Fossil River Delta)',
    elevationMeters: -1400,
    surfaceRadiation: '0.72 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-86°C to -2°C',
    missionStatus: 'Astrobiology & Paleolake Target',
    agency: 'NASA / MRO CRISM Survey',
    epochOrSol: 'Meandering Fossil Channels',
    scientificSignificance:
      'Spectacular inverted-relief fossilized river delta preserving meandering paleochannels and smectite clay deposits from a persistent ancient crater lake.',
    searchKeywords: 'eberswalde crater delta river paleolake clay biosignatures margaritifer',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA15207/PIA15207~small.jpg',
    photoCaption: 'NASA/JPL-Caltech/Univ. of Arizona · Eberswalde Crater Inverted River Delta',
    survivalNotes: {
      slopeSteepness: 'Moderate (5°–16° inverted channel ridges and delta terraces)',
      dustRisk: 'Moderate · Fine clay silt & wind-rippled crater floor sand',
      radiationLevel: '0.72 mSv/day southern hemisphere plateau',
      thermalRange: '-86 °C night to -2 °C afternoon',
      astronautAdvisory:
        'Exceptional astrobiology preserve just north of Holden Crater; inverted sandstone channels provide firm traction for pressurized rovers.',
    },
  },
  {
    id: 'odyssey-ice-deuteronilus',
    name: 'Odyssey Ice Anomaly (Deuteronilus Mensae)',
    shortName: 'Deuteronilus Ice',
    category: 'landmark',
    region: 'Deuteronilus Mensae / Odyssey DB',
    latitude: 45.1,
    longitude: 24.5,
    elevationLabel: '-3,300 m (Lobate Debris Aprons)',
    elevationMeters: -3300,
    surfaceRadiation: '0.59 mSv/day · Low-Moderate',
    radiationSeverity: 'sheltered',
    surfaceTempRange: '-102°C to -12°C',
    missionStatus: 'Odyssey Neutron/Thermal Ice DB',
    agency: '2001 Mars Odyssey / SHARAD',
    epochOrSol: 'Debris-Covered Glaciers',
    scientificSignificance:
      'Linked telemetry marker from the 2001 Mars Odyssey Neutron & Thermal Database: lobate debris aprons enclosing hundreds of meters of nearly pure buried glacial water ice.',
    searchKeywords: 'odyssey thermal neutron subsurface ice database deuteronilus mensae glacier',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA21603/PIA21603~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech/UA · Deuteronilus Mensae Debris-Covered Glacial Ice',
    survivalNotes: {
      slopeSteepness: 'Flat valley glaciers between steep 30° fretted mesa cliffs',
      dustRisk: 'Moderate · Protective 1–5 m rocky regolith layer seals ice below',
      radiationLevel: '0.59 mSv/day + cliff-wall lateral cosmic ray shielding',
      thermalRange: '-102 °C winter night to -12 °C summer day',
      astronautAdvisory:
        'Mid-latitude glacier reservoir accessible without extreme polar darkness; mesa overhangs offer natural shelter from micrometeorites.',
    },
  },
  {
    id: 'odyssey-thermal-nili',
    name: 'Odyssey Thermal Bedrock (Nili Fossae)',
    shortName: 'Nili Fossae',
    category: 'landmark',
    region: 'Nili Fossae Trough / Odyssey DB',
    latitude: 21.0,
    longitude: 74.5,
    elevationLabel: '-1,600 m (Olivine & Carbonate)',
    elevationMeters: -1600,
    surfaceRadiation: '0.71 mSv/day · Moderate',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-80°C to -8°C',
    missionStatus: 'Odyssey THEMIS Thermal DB',
    agency: '2001 Mars Odyssey THEMIS / CRISM',
    epochOrSol: 'High Thermal-Inertia Bedrock',
    scientificSignificance:
      'Odyssey THEMIS thermal-inertia marker highlighting Mars’s largest exposed olivine and magnesium-carbonate province—linked to early methane plumes and serpentinization.',
    searchKeywords: 'odyssey themis thermal inertia nili fossae olivine carbonate methane',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA11728/PIA11728~small.jpg',
    photoCaption: 'NASA/JPL-Caltech/UA · Nili Fossae Carbonate & Olivine Bedrock Trough',
    survivalNotes: {
      slopeSteepness: 'Mixed (smooth trough floors beside fractured graben ridges)',
      dustRisk: 'Low-Moderate · High thermal inertia confirms exposed solid rock',
      radiationLevel: '0.71 mSv/day at -1.6 km elevation',
      thermalRange: '-80 °C night to -8 °C afternoon',
      astronautAdvisory:
        'Just northwest of Jezero Crater; exposed olivine-carbonate bedrock offers structural aggregate and potential water-bearing serpentine minerals.',
    },
  },
  {
    id: 'mgs-magnetic-sirenum',
    name: 'MGS Crustal Magnetic Shield (Terra Sirenum)',
    shortName: 'Terra Sirenum',
    category: 'landmark',
    region: 'Southern Highlands / MGS Mag DB',
    latitude: -39.7,
    longitude: -155.0,
    elevationLabel: '+2,200 m (Magnetized Crust)',
    elevationMeters: 2200,
    surfaceRadiation: '0.82 mSv/day · Moderate-High',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-100°C to -12°C',
    missionStatus: 'MGS Crustal Magnetic Database',
    agency: 'NASA GSFC (MGS MAG/ER)',
    epochOrSol: '>1,500 nT Crustal Field',
    scientificSignificance:
      'Strongest ancient crustal magnetic anomaly mapped by Mars Global Surveyor (>1,500 nT at orbit), forming localized mini-magnetospheres and discrete Martian auroras.',
    searchKeywords: 'mgs mars global surveyor magnetic field crustal anomaly terra sirenum aurora',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA01923/PIA01923~small.jpg',
    photoCaption: 'NASA/JPL/GSFC · Terra Sirenum Ancient Magnetized Highlands',
    survivalNotes: {
      slopeSteepness: 'Moderate-Rough (heavily cratered Noachian highlands)',
      dustRisk: 'Moderate · Ancient highland dust & eroded crater ejecta',
      radiationLevel: '0.82 mSv/day GCR (crustal B-field partially deflects low-energy solar wind)',
      thermalRange: '-100 °C night to -12 °C summer day',
      astronautAdvisory:
        'Highland elevation reduces aerobraking margin, though localized magnetic umbrellas help shield against low-energy solar proton events.',
    },
  },
  {
    id: 'argyre-planitia',
    name: 'Argyre Planitia Impact Basin',
    shortName: 'Argyre Planitia',
    category: 'landmark',
    region: 'Southern Highlands Basin',
    latitude: -49.7,
    longitude: -43.4,
    elevationLabel: '-5,200 m (Deep Southern Basin)',
    elevationMeters: -5200,
    surfaceRadiation: '0.46 mSv/day · Low / Sheltered',
    radiationSeverity: 'sheltered',
    surfaceTempRange: '-95°C to -5°C',
    missionStatus: 'Low-Radiation Basin Landmark',
    agency: 'USGS / IAU Planetary Gazetteer',
    epochOrSol: '1,800 km Impact Basin',
    scientificSignificance:
      'Second-deepest impact basin on Mars (-5.2 km), encircled by the Charitum and Nereidum Montes and carved by ancient glacial eskers and outflow valleys.',
    searchKeywords: 'argyre planitia basin deep low radiation glacier esker impact',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA21294/PIA21294~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech/UA · Argyre Planitia Basin Rim & Glacial Deposits',
    survivalNotes: {
      slopeSteepness: 'Low on central basin plain; rugged mountain ring on rim',
      dustRisk: 'High · Frequent southern spring dust lifting & winter frost',
      radiationLevel: '0.46 mSv/day (strong atmospheric column radiation shielding)',
      thermalRange: '-95 °C winter night to -5 °C summer floor',
      astronautAdvisory:
        'Second-best surface pressure and radiation shielding in the southern hemisphere after Hellas; suitable for pressurized southern research outposts.',
    },
  },
  {
    id: 'korolev-crater',
    name: 'Korolev Crater Permanent Water-Ice',
    shortName: 'Korolev Crater',
    category: 'landmark',
    region: 'Olympia Undae Margin',
    latitude: 72.77,
    longitude: -164.54,
    elevationLabel: '-4,600 m (1.8 km Ice Lake)',
    elevationMeters: -4600,
    surfaceRadiation: '0.56 mSv/day · Low-Moderate',
    radiationSeverity: 'sheltered',
    surfaceTempRange: '-130°C to -25°C',
    missionStatus: 'Permanent Water-Ice Reservoir',
    agency: 'ESA Mars Express / USGS',
    epochOrSol: '81 km Ice-Filled Crater',
    scientificSignificance:
      '81 km wide northern crater permanently filled with a 1.8 km thick dome of pure water ice (~2,200 km³), stabilized year-round by a cold-trap air layer.',
    searchKeywords: 'korolev crater ice lake permanent water dome esa mars express polar',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA23671/PIA23671~small.jpg',
    photoCaption: 'NASA/JPL/ESA · Korolev Crater Permanent Water-Ice Cold Trap',
    survivalNotes: {
      slopeSteepness: 'Flat glacial dome interior; steep 25°–35° crater rim walls',
      dustRisk: 'Low-Moderate · Surrounding Olympia Undae gypsum sand dunes',
      radiationLevel: '0.56 mSv/day (-4.6 km base atmospheric shielding)',
      thermalRange: '-130 °C winter cold trap to -25 °C summer rim',
      astronautAdvisory:
        'Massive pure surface water-ice reserve without deep overburden excavation; requires nuclear thermal/electric power during polar winter.',
    },
  },
  {
    id: 'south-polar-cap',
    name: 'South Polar Cap (Planum Australe)',
    shortName: 'South Polar Cap',
    category: 'landmark',
    region: 'Planum Australe (84.5° S)',
    latitude: -84.5,
    longitude: 160.0,
    elevationLabel: '+1,500 m (Layered Ice Plateau)',
    elevationMeters: 1500,
    surfaceRadiation: '0.80 mSv/day · Moderate-High',
    radiationSeverity: 'moderate',
    surfaceTempRange: '-145°C to -30°C',
    missionStatus: 'Subglacial Radar Target',
    agency: 'ESA MARSIS / USGS',
    epochOrSol: 'CO₂ & Water-Ice Dome',
    scientificSignificance:
      'High-elevation southern polar ice cap capped by permanent CO₂ dry ice and probed by Mars Express MARSIS radar for potential subglacial hypersaline anomalies 1.5 km deep.',
    searchKeywords: 'south polar cap planum australe marsis subglacial ice co2 dry ice',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA24286/PIA24286~thumb.jpg',
    photoCaption: 'NASA/JPL-Caltech/MSSS · Planum Australe South Polar Layered Ice Cap',
    survivalNotes: {
      slopeSteepness: 'Gentle layered dome with carved "Swiss cheese" CO₂ sublimation pits',
      dustRisk: 'High · Violent CO₂ sublimation geysers each southern spring',
      radiationLevel: '0.80 mSv/day (+1.5 km plateau elevation)',
      thermalRange: '-145 °C winter CO₂ freeze-out to -30 °C summer',
      astronautAdvisory:
        'Hazardous spring CO₂ gas jets and extreme polar cold limit crewed viability compared to Planum Boreum or mid-latitude SWIM ice plains.',
    },
  },
  {
    id: 'noctis-labyrinths',
    name: 'Noctis Labyrinths & Canyon Head',
    shortName: 'Noctis Labyrinths',
    category: 'landmark',
    region: 'Western Valles Marineris Head',
    latitude: -6.8,
    longitude: -96.5,
    elevationLabel: '+6,200 m (Faulted Plateau)',
    elevationMeters: 6200,
    surfaceRadiation: '0.96 mSv/day · High Exposure',
    radiationSeverity: 'critical',
    surfaceTempRange: '-95°C to -5°C',
    missionStatus: 'Geologic & Frost Canyon Target',
    agency: 'USGS / ESA Mars Express',
    epochOrSol: '1,200 km Intersecting Canyons',
    scientificSignificance:
      'Maze of intersecting steep-walled valleys linking Tharsis volcanoes to Valles Marineris, exhibiting newly discovered morning water-ice frost atop ancient caldera flanks.',
    searchKeywords: 'noctis labyrinths canyon maze tharsis frost valles marineris volcano',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA20740/PIA20740~medium.jpg',
    photoCaption: 'NASA/JPL-Caltech/ASU · Noctis Labyrinths Intersecting Fault Troughs',
    survivalNotes: {
      slopeSteepness: 'Extreme (40°–70° intersecting fault walls); narrow canyon floors',
      dustRisk: 'Moderate · Morning water frost condenses along shadowed plateau rims',
      radiationLevel: '0.96 mSv/day (+6.2 km plateau rim)',
      thermalRange: '-95 °C night to -5 °C sunlit floor',
      astronautAdvisory:
        'Complex canyon maze poses navigation traps for surface rovers; descend eastward into Melas/Coprates Chasma for denser air and shielding.',
    },
  },
  {
    id: 'pavonis-skylight',
    name: 'Pavonis Mons Skylight / Cave',
    shortName: 'Pavonis Skylight',
    category: 'landmark',
    region: 'Pavonis Mons Equatorial Flank',
    latitude: 1.48,
    longitude: -112.96,
    elevationLabel: '+14,100 m (Lava Tube Pit)',
    elevationMeters: 14100,
    surfaceRadiation: '0.02 mSv/day (Inside Cave) / 1.11 Rim',
    radiationSeverity: 'sheltered',
    surfaceTempRange: '-68°C Stable Subterranean',
    missionStatus: 'Equatorial Lava Tube Candidate',
    agency: 'NASA MRO HiRISE Catalog',
    epochOrSol: '35 m Skylight Aperture',
    scientificSignificance:
      'Equatorial volcanic skylight on Pavonis Mons opening into a ~20 m deep subterranean lava cavern—offering a completely dark, radiation-free interior right on the Martian equator.',
    searchKeywords: 'pavonis mons skylight lava tube cave shelter equatorial radiation tharsis',
    photoUrl: 'https://images-assets.nasa.gov/image/PIA04735/PIA04735~small.jpg',
    photoCaption: 'NASA/JPL/ASU · Pavonis Mons Caldera & Equatorial Lava Cave Terrain',
    survivalNotes: {
      slopeSteepness: 'Vertical collapse shaft (35 m wide, >20 m deep overhang)',
      dustRisk: 'Minimal dust inside cavern beneath basalt overhang',
      radiationLevel: '1.11 mSv/day on rim · <0.02 mSv/day inside lava cavern',
      thermalRange: '-68 °C stable subterranean temperature',
      astronautAdvisory:
        'Ideal equatorial cave shelter for solar-storm refuge once reached via overland rover from lower Tharsis base.',
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

  // Planum Australe South Polar Layered Ice Plateau (~1,500 m)
  const southPolarDome = latDeg < -78 ? 1400 * Math.exp(-Math.pow((-90 - latDeg) / 8.0, 2)) : 0;

  // Isidis Planitia (-3,650 m basin around 12N, 88E) & Acidalia Planitia (-4,800 m around 49N, -21W)
  const dLonIsi = wrapLonDiff(lonDeg, 88.0);
  const dLatIsi = latDeg - 12.0;
  const isidis = -2600 * Math.exp(-(dLonIsi * dLonIsi + dLatIsi * dLatIsi) / 140);

  const dLonAci = wrapLonDiff(lonDeg, -21.0);
  const dLatAci = latDeg - 49.0;
  const acidalia = -1250 * Math.exp(-(dLonAci * dLonAci + dLatAci * dLatAci) / 280);

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
      southPolarDome +
      isidis +
      acidalia +
      roughness
  );
}
