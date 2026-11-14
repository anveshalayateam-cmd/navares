import { useEffect, useRef, useState } from 'react';
import {
  Minus,
  Plus,
  Route,
  Ruler,
  SunMoon,
  X,
} from 'lucide-react';

interface NavControlsProps {
  headingRad: number;
  tiltDeg: number;
  cameraAltitudeMeters: number | null;
  measureMode: boolean;
  routeMode: boolean;
  sunShadowEnabled: boolean;
  shadowsAllowed?: boolean;
  onToggleMeasure: () => void;
  onToggle3DView: () => void;
  onToggleRouteMode: () => void;
  onStartZoomIn: () => void;
  onStartZoomOut: () => void;
  onStopZoom: () => void;
  onWheelZoom: (deltaY: number) => void;
  onResetNorth: () => void;
  onResetGlobe: () => void;
  onSetTilt: (tiltDeg: number) => void;
  onSetHeading: (headingDeg: number) => void;
  onToggleSunShadow: () => void;
}

function CompassRose({ headingDeg, active }: { headingDeg: number; active: boolean }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className="h-7 w-7 transition-transform duration-75"
      style={{ transform: `rotate(${-headingDeg}deg)` }}
      aria-hidden="true"
    >
      <circle
        cx="20"
        cy="20"
        r="17.5"
        fill={active ? 'rgba(56, 189, 248, 0.14)' : '#101722'}
        stroke={active ? 'rgba(103, 232, 249, 0.7)' : 'rgba(255,255,255,0.28)'}
        strokeWidth="1.5"
      />
      <path d="M20 5.5 25.1 20 20 18.1 14.9 20 20 5.5Z" fill="#ef4444" stroke="#fecaca" strokeWidth=".6" />
      <path d="M20 34.5 14.9 20 20 21.9 25.1 20 20 34.5Z" fill="#e2e8f0" stroke="#ffffff" strokeWidth=".6" />
      <circle cx="20" cy="20" r="2.1" fill="#ffffff" stroke="#334155" strokeWidth=".8" />
      <text x="20" y="10.2" textAnchor="middle" fontSize="4.6" fontWeight="700" fill="#ffffff">
        N
      </text>
    </svg>
  );
}

function ResetGlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover/reset:-rotate-45 group-active/reset:-rotate-90"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3.1-6.8L3 8" />
      <path d="M3 3.5V8h4.5" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M8.6 12h6.8" />
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
  shadowsAllowed = true,
  onToggleMeasure,
  onToggle3DView,
  onToggleRouteMode,
  onStartZoomIn,
  onStartZoomOut,
  onStopZoom,
  onWheelZoom,
  onResetNorth,
  onResetGlobe,
  onSetTilt,
  onSetHeading,
  onToggleSunShadow,
}: NavControlsProps) {
  const headingDeg = ((headingRad * 180) / Math.PI + 360) % 360;
  const clampedTilt = Math.max(0, Math.min(80, Math.round(tiltDeg)));
  const roundedHeading = Math.round(headingDeg) % 360;
  const isPerspectiveView = tiltDeg >= 2;
  const viewToggleLabel = isPerspectiveView ? '2D' : '3D';
  const isAltitudeLocked = cameraAltitudeMeters === null || cameraAltitudeMeters > 2_000_000;
  const [compassOpen, setCompassOpen] = useState(false);
  const compassRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleGlobalRelease = () => onStopZoom();
    window.addEventListener('pointerup', handleGlobalRelease);
    window.addEventListener('pointercancel', handleGlobalRelease);
    window.addEventListener('blur', handleGlobalRelease);
    return () => {
      window.removeEventListener('pointerup', handleGlobalRelease);
      window.removeEventListener('pointercancel', handleGlobalRelease);
      window.removeEventListener('blur', handleGlobalRelease);
      onStopZoom();
    };
  }, [onStopZoom]);

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

  const tiltPercent = (clampedTilt / 80) * 100;
  const headingPercent = (roundedHeading / 360) * 100;

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
          title={
            isAltitudeLocked
              ? '3D/2D tilt controls unlock below 2,000 km'
              : `Switch to ${viewToggleLabel} view`
          }
          style={{
            opacity: isAltitudeLocked ? 0.4 : 1,
            cursor: isAltitudeLocked ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
          }}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-cyan-300/25 bg-[#0B0F17]/82 text-[11px] font-bold tracking-wide text-cyan-100 shadow-2xl backdrop-blur-md transition-all hover:bg-cyan-400/15 hover:text-white disabled:cursor-not-allowed disabled:border-slate-500/20 disabled:bg-slate-700/25 disabled:text-slate-500 disabled:opacity-40 disabled:shadow-none disabled:hover:bg-slate-700/25"
        >
          {viewToggleLabel}
        </button>

        {/* Refined Standalone Reset Globe Control */}
        <button
          type="button"
          onClick={onResetGlobe}
          aria-label="Reset global Mars orbit view"
          title="Reset Globe (R)"
          style={{ transition: 'all 0.25s ease' }}
          className="group/reset flex h-10 w-10 items-center justify-end overflow-hidden rounded-full border border-white/15 bg-[#0B0F17]/85 px-[11px] gap-0 text-slate-200 shadow-2xl backdrop-blur-md hover:w-[132px] hover:gap-2 hover:px-3.5 hover:border-cyan-400/45 hover:bg-cyan-500/15 hover:text-cyan-100 active:scale-95 cursor-pointer whitespace-nowrap"
        >
          <span
            style={{ transition: 'all 0.25s ease' }}
            className="max-w-0 overflow-hidden text-xs font-medium opacity-0 group-hover/reset:max-w-[90px] group-hover/reset:opacity-100 whitespace-nowrap"
          >
            Reset Globe
          </span>
          <ResetGlobeIcon />
        </button>
      </div>

      {/* Standalone Compass Button with Google Earth Tilt & Heading Popover */}
      <div ref={compassRef} className="relative">
        <button
          type="button"
          onClick={() => setCompassOpen((open) => !open)}
          aria-label={`Open compass controls; heading ${roundedHeading} degrees`}
            aria-expanded={compassOpen}
            title="Compass, Tilt & Heading"
            className={`flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-md shadow-2xl transition-all cursor-pointer ${
              compassOpen
                ? 'border-cyan-400/70 bg-cyan-500/25 text-white ring-2 ring-cyan-400/25'
                : 'border-white/15 bg-[#0B0F17]/85 text-slate-200 hover:border-white/30 hover:bg-white/10 hover:text-white'
            }`}
          >
            <CompassRose headingDeg={headingDeg} active={compassOpen} />
          </button>

        {compassOpen && (
          <section
            aria-label="Compass tilt and heading controls"
            className="absolute bottom-0 right-13 w-[min(19.5rem,calc(100vw-5.5rem))] rounded-2xl border border-white/15 bg-[#0B0F17]/95 p-4 text-slate-100 shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-3 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setCompassOpen(false)}
                aria-label="Close tilt and heading controls"
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <label
                  htmlFor="compass-tilt-slider"
                  className="w-16 shrink-0 text-[13px] font-medium text-slate-200"
                >
                  Tilt
                </label>
                <input
                  id="compass-tilt-slider"
                  type="range"
                  min={0}
                  max={80}
                  step={1}
                  value={clampedTilt}
                  onChange={(event) => onSetTilt(Number(event.target.value))}
                  aria-label="Tilt camera from straight down to horizon"
                  style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${tiltPercent}%, rgba(255,255,255,0.16) ${tiltPercent}%, rgba(255,255,255,0.16) 100%)`,
                  }}
                  className="compass-range-slider flex-1 cursor-pointer appearance-none h-1 rounded-full outline-none"
                />
                <span className="w-9 text-right font-mono-tabular text-[11px] text-slate-400">
                  {clampedTilt}°
                </span>
              </div>

              <div className="flex items-center gap-3">
                <label
                  htmlFor="compass-heading-slider"
                  className="w-16 shrink-0 text-[13px] font-medium text-slate-200"
                >
                  Heading
                </label>
                <input
                  id="compass-heading-slider"
                  type="range"
                  min={0}
                  max={360}
                  step={1}
                  value={roundedHeading}
                  onChange={(event) => onSetHeading(Number(event.target.value))}
                  aria-label="Rotate camera heading from 0 to 360 degrees"
                  style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${headingPercent}%, rgba(255,255,255,0.16) ${headingPercent}%, rgba(255,255,255,0.16) 100%)`,
                  }}
                  className="compass-range-slider flex-1 cursor-pointer appearance-none h-1 rounded-full outline-none"
                />
                <span className="w-9 text-right font-mono-tabular text-[11px] text-slate-400">
                  {roundedHeading}°
                </span>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button
                type="button"
                disabled={!shadowsAllowed}
                aria-pressed={shadowsAllowed && sunShadowEnabled}
                onClick={onToggleSunShadow}
                title={
                  shadowsAllowed
                    ? `Backside shadow: ${sunShadowEnabled ? 'ON' : 'OFF'}`
                    : 'Shadows disabled in Radiation, Temperature & Elevation views'
                }
                className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
                  !shadowsAllowed
                    ? 'border-white/10 bg-white/[0.03] text-slate-600 cursor-not-allowed opacity-50'
                    : sunShadowEnabled
                      ? 'border-amber-300/35 bg-amber-400/12 text-amber-200 hover:bg-amber-400/20 cursor-pointer'
                      : 'border-white/12 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 cursor-pointer'
                }`}
              >
                <SunMoon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={onResetNorth}
                className="rounded-lg px-2 py-1 text-[13px] font-medium text-sky-400 transition-colors hover:bg-sky-400/10 hover:text-sky-300 cursor-pointer"
              >
                Reset to north
              </button>
            </div>
          </section>
        )}
        </div>

        {/* Zoom Controls (Hold + / - for continuous zoom; clicks have no jump effect; scroll wheel supported) */}
        <div
          onWheel={(event) => onWheelZoom(event.deltaY)}
          title="Hold + or - for continuous zoom, or scroll with mouse / trackpad"
          className="flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0B0F17]/82 backdrop-blur-md shadow-2xl"
        >
          <button
            type="button"
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse' && event.button !== 0) return;
              onStartZoomIn();
            }}
            onPointerUp={onStopZoom}
            onPointerLeave={onStopZoom}
            onPointerCancel={onStopZoom}
            onKeyDown={(event) => {
              if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
                onStartZoomIn();
              }
            }}
            onKeyUp={onStopZoom}
            onBlur={onStopZoom}
            aria-label="Hold to zoom in continuously"
            title="Press and hold to zoom in"
            className="flex h-10 w-10 select-none touch-none items-center justify-center border-b border-white/10 text-slate-200 transition-colors hover:bg-white/10 hover:text-white active:bg-cyan-500/20 active:text-cyan-100 cursor-pointer"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse' && event.button !== 0) return;
              onStartZoomOut();
            }}
            onPointerUp={onStopZoom}
            onPointerLeave={onStopZoom}
            onPointerCancel={onStopZoom}
            onKeyDown={(event) => {
              if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
                onStartZoomOut();
              }
            }}
            onKeyUp={onStopZoom}
            onBlur={onStopZoom}
            aria-label="Hold to zoom out continuously"
            title="Press and hold to zoom out"
            className="flex h-10 w-10 select-none touch-none items-center justify-center text-slate-200 transition-colors hover:bg-white/10 hover:text-white active:bg-cyan-500/20 active:text-cyan-100 cursor-pointer"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
    </div>
  );
}
