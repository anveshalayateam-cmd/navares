import { CloudSun, Crosshair, Radio, Satellite, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CATEGORY_COLORS, CATEGORY_LABELS, MarsTarget, TelemetryMode } from '../data/marsData';
import { LiveOrbiterElements } from '../services/marsOrbiterSync';
import { RoverTelemetryFix, formatUtcTimestamp } from '../services/marsRoverTelemetry';
import { MarsWeatherStation } from '../services/marsWeather';
import { createTargetPhotoFallback, formatLatLon } from '../utils/marsMath';
import {
  formatMarsSurfaceTempC,
  getMarsSurfaceTempSample,
} from '../utils/marsOverlayMaps';
import { formatLocationAreaKm2, getLocationAreaInfo } from '../data/marsFeatureOutlines';
import { LiveSatellitePosition } from './MarsGlobe';

interface TargetInfoCardProps {
  target: MarsTarget;
  temperatureLs: number;
  liveSatellite?: LiveSatellitePosition;
  liveRover?: RoverTelemetryFix;
  liveOrbiter?: LiveOrbiterElements;
  weatherEnabled?: boolean;
  weatherStation?: MarsWeatherStation;
  telemetryMode: TelemetryMode;
  onChangeTelemetryMode: (mode: TelemetryMode) => void;
  onZoomToSurface: (target: MarsTarget) => void;
  onClose: () => void;
}

