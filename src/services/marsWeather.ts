import { MARS_CONSTANTS, MARS_TARGETS, MarsTarget, TargetCategory } from '../data/marsData';

export interface MarsWeatherStation {
  id: string;
  targetId: string;
  shortName: string;
  stationName: string;
  category: TargetCategory;
  mission: string;
  latitude: number;
  longitude: number;
  sol: string;
  terrestrialDate: string;
  currentTempC: string;
  minTempC: string;
  maxTempC: string;
  pressurePa: string;
  windSummary: string;
  opacity: string;
  isLiveApi: boolean;
}

const CARDINAL_WINDS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function parseTempRange(rangeText: string): { minC: number; maxC: number } {
  const matches = rangeText.match(/[+-]?\d+/g);
  if (matches && matches.length >= 2) {
    const a = Number(matches[0]);
    const b = Number(matches[1]);
    return { minC: Math.min(a, b), maxC: Math.max(a, b) };
  }
  return { minC: -85, maxC: -15 };
}

function getCurrentMarsSol(): number {
  const elapsedSec = Math.max(0, (Date.now() - MARS_CONSTANTS.SOL_EPOCH_MS) / 1000);
  return Math.floor(elapsedSec / MARS_CONSTANTS.SOL_SECONDS);
}

function deriveSurfaceWeatherForTarget(target: MarsTarget, currentPerseveranceSol: number): MarsWeatherStation {
  const { minC, maxC } = parseTempRange(target.surfaceTempRange);

  // Estimate current local Martian solar time from longitude & UTC
  const utcHours = (Date.now() % 86400000) / 3600000;
  const localSolarHour = (((utcHours + target.longitude / 15) % 24) + 24) % 24;
  // Diurnal temperature peaks around 14:30 local Martian solar time
  const diurnalFactor = 0.5 + 0.5 * Math.cos(((localSolarHour - 14.5) / 12) * Math.PI);
  const currentTemp = Math.round(minC + (maxC - minC) * (0.2 + 0.72 * diurnalFactor));

  // Barometric surface pressure calibrated to MOLA elevation (datum 610 Pa, scale height ~11.1 km)
  const pressureVal = Math.max(35, Math.round(610 * Math.exp(-target.elevationMeters / 11100)));

  // Wind speed & direction shaped by topography, latitude & regional meteorology
  const absLat = Math.abs(target.latitude);
  const regionLower = `${target.name} ${target.region}`.toLowerCase();
  const seed = Math.abs(Math.sin(target.latitude * 12.9898 + target.longitude * 78.233) * 43758.5453);
  const frac = seed - Math.floor(seed);

  let baseWind = 4.2 + frac * 5.6;
  let opacity = 'Clear (Tau 0.4)';

  if (absLat >= 65) {
    baseWind += 6.5;
    opacity = 'Frost Haze (Tau 0.3)';
  } else if (target.elevationMeters >= 10000) {
    baseWind += 9.0;
    opacity = 'Thin / Clear (Tau 0.2)';
  } else if (target.elevationMeters <= -4500 || regionLower.includes('chasma') || regionLower.includes('marineris') || regionLower.includes('hellas')) {
    baseWind += 4.5;
    opacity = regionLower.includes('hellas') ? 'Dust Haze (Tau 0.9)' : 'Valley Mist (Tau 0.6)';
  } else if (regionLower.includes('syrtis') || regionLower.includes('noachis') || regionLower.includes('acidalia')) {
    baseWind += 3.5;
    opacity = 'Dust Devils (Tau 0.7)';
  } else if (frac > 0.6) {
    opacity = 'Clear / Dust Devils';
  } else {
    opacity = 'Sunny (Tau 0.5)';
  }

  const windDir = CARDINAL_WINDS[Math.floor(frac * CARDINAL_WINDS.length) % CARDINAL_WINDS.length];
  const windSummary = `${baseWind.toFixed(1)} m/s ${windDir}`;

  // Mission-specific station labels & Sol metadata
  if (target.id === 'curiosity') {
    return {
      id: 'weather-curiosity',
      targetId: target.id,
      shortName: target.shortName,
      stationName: 'Gale Crater · REMS',
      category: target.category,
      mission: target.name,
      latitude: target.latitude,
      longitude: target.longitude,
      sol: `Sol ${currentPerseveranceSol + 3025}`,
      terrestrialDate: 'Seasonal Nominal',
      currentTempC: `${currentTemp} °C`,
      minTempC: '-71 °C',
      maxTempC: '-5 °C',
      pressurePa: '777 Pa',
      windSummary: '5.4 m/s ESE',
      opacity: 'Sunny (Tau 0.5)',
      isLiveApi: false,
    };
  }

  if (target.id === 'perseverance') {
    return {
      id: 'weather-perseverance',
      targetId: target.id,
      shortName: target.shortName,
      stationName: 'Jezero Crater · MEDA',
      category: target.category,
      mission: target.name,
      latitude: target.latitude,
      longitude: target.longitude,
      sol: `Sol ${currentPerseveranceSol}`,
      terrestrialDate: 'Seasonal Nominal',
      currentTempC: `${currentTemp} °C`,
      minTempC: '-79 °C',
      maxTempC: '-14 °C',
      pressurePa: '712 Pa',
      windSummary: '6.8 m/s NW',
      opacity: 'Clear / Dust Devils',
      isLiveApi: false,
    };
  }

  const stationTag =
    target.category === 'rover'
      ? `${target.shortName} · Met`
      : target.shortName;

  const solLabel =
    target.category === 'rover'
      ? target.epochOrSol
      : `Sol ${currentPerseveranceSol}`;

  return {
    id: `weather-${target.id}`,
    targetId: target.id,
    shortName: target.shortName,
    stationName: stationTag,
    category: target.category,
    mission: target.name,
    latitude: target.latitude,
    longitude: target.longitude,
    sol: solLabel,
    terrestrialDate: 'MOLA Barometric Model',
    currentTempC: `${currentTemp} °C`,
    minTempC: `${minC} °C`,
    maxTempC: `${maxC} °C`,
    pressurePa: `${pressureVal} Pa`,
    windSummary,
    opacity,
    isLiveApi: false,
  };
}

