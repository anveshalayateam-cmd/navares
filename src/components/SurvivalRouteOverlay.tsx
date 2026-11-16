import { ChevronDown, ChevronUp, Radio, Route, ShieldAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDistance, formatLatLon, formatSurfaceElevation } from '../utils/marsMath';
import { RouteEndpoint, SurvivalRouteResult } from '../utils/marsPathfinder';

interface SurvivalRouteOverlayProps {
  routeMode: boolean;
  startPoint: RouteEndpoint | null;
  routeResult: SurvivalRouteResult | null;
  onClearRoute: () => void;
  onExitRouteMode: () => void;
}

export function SurvivalRouteOverlay({
  routeMode,
  startPoint,
  routeResult,
  onClearRoute,
  onExitRouteMode,
}: SurvivalRouteOverlayProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(false);
  }, [
    routeResult?.start.latDeg,
    routeResult?.start.lonDeg,
    routeResult?.destination.latDeg,
    routeResult?.destination.lonDeg,
  ]);

  if (!routeMode && !routeResult) return null;

  const formatKm = (km: number) =>
    km < 100 ? formatDistance(km * 1000) : `${Math.round(km).toLocaleString('en-US')} km`;

  const coordDecimals =
    routeResult && routeResult.directDistanceKm < 5
      ? 5
      : routeResult && routeResult.directDistanceKm < 50
        ? 3
        : 1;
  const radDecimals = routeResult && routeResult.directDistanceKm < 5 ? 3 : 2;
  const elevDecimals = routeResult && routeResult.directDistanceKm < 2 ? 1 : 0;

  return (
    <div className="pointer-events-none fixed top-[60px] sm:top-[68px] left-2.5 right-2.5 sm:right-auto sm:left-4 z-20 flex sm:w-[min(22.5rem,calc(100vw-2rem))] max-h-[calc(100dvh-13.5rem)] md:max-h-[calc(100dvh-9.5rem)] flex-col gap-2">
      {/* Instruction Banner while Route Mode is active */}
      {routeMode && (
        <div
          role="status"
          className="pointer-events-auto flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-400/35 bg-[#0B0F17]/90 px-3 py-1.5 sm:px-3.5 sm:py-2 backdrop-blur-md shadow-2xl"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Route className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />
            <span className="text-[11px] sm:text-xs text-slate-100 leading-snug">
              {routeResult
                ? 'Optimal Survival Route locked · Click globe or pin for new Start'
                : startPoint
                  ? 'Click Destination on Mars (or pick a pin) to compute survival path'
                  : 'Click Start Point anywhere on Mars (or click a pin)'}
            </span>
          </div>
          <button
            type="button"
            onClick={onExitRouteMode}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/20 hover:text-white cursor-pointer whitespace-nowrap"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            <span>Exit</span>
          </button>
        </div>
      )}

      {/* Floating Survival Route Telemetry Card */}
      {routeResult && (
        <aside
          aria-label="Optimal Survival Route Telemetry"
          className={`pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-emerald-400/30 bg-[#0B0F17]/90 backdrop-blur-md shadow-2xl ${
            collapsed ? 'shrink-0' : 'min-h-0 flex-1'
          }`}
        >
          {/* Card Header */}
          <div
            className={`flex shrink-0 items-center justify-between gap-2 px-3.5 py-2.5 sm:px-4 sm:py-3 ${
              collapsed ? '' : 'border-b border-white/10'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Route className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              <div className="min-w-0">
                <h3 className="truncate font-display text-sm font-bold text-white">
                  Optimal Survival Route
                </h3>
                <p className="truncate text-[11px] text-slate-400">
                  {collapsed ? (
                    <span className="font-mono-tabular text-emerald-300">
                      {formatKm(routeResult.optimalDistanceKm)} ·{' '}
                      {routeResult.avgRadiationMsVDay.toFixed(radDecimals)} mSv/day
                    </span>
                  ) : (
                    <>
                      {routeResult.start.label ??
                        formatLatLon(routeResult.start.latDeg, routeResult.start.lonDeg, coordDecimals)}{' '}
                      ➔{' '}
                      {routeResult.destination.label ??
                        formatLatLon(
                          routeResult.destination.latDeg,
                          routeResult.destination.lonDeg,
                          coordDecimals
                        )}
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setCollapsed((prev) => !prev)}
                aria-expanded={!collapsed}
                aria-label={collapsed ? 'Expand survival route telemetry' : 'Collapse survival route telemetry'}
                title={collapsed ? 'Expand route telemetry' : 'Collapse route telemetry'}
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              >
                {collapsed ? (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={onClearRoute}
                className="shrink-0 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/15 hover:text-white cursor-pointer whitespace-nowrap"
              >
                Clear Route
              </button>
            </div>
          </div>

          {!collapsed && (
            /* Scrollable Telemetry Body */
            <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-3.5 py-3 sm:px-4 space-y-3 text-xs">
            {/* Key Path Telemetry */}
            <dl className="space-y-2 border-b border-white/10 pb-3">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">Optimal Path vs. Direct</dt>
                <dd className="font-mono-tabular text-right">
                  <span className="font-semibold text-emerald-300">
                    {formatKm(routeResult.optimalDistanceKm)}
                  </span>
                  <span className="text-slate-400">
                    {' '}
                    / {formatKm(routeResult.directDistanceKm)} (
                    {routeResult.detourPercent >= 0 ? '+' : ''}
                    {routeResult.detourPercent.toFixed(1)}%)
                  </span>
                </dd>
              </div>

              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">Avg / Peak Radiation</dt>
                <dd className="font-mono-tabular text-right">
                  <span className="font-medium text-[#00FF41]">
                    {routeResult.avgRadiationMsVDay.toFixed(radDecimals)}
                  </span>
                  <span className="text-slate-400"> / </span>
                  <span className="font-medium text-emerald-300">
                    {routeResult.peakRadiationMsVDay.toFixed(radDecimals)} mSv/day
                  </span>
                </dd>
              </div>

              {routeResult.directPeakRadiationMsVDay > routeResult.peakRadiationMsVDay + 0.03 && (
                <div className="flex items-center justify-between gap-2 text-[11px] text-emerald-300/90">
                  <span className="inline-flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
                    Peak Radiation Avoided
                  </span>
                  <span className="font-mono-tabular">
                    -{((routeResult.directPeakRadiationMsVDay - routeResult.peakRadiationMsVDay) * 100 / routeResult.directPeakRadiationMsVDay).toFixed(0)}% vs. direct ({routeResult.directPeakRadiationMsVDay.toFixed(2)})
                  </span>
                </div>
              )}

              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">Mean TES Route Temperature</dt>
                <dd className="font-mono-tabular font-medium text-amber-300">
                  {routeResult.meanTempC === null ? 'No TES coverage' : `${routeResult.meanTempC.toFixed(1)} °C`}
                </dd>
              </div>

              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">Max Elevation</dt>
                <dd className="font-mono-tabular font-medium text-cyan-300">
                  {formatSurfaceElevation(routeResult.maxElevationM, elevDecimals)}
                </dd>
              </div>
            </dl>

            {/* Prioritized Rover Encounters (3.0x priority) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-wide text-orange-300">
                  Prioritized Rover &amp; Lander Encounters
                </span>
                <span className="font-mono-tabular text-[10px] text-slate-400">3.0× Weight</span>
              </div>

              {routeResult.roverEncounters.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400">
                  No rovers within corridor detour range — rely on overhead orbiter relay.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {routeResult.roverEncounters.map((enc) => (
                    <li
                      key={enc.target.id}
                      className="rounded-xl border border-orange-400/25 bg-orange-500/[0.07] px-3 py-2 space-y-0.5"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-slate-100 truncate">
                          {enc.target.name}
                        </span>
                        <span className="shrink-0 font-mono-tabular text-[11px] text-orange-300">
                          {enc.closestKm < 0.1
                            ? 'Direct Pass'
                            : enc.closestKm < 1
                              ? `${formatDistance(enc.closestKm * 1000)} pass`
                              : `${Math.round(enc.closestKm)} km pass`}
                          {enc.detourKm > 2 ? ` (+${enc.detourKm} km)` : ''}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300/90">{enc.supportNote}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Orbiter Overflight Relay Corridors (1.0x priority) */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-cyan-300">
                  <Radio className="h-3 w-3" aria-hidden="true" />
                  Satellite Relay Overflight Corridors
                </span>
                <span className="font-mono-tabular text-[10px] text-slate-400">1.0× Weight</span>
              </div>

              {routeResult.orbiterEncounters.length === 0 ? (
                <p className="text-[11px] text-slate-400">
                  Standard periodic orbital UHF pass coverage.
                </p>
              ) : (
                <ul className="space-y-1">
                  {routeResult.orbiterEncounters.map((sat) => (
                    <li
                      key={sat.target.id}
                      className="flex items-baseline justify-between gap-2 rounded-lg border border-cyan-400/20 bg-cyan-500/[0.06] px-2.5 py-1.5 text-[11px]"
                    >
                      <span className="font-medium text-slate-100 truncate">
                        {sat.target.shortName} ({sat.target.orbit?.inclinationDeg}° inc)
                      </span>
                      <span className="shrink-0 font-mono-tabular text-cyan-300">
                        {Math.round((sat.target.orbit?.altitudeMeters ?? 400000) / 1000)} km Relay
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Corridor Legend Note */}
            <div className="border-t border-white/10 pt-2.5 flex items-center justify-between gap-2 text-[10px] text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full bg-emerald-400 inline-block" />
                Optimal Survival Path
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 border-t border-dashed border-slate-400 inline-block" />
                Direct Great-Circle
              </span>
            </div>
          </div>
          )}
        </aside>
      )}
    </div>
  );
}