export function TargetInfoCard({
  target,
  temperatureLs,
  liveSatellite,
  liveRover,
  liveOrbiter,
  weatherEnabled,
  weatherStation,
  telemetryMode,
  onChangeTelemetryMode,
  onZoomToSurface,
  onClose,
}: TargetInfoCardProps) {
  const [imgSrc, setImgSrc] = useState<string>(target.photoUrl);

  useEffect(() => {
    setImgSrc(target.photoUrl);
  }, [target.id, target.photoUrl]);

  const categoryColor = CATEGORY_COLORS[target.category];
  const displayLat =
    target.category === 'satellite' && liveSatellite
      ? liveSatellite.latDeg
      : target.category === 'rover' && liveRover
        ? liveRover.latitude
        : target.latitude;
  const displayLon =
    target.category === 'satellite' && liveSatellite
      ? liveSatellite.lonDeg
      : target.category === 'rover' && liveRover
        ? liveRover.longitude
        : target.longitude;

  const coordinatesText =
    target.category === 'satellite' && liveSatellite
      ? formatLatLon(liveSatellite.latDeg, liveSatellite.lonDeg, 3)
      : formatLatLon(displayLat, displayLon, 4);

  const elevationText =
    target.category === 'satellite' && liveSatellite
      ? `${liveSatellite.altKm.toFixed(0)} km Orbit · ${(liveOrbiter?.inclinationDeg ?? target.orbit?.inclinationDeg ?? 0).toFixed(1)}° Inc · ${liveSatellite.velocityKmS.toFixed(2)} km/s`
      : target.category === 'rover' && liveRover
        ? `${liveRover.elevationMeters > 0 ? '+' : ''}${liveRover.elevationMeters.toLocaleString()} m${liveRover.sol ? ` · Sol ${liveRover.sol}` : ''}`
        : target.elevationLabel;

  const tesSample = getMarsSurfaceTempSample(displayLat, displayLon, temperatureLs);
  const tesSurfaceTemp = formatMarsSurfaceTempC(tesSample?.tempC ?? null);
  const locationArea = getLocationAreaInfo(target);

  const radiationColorClass =
    target.radiationSeverity === 'critical'
      ? 'text-[#00FF41]'
      : target.radiationSeverity === 'moderate'
        ? 'text-emerald-300'
        : 'text-cyan-300';

  return (
    <aside
      aria-label={`${target.name} knowledge card`}
      className="pointer-events-auto fixed top-4 right-4 z-30 flex w-[355px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-8rem)] flex-col rounded-2xl border border-white/14 bg-[#0B0F17]/84 backdrop-blur-md shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: categoryColor }}
              aria-hidden="true"
            />
            <span style={{ color: categoryColor }}>
              {CATEGORY_LABELS[target.category]}
            </span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span className="truncate text-slate-400">{target.agency}</span>
          </div>
          <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-white">
            {target.name}
          </h2>
          <p className="text-xs text-slate-400">{target.region}</p>
          {locationArea && (
            <p className="mt-1 text-[10px] leading-snug text-cyan-200/85">
              Area highlighted on globe · {formatLocationAreaKm2(locationArea.areaKm2)}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close knowledge card"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Body */}
      <div className="hud-scroll flex-1 overflow-y-auto p-4 space-y-3.5">
        {/* Official NASA Mission / Terrain Photo with Canvas Fallback */}
        <div className="relative h-32 w-full overflow-hidden rounded-xl border border-white/10 bg-black/50">
          <img
            src={imgSrc}
            alt={target.photoCaption}
            onError={() => {
              const fallback = createTargetPhotoFallback(target);
              if (fallback && imgSrc !== fallback) {
                setImgSrc(fallback);
              }
            }}
            className="h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2.5 py-1.5">
            <p className="truncate text-[10px] font-medium text-slate-200">
              {target.photoCaption}
            </p>
          </div>
        </div>

        <dl className="space-y-2 border-b border-white/10 pb-3.5 text-xs">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-400 shrink-0">Coordinates</dt>
            <dd className="font-mono-tabular font-medium text-slate-100 text-right">
              {coordinatesText}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-400 shrink-0">
              {target.category === 'satellite' ? 'Orbit' : 'Elevation'}
            </dt>
            <dd className="font-mono-tabular font-medium text-cyan-300 text-right">
              {elevationText}
            </dd>
          </div>
          {locationArea && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-slate-400 shrink-0">Assigned Area</dt>
              <dd className="font-mono-tabular font-medium text-cyan-200 text-right">
                {formatLocationAreaKm2(locationArea.areaKm2)} · {locationArea.dimensionLabel}
              </dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-400 shrink-0">
              {target.category === 'satellite' ? 'NASA TES at subpoint' : 'NASA TES daytime sample'}
            </dt>
            <dd className="font-mono-tabular font-medium text-amber-300 text-right">
              {tesSurfaceTemp}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-400 shrink-0">TES basis</dt>
            <dd className="font-mono-tabular text-[10px] text-right text-slate-300">
              {tesSample
                ? `${tesSample.source === 'seasonal TES observations' ? `Ls ${tesSample.seasonLsStart}° bin` : 'multi-season fallback'} · n=${tesSample.sampleCount.toLocaleString()} · LT ${tesSample.localTimeHours?.toFixed(1) ?? '—'}h · ±${tesSample.formalErrorK?.toFixed(1) ?? '—'}K`
                : 'No nearby quality-screened TES retrieval'}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-400 shrink-0">Surface Radiation</dt>
            <dd className={`font-mono-tabular font-medium text-right ${radiationColorClass}`}>
              {target.surfaceRadiation}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-400 shrink-0">Status</dt>
            <dd className="font-medium text-emerald-400 text-right">
              {target.missionStatus}
            </dd>
          </div>
        </dl>

        {/* Active Rover Live Telemetry / Offline Cache Fallback Banner */}
        {target.category === 'rover' && liveRover && (
          <div
            className={`rounded-xl border p-2.5 text-[11px] space-y-1 ${
              liveRover.status === 'live'
                ? 'border-emerald-400/25 bg-emerald-500/[0.07] text-emerald-100'
                : 'border-amber-400/25 bg-amber-500/[0.07] text-amber-100'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Radio
                  className={`h-3.5 w-3.5 ${
                    liveRover.status === 'live' ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                  aria-hidden="true"
                />
                {liveRover.status === 'live'
                  ? 'Live NASA/JPL Rover Position'
                  : 'Last Known Position (Cached Fallback)'}
              </span>
              {liveRover.totalDriveKm !== undefined && (
                <span className="font-mono-tabular text-[10px] text-slate-300">
                  {liveRover.totalDriveKm.toFixed(1)} km driven
                </span>
              )}
            </div>
            <p className="font-mono-tabular text-[10px] text-slate-300">
              {liveRover.status === 'live'
                ? `Updated: ${formatUtcTimestamp(liveRover.recordedAtUtc)}`
                : `Last known position: ${formatUtcTimestamp(liveRover.recordedAtUtc)}`}
            </p>
          </div>
        )}

        {/* Live/Calibrated Local Weather Telemetry when Weather Overlay is ON */}
        {weatherEnabled && weatherStation && (
          <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/[0.06] p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-cyan-300">
                <CloudSun className="h-3.5 w-3.5" aria-hidden="true" />
                Local Weather Conditions
              </span>
              <span className="font-mono-tabular text-[11px] text-slate-400">
                {weatherStation.sol}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono-tabular text-[11px] text-slate-200">
              <span>Pressure: {weatherStation.pressurePa}</span>
              <span>Wind: {weatherStation.windSummary}</span>
              <span className="col-span-2 text-cyan-200 truncate">Atmosphere: {weatherStation.opacity}</span>
            </div>
          </div>
        )}

        {/* Satellite-only Real-Time UTC Sync & 1x / 100x Orbit Speed Toggle */}
        {target.category === 'satellite' && (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 space-y-2">
            <div className="flex items-center justify-between gap-2 text-[10px] text-cyan-200/90">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Satellite className="h-3 w-3 text-cyan-300" aria-hidden="true" />
                {liveOrbiter?.source === 'jpl-horizons'
                  ? 'Synced · JPL Horizons UTC'
                  : liveOrbiter?.source === 'cached-ephemeris'
                    ? 'Synced · Cached Horizons UTC'
                    : 'Synced · IAU_MARS Real-Time UTC'}
              </span>
              <span className="font-mono-tabular text-slate-400">
                {telemetryMode === 'realtime' ? 'Live 1x' : 'Sim 100x'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-300">Orbit Speed</span>
              <div
                role="group"
                aria-label="Satellite orbit simulation speed"
                className="flex items-center gap-1 rounded-full bg-black/40 p-0.5 border border-white/10"
              >
                <button
                  type="button"
                  onClick={() => onChangeTelemetryMode('realtime')}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-mono-tabular font-medium transition-colors cursor-pointer ${
                    telemetryMode === 'realtime'
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  1x
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTelemetryMode('simulation100x')}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-mono-tabular font-medium transition-colors cursor-pointer ${
                    telemetryMode === 'simulation100x'
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  100x
                </button>
              </div>
            </div>
          </div>
        )}

        <p className="text-xs sm:text-[13px] leading-relaxed text-slate-200">
          {target.scientificSignificance}
        </p>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.07] p-3 text-xs leading-relaxed text-amber-100/90">
          <div className="font-semibold text-amber-300 mb-1">
            Astronaut Survival Note
          </div>
          <p>{target.survivalNotes.astronautAdvisory}</p>
        </div>
      </div>

      {/* Prominent Zoom to Surface / Inspect Spacecraft Action */}
      <div className="border-t border-white/10 p-3.5 bg-black/25">
        <button
          type="button"
          onClick={() => onZoomToSurface(target)}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-orange-500 px-4 py-2.5 text-xs font-semibold text-slate-950 transition-colors duration-150 hover:bg-orange-400 cursor-pointer whitespace-nowrap"
        >
          <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{target.category === 'satellite' ? 'Inspect Spacecraft' : 'Zoom to Surface'}</span>
        </button>
      </div>
    </aside>
  );
}