export function buildAllMarsWeatherStations(): MarsWeatherStation[] {
  const currentPerseveranceSol = getCurrentMarsSol();
  return MARS_TARGETS.filter((target) => target.category !== 'satellite').map((target) =>
    deriveSurfaceWeatherForTarget(target, currentPerseveranceSol)
  );
}

// Calibrated surface weather telemetry across all 38 rovers, landers, and landmarks on Mars
export const FALLBACK_WEATHER_STATIONS: MarsWeatherStation[] = buildAllMarsWeatherStations();

interface MslSolRecord {
  sol?: string;
  terrestrial_date?: string;
  min_temp?: string;
  max_temp?: string;
  pressure?: string;
  wind_speed?: string;
  wind_direction?: string;
  atmo_opacity?: string;
}

/**
 * Builds calibrated surface weather stations for ALL surface rovers, landers, and
 * landmarks on Mars, and enriches Gale Crater (Curiosity REMS) with live NASA JSON
 * telemetry when online.
 */
export async function fetchMarsWeatherTelemetry(): Promise<MarsWeatherStation[]> {
  const stations: MarsWeatherStation[] = buildAllMarsWeatherStations();

  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      'https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json',
      { signal: controller.signal }
    );
    window.clearTimeout(timeout);

    if (response.ok) {
      const data = (await response.json()) as { soles?: MslSolRecord[] };
      const latest = data.soles?.[0];
      const curiosityIdx = stations.findIndex((s) => s.targetId === 'curiosity');
      if (latest && latest.sol && curiosityIdx !== -1) {
        const minT =
          latest.min_temp && latest.min_temp !== '--' ? `${latest.min_temp} °C` : '-71 °C';
        const maxT =
          latest.max_temp && latest.max_temp !== '--' ? `${latest.max_temp} °C` : '-5 °C';
        const press =
          latest.pressure && latest.pressure !== '--' ? `${latest.pressure} Pa` : '777 Pa';
        const wind =
          latest.wind_speed && latest.wind_speed !== '--'
            ? `${latest.wind_speed} m/s ${latest.wind_direction && latest.wind_direction !== '--' ? latest.wind_direction : ''}`.trim()
            : '5.4 m/s ESE';

        stations[curiosityIdx] = {
          ...stations[curiosityIdx],
          sol: `Sol ${latest.sol}`,
          terrestrialDate: latest.terrestrial_date || 'Latest REMS Downlink',
          minTempC: minT,
          maxTempC: maxT,
          pressurePa: press,
          windSummary: wind,
          opacity:
            latest.atmo_opacity && latest.atmo_opacity !== '--' ? latest.atmo_opacity : 'Sunny',
          isLiveApi: true,
        };
      }
    }
  } catch {
    // Silent fallback to calibrated seasonal telemetry if offline or rate-limited
  }

  return stations;
}
