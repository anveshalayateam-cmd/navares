import { Globe, Minus, Navigation, Plus, Route, Ruler } from 'lucide-react';

interface NavControlsProps {
  headingRad: number;
  measureMode: boolean;
  routeMode: boolean;
  onToggleMeasure: () => void;
  onToggleRouteMode: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetNorth: () => void;
  onResetGlobe: () => void;
}

export function NavControls({
  headingRad,
  measureMode,
  routeMode,
  onToggleMeasure,
  onToggleRouteMode,
  onZoomIn,
  onZoomOut,
  onResetNorth,
  onResetGlobe,
}: NavControlsProps) {
  const headingDeg = (-headingRad * 180) / Math.PI;

  return (
    <div
      aria-label="Map navigation controls"
      className="pointer-events-auto fixed bottom-5 right-4 z-20 flex flex-col items-end gap-2"
    >
      {/* Optimal Survival Route (Above) + Measure Surface Distance Controls */}
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          aria-pressed={routeMode}
          onClick={onToggleRouteMode}
          aria-label="Optimal Survival Route"
          title="Optimal Survival Route"
          style={{ transition: 'all 0.25s ease' }}
          className={`group flex h-10 items-center justify-end overflow-hidden rounded-2xl border backdrop-blur-md shadow-2xl cursor-pointer whitespace-nowrap ${
            routeMode
              ? 'w-[198px] px-3 gap-2 border-emerald-400/60 bg-emerald-500/25 text-emerald-200'
              : 'w-10 px-[11px] gap-0 hover:w-[198px] hover:px-3 hover:gap-2 border-white/15 bg-[#0B0F17]/82 text-slate-200 hover:bg-white/10 hover:text-white'
          }`}
        >
          <span
            style={{ transition: 'all 0.25s ease' }}
            className={`overflow-hidden text-xs font-medium whitespace-nowrap ${
              routeMode
                ? 'max-w-[155px] opacity-100'
                : 'max-w-0 opacity-0 group-hover:max-w-[155px] group-hover:opacity-100'
            }`}
          >
            Optimal Survival Route
          </span>
          <Route className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>

        <button
          type="button"
          aria-pressed={measureMode}
          onClick={onToggleMeasure}
          aria-label="Measure surface distance"
          title="Measure Distance"
          className={`flex h-10 w-10 items-center justify-center rounded-2xl border backdrop-blur-md shadow-2xl transition-colors cursor-pointer ${
            measureMode
              ? 'border-cyan-400/60 bg-cyan-500/25 text-cyan-200'
              : 'border-white/15 bg-[#0B0F17]/82 text-slate-200 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Ruler className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Compass / Reset North + Globe Reset */}
      <div className="flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0B0F17]/82 backdrop-blur-md shadow-2xl">
        <button
          type="button"
          onClick={onResetNorth}
          aria-label="Reset camera North up"
          title="Reset North"
          className="flex h-10 w-10 items-center justify-center text-slate-200 transition-colors hover:bg-white/10 hover:text-white border-b border-white/10 cursor-pointer"
        >
          <Navigation
            className="h-4 w-4 text-orange-400 transition-transform duration-150"
            style={{ transform: `rotate(${headingDeg}deg)` }}
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          onClick={onResetGlobe}
          aria-label="Reset global Mars orbit view"
          title="Globe Reset"
          className="flex h-10 w-10 items-center justify-center text-slate-200 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
        >
          <Globe className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Zoom In / Zoom Out */}
      <div className="flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0B0F17]/82 backdrop-blur-md shadow-2xl">
        <button
          type="button"
          onClick={onZoomIn}
          aria-label="Zoom in"
          title="Zoom In"
          className="flex h-10 w-10 items-center justify-center text-slate-200 transition-colors hover:bg-white/10 hover:text-white border-b border-white/10 cursor-pointer"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onZoomOut}
          aria-label="Zoom out"
          title="Zoom Out"
          className="flex h-10 w-10 items-center justify-center text-slate-200 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
