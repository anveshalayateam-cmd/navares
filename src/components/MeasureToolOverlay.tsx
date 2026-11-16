import { ChevronDown, ChevronUp, Ruler, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  formatDistance,
  formatSurfaceElevation,
  formatTraverseTimes,
} from '../utils/marsMath';

export interface MeasureResult {
  pointA: { latDeg: number; lonDeg: number; elevMeters: number };
  pointB: { latDeg: number; lonDeg: number; elevMeters: number };
  surfaceDistanceMeters: number;
  elevationDeltaMeters: number;
}

export interface LiveMeasurePreview {
  distanceMeters: number;
  x: number;
  y: number;
}

interface MeasureToolOverlayProps {
  measureMode: boolean;
  hasPointA: boolean;
  livePreview: LiveMeasurePreview | null;
  result: MeasureResult | null;
  onClearMeasurement: () => void;
  onExitMeasureMode: () => void;
}

export function MeasureToolOverlay({
  measureMode,
  hasPointA,
  livePreview,
  result,
  onClearMeasurement,
  onExitMeasureMode,
}: MeasureToolOverlayProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(false);
  }, [
    result?.pointA.latDeg,
    result?.pointA.lonDeg,
    result?.pointB.latDeg,
    result?.pointB.lonDeg,
    result?.surfaceDistanceMeters,
  ]);

  if (!measureMode) return null;

  const traverse = result ? formatTraverseTimes(result.surfaceDistanceMeters) : null;
  const elevDecimals =
    result && result.surfaceDistanceMeters < 1000
      ? Math.abs(result.elevationDeltaMeters) < 10
        ? 2
        : 1
      : 0;
  const slopePercent =
    result && result.surfaceDistanceMeters > 0.05
      ? (Math.abs(result.elevationDeltaMeters) / result.surfaceDistanceMeters) * 100
      : 0;

  return (
    <>
      <div className="pointer-events-none fixed top-[60px] sm:top-[68px] left-2.5 right-2.5 sm:right-auto sm:left-4 z-20 flex sm:w-[min(21rem,calc(100vw-2rem))] max-h-[calc(100dvh-13.5rem)] md:max-h-[calc(100dvh-9.5rem)] flex-col gap-2">
        {/* Instruction Banner */}
        <div
          role="status"
          className="pointer-events-auto flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-cyan-400/35 bg-[#0B0F17]/90 px-3 py-1.5 sm:px-3.5 sm:py-2 backdrop-blur-md shadow-2xl"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Ruler className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden="true" />
            <span className="text-[11px] sm:text-xs text-slate-100 leading-snug">
              {result
                ? 'Measurement locked · Click globe for new Point A'
                : hasPointA
                  ? 'Click second point on Mars to complete measurement'
                  : 'Click two points on Mars to measure surface distance'}
            </span>
          </div>
          <button
            type="button"
            onClick={onExitMeasureMode}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/20 hover:text-white cursor-pointer whitespace-nowrap"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            <span>Clear / Exit</span>
          </button>
        </div>

        {/* Locked Geodesic Measurement Result Card */}
        {result && traverse && (
          <aside
            aria-label="Geodesic distance measurement summary"
            className={`pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-cyan-400/30 bg-[#0B0F17]/90 backdrop-blur-md shadow-2xl ${
              collapsed ? 'shrink-0' : 'min-h-0 flex-1'
            }`}
          >
            <div
              className={`flex shrink-0 items-center justify-between gap-2 px-3.5 py-2.5 sm:px-4 sm:py-3 ${
                collapsed ? '' : 'border-b border-white/10'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Ruler className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
                <div className="min-w-0">
                  <h3 className="truncate font-display text-sm font-semibold text-white">
                    Geodesic Measurement
                  </h3>
                  {collapsed && (
                    <p className="truncate font-mono-tabular text-[11px] text-cyan-300">
                      {formatDistance(result.surfaceDistanceMeters)} · Δh{' '}
                      {formatSurfaceElevation(result.elevationDeltaMeters, elevDecimals)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCollapsed((prev) => !prev)}
                  aria-expanded={!collapsed}
                  aria-label={collapsed ? 'Expand geodesic measurement' : 'Collapse geodesic measurement'}
                  title={collapsed ? 'Expand measurement' : 'Collapse measurement'}
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
                  onClick={onClearMeasurement}
                  className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
                >
                  Reset Points
                </button>
              </div>
            </div>

            {!collapsed && (
              <dl className="hud-scroll min-h-0 flex-1 overflow-y-auto px-3.5 py-3 sm:px-4 sm:py-3.5 space-y-2 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">Surface Distance</dt>
                <dd className="font-mono-tabular text-sm font-semibold text-cyan-300">
                  {formatDistance(result.surfaceDistanceMeters)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">Elevation Delta (Δh)</dt>
                <dd className="font-mono-tabular font-medium text-amber-300">
                  {formatSurfaceElevation(result.elevationDeltaMeters, elevDecimals)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-400">Mean Slope Grade</dt>
                <dd className="font-mono-tabular font-medium text-slate-200">
                  {slopePercent.toFixed(1)}%
                </dd>
              </div>
              <div className="border-t border-white/10 pt-2 space-y-1.5">
                <div className="text-[11px] font-medium text-slate-300">
                  Est. Rover Traverse Time
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-slate-400">Robotic Rover (~100 m/hr)</dt>
                  <dd className="font-mono-tabular text-slate-100">{traverse.roboticRover}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-slate-400">Pressurized EVA (~15 km/hr)</dt>
                  <dd className="font-mono-tabular text-emerald-300">{traverse.evaRover}</dd>
                </div>
              </div>
            </dl>
            )}
          </aside>
        )}
      </div>

      {/* Live Cursor Distance Tooltip while dragging/moving from Point A */}
      {hasPointA && !result && livePreview && (
        <div
          style={{
            left: `${Math.min(typeof window !== 'undefined' ? window.innerWidth - 110 : livePreview.x + 14, livePreview.x + 14)}px`,
            top: `${Math.max(12, livePreview.y - 34)}px`,
          }}
          className="pointer-events-none fixed z-30 rounded-full border border-cyan-400/50 bg-[#0B0F17]/90 px-3 py-1 font-mono-tabular text-xs font-semibold text-cyan-200 shadow-xl backdrop-blur-md whitespace-nowrap"
        >
          {formatDistance(livePreview.distanceMeters)}
        </div>
      )}
    </>
  );
}
