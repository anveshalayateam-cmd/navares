import { Compass, RotateCcw } from 'lucide-react';
import { TelemetryMode } from '../data/marsData';
import { MartianSolTime, formatLatLon } from '../utils/marsMath';
import { CursorTelemetry } from './MarsGlobe';

interface MissionHeaderProps {
  solTime: MartianSolTime;
  cursorTelemetry: CursorTelemetry;
  telemetryMode: TelemetryMode;
  onResetOrbitView: () => void;
}

export function MissionHeader({
  solTime,
  cursorTelemetry,
  telemetryMode,
  onResetOrbitView,
}: MissionHeaderProps) {
  const hasGroundFix =
    cursorTelemetry.latitude !== null && cursorTelemetry.longitude !== null;

  return (
    <header className="pointer-events-none fixed top-0 left-0 right-0 z-20 flex flex-wrap items-start justify-between gap-4 p-4">
      {/* Top-Left Brand + Live Sol Clock & Surface Telemetry */}
      <div className="pointer-events-auto flex flex-col gap-2 rounded-xl border border-white/10 bg-[#0B0F17]/82 px-4 py-3 backdrop-blur-md shadow-2xl max-w-full">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-400">
            <Compass className="h-4 w-4" aria-hidden="true" />
          </div>
          <h1 className="font-display text-sm sm:text-base font-bold tracking-wide text-slate-100 whitespace-nowrap truncate">
            ARES NAV // Martian Survival &amp; Exploration Map
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 pt-2 text-xs text-slate-300 font-mono-tabular">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-slate-400">Martian Clock</span>
            <span className="font-semibold text-amber-400">
              Sol {solTime.sol.toLocaleString()}
            </span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span className="text-slate-200">{solTime.mtcFormatted}</span>
          </div>

          <span aria-hidden="true" className="hidden sm:inline text-slate-700">
            |
          </span>

          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-slate-400">Surface</span>
            {hasGroundFix ? (
              <>
                <span className="text-slate-100">
                  {formatLatLon(cursorTelemetry.latitude!, cursorTelemetry.longitude!, 2)}
                </span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span className="text-cyan-300">
                  {cursorTelemetry.elevationMeters !== null
                    ? `${cursorTelemetry.elevationMeters >= 0 ? '+' : ''}${cursorTelemetry.elevationMeters.toLocaleString()} m`
                    : '--'}
                </span>
              </>
            ) : (
              <span className="text-slate-500">Aim cursor over Mars</span>
            )}
          </div>

          <span aria-hidden="true" className="hidden md:inline text-slate-700">
            |
          </span>

          <div className="hidden md:flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-slate-400">Cam Alt</span>
            <span className="text-slate-200">
              {cursorTelemetry.cameraAltitudeKm.toLocaleString()} km
            </span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span className={telemetryMode === 'simulation100x' ? 'text-cyan-400 font-medium' : 'text-slate-400'}>
              {telemetryMode === 'simulation100x' ? '100x Orbit Sim' : '1x Real-Time'}
            </span>
          </div>
        </div>
      </div>

      {/* Top-Right Global Orbit Reset Action */}
      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onResetOrbitView}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[#0B0F17]/85 px-4 py-2.5 text-xs font-medium text-slate-100 backdrop-blur-md transition-colors duration-150 hover:border-orange-400/50 hover:bg-orange-500/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 whitespace-nowrap shrink-0 cursor-pointer"
          title="Reset camera to full global view of Mars (Shortcut: R)"
        >
          <RotateCcw className="h-3.5 w-3.5 text-orange-400" aria-hidden="true" />
          <span>Reset Orbit View</span>
        </button>
      </div>
    </header>
  );
}
