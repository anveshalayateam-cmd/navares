import { Ruler, X } from 'lucide-react';
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
  if (!measureMode) return null;

  const traverse = result ? formatTraverseTimes(result.surfaceDistanceMeters) : null;

  return (
    <>
      {/* Instruction Banner */}
      <div
        role="status"
        className="pointer-events-auto fixed top-[68px] left-4 z-20 flex flex-wrap items-center gap-2.5 rounded-full border border-cyan-400/35 bg-[#0B0F17]/88 px-3.5 py-2 backdrop-blur-md shadow-2xl max-w-[calc(100vw-2rem)]"
      >
        <Ruler className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden="true" />
        <span className="text-xs text-slate-100">
          {result
            ? 'Measurement locked · Click globe for new Point A'
            : hasPointA
              ? 'Click second point on Mars to complete measurement'
              : 'Click two points on Mars to measure surface distance'}
        </span>
        <button
          type="button"
          onClick={onExitMeasureMode}
          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/20 hover:text-white cursor-pointer whitespace-nowrap"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          <span>Clear / Exit</span>
        </button>
      </div>

      {/* Live Cursor Distance Tooltip while dragging/moving from Point A */}
      {hasPointA && !result && livePreview && (
        <div
          style={{
            left: `${livePreview.x + 14}px`,
            top: `${Math.max(12, livePreview.y - 34)}px`,
          }}
          className="pointer-events-none fixed z-30 rounded-full border border-cyan-400/50 bg-[#0B0F17]/90 px-3 py-1 font-mono-tabular text-xs font-semibold text-cyan-200 shadow-xl backdrop-blur-md whitespace-nowrap"
        >
          {formatDistance(livePreview.distanceMeters)}
        </div>
      )}

      {/* Locked Geodesic Measurement Result Card */}
      {result && traverse && (
        <aside
          aria-label="Geodesic distance measurement summary"
          className="pointer-events-auto fixed top-[116px] left-4 z-20 w-[330px] max-w-[calc(100vw-2rem)] rounded-2xl border border-cyan-400/30 bg-[#0B0F17]/88 p-4 backdrop-blur-md shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <Ruler className="h-4 w-4 text-cyan-300" aria-hidden="true" />
              <h3 className="font-display text-sm font-semibold text-white">
                Geodesic Measurement
              </h3>
            </div>
            <button
              type="button"
              onClick={onClearMeasurement}
              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
            >
              Reset Points
            </button>
          </div>

          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-400">Surface Distance</dt>
              <dd className="font-mono-tabular text-sm font-semibold text-cyan-300">
                {formatDistance(result.surfaceDistanceMeters)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-400">Elevation Delta (Δh)</dt>
              <dd className="font-mono-tabular font-medium text-amber-300">
                {formatSurfaceElevation(result.elevationDeltaMeters)}
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
        </aside>
      )}
    </>
  );
}
