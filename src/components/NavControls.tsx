import { useEffect, useRef, useState } from 'react';
import { Globe, Minus, Plus, Route, Ruler } from 'lucide-react';

interface NavControlsProps {
  headingRad: number;
  tiltDeg: number;
  cameraAltitudeMeters: number | null;
  measureMode: boolean;
  routeMode: boolean;
  sunShadowEnabled: boolean;
  onToggleMeasure: () => void;
  onToggle3DView: () => void;
  onToggleRouteMode: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetNorth: () => void;
  onResetGlobe: () => void;
  onSetTilt: (tiltDeg: number) => void;
  onSetHeading: (headingDeg: number) => void;
  onToggleSunShadow: () => void;
}

function CompassRose({ headingDeg }: { headingDeg: number }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className="h-7 w-7 transition-transform duration-100"
      style={{ transform: `rotate(${-headingDeg}deg)` }}
      aria-hidden="true"
    >
      <circle cx="20" cy="20" r="17.5" fill="#101722" stroke="rgba(255,255,255,.28)" strokeWidth="1.5" />
      <path d="M20 5.5 25.1 20 20 18.1 14.9 20 20 5.5Z" fill="#fb4b4b" stroke="#ffd0d0" strokeWidth=".65" />
      <path d="M20 34.5 14.9 20 20 21.9 25.1 20 20 34.5Z" fill="#e5edf6" stroke="#fff" strokeWidth=".65" />
      <circle cx="20" cy="20" r="2.2" fill="#fff" stroke="#334155" strokeWidth=".8" />
      <text x="20" y="10.2" textAnchor="middle" fontSize="4.6" fontWeight="700" fill="#fff">N</text>
    </svg>
  );
}

export function NavControls({
  headingRad,
  tiltDeg,
  cameraAltitudeMeters,
  measureMode,
  routeMode,
  sunShadowEnabled,
  onToggleMeasure,
  onToggle3DView,
  onToggleRouteMode,
  onZoomIn,
  onZoomOut,
  onResetNorth,
  onResetGlobe,
  onSetTilt,
  onSetHeading,
  onToggleSunShadow,
}: NavControlsProps) {
  const headingDeg = ((headingRad * 180) / Math.PI + 360) % 360;
  const isPerspectiveView = tiltDeg >= 2;
  const viewToggleLabel = isPerspectiveView ? '2D' : '3D';
  const isAltitudeLocked = cameraAltitudeMeters === null || cameraAltitudeMeters > 2_000_000;
  const [compassOpen, setCompassOpen] = useState(false);
  const compassRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!compassOpen) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!compassRef.current?.contains(event.target as Node)) setCompassOpen(false);
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCompassOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissEscape);
    };
  }, [compassOpen]);

  return (
    <div
      aria-label="Map navigation controls"
      className="pointer-events-auto fixed bottom-14 right-4 z-20 flex flex-col items-end gap-2"
    >
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

        <button
          type="button"
          onClick={onToggle3DView}
          disabled={isAltitudeLocked}
          aria-label={`Switch to ${viewToggleLabel} view`}
          aria-pressed={isPerspectiveView}
          title={isAltitudeLocked ? '3D/2D tilt controls unlock below 2,000 km' : `Switch to ${viewToggleLabel} view`}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/25 bg-[#0B0F17]/82 text-[11px] font-bold tracking-wide text-cyan-100 shadow-2xl backdrop-blur-md transition-all hover:bg-cyan-400/15 hover:text-white disabled:cursor-not-allowed disabled:border-slate-500/20 disabled:bg-slate-700/25 disabled:text-slate-500 disabled:opacity-40 disabled:shadow-none disabled:hover:bg-slate-700/25"
        >
          {viewToggleLabel}
        </button>
      </div>

      <div className="flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0B0F17]/82 backdrop-blur-md shadow-2xl">
        <div ref={compassRef} className="relative">
          <button
            type="button"
            onClick={() => setCompassOpen((open) => !open)}
            aria-label={`Open compass controls; heading ${Math.round(headingDeg)} degrees`}
            aria-expanded={compassOpen}
            title="Compass, tilt and heading"
            className="flex h-11 w-11 items-center justify-center border-b border-white/10 text-slate-200 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <CompassRose headingDeg={headingDeg} />
          </button>
          {compassOpen && (
            <section
              aria-label="Compass controls"
              className="absolute bottom-0 right-14 w-[min(19rem,calc(100vw-5.5rem))] rounded-2xl border border-white/15 bg-[#0b111b]/95 p-4 text-slate-100 shadow-2xl backdrop-blur-xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold tracking-wide">Camera orientation</h2>
                  <p className="mt-0.5 text-[10px] text-slate-400">Drag to explore the surface</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCompassOpen(false)}
                  aria-label="Close compass controls"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </div>

              <label className="mb-1 flex items-center justify-between text-xs text-slate-300">
                <span>Tilt</span>
                <span className="font-mono-tabular text-cyan-200">{Math.round(tiltDeg)}°</span>
              </label>
              <input
                type="range"
                min={0}
                max={80}
                step={1}
                value={Math.max(0, Math.min(80, Math.round(tiltDeg)))}
                onChange={(event) => onSetTilt(Number(event.target.value))}
                aria-label="Tilt camera from straight down to horizon"
                className="mb-4 h-1.5 w-full cursor-pointer accent-cyan-400"
              />
              <div className="-mt-3 mb-4 flex justify-between text-[9px] text-slate-500"><span>0° Top-down</span><span>80° Horizon</span></div>

              <label className="mb-1 flex items-center justify-between text-xs text-slate-300">
                <span>Heading</span>
                <span className="font-mono-tabular text-cyan-200">{Math.round(headingDeg)}°</span>
              </label>
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={Math.round(headingDeg)}
                onChange={(event) => onSetHeading(Number(event.target.value))}
                aria-label="Rotate camera heading from 0 to 360 degrees"
                className="mb-4 h-1.5 w-full cursor-pointer accent-cyan-400"
              />

              <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                <button
                  type="button"
                  onClick={onResetNorth}
                  className="rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-[11px] font-medium text-cyan-100 transition hover:bg-cyan-400/20"
                >
                  Reset to north
                </button>
                <button
                  type="button"
                  aria-pressed={sunShadowEnabled}
                  onClick={onToggleSunShadow}
                  className={`rounded-lg border px-3 py-2 text-[11px] font-medium transition ${sunShadowEnabled ? 'border-amber-300/30 bg-amber-400/10 text-amber-100' : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'}`}
                  title="Toggle solar day/night terminator shading"
                >
                  Sun Shadow: {sunShadowEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </section>
          )}
        </div>
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

      <div className="flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0B0F17]/82 backdrop-blur-md shadow-2xl">
        <button
          type="button"
          onClick={onZoomIn}
          aria-label="Zoom in"
          title="Zoom In"
          className="flex h-10 w-10 items-center justify-center border-b border-white/10 text-slate-200 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
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
