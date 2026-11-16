import { formatSurfaceElevation } from '../utils/marsMath';

export interface CursorTelemetry {
  latDeg: number;
  lonDeg: number;
  elevationMeters: number;
}

export interface CameraTelemetry {
  altitudeAboveEllipsoidMeters: number;
  metersPerPixel: number;
  tiltDeg: number;
}

interface CursorTelemetryPillProps {
  telemetry: CursorTelemetry | null;
  cameraTelemetry: CameraTelemetry | null;
}

function formatDms(value: number, positiveHemisphere: string, negativeHemisphere: string): string {
  const hemisphere = value >= 0 ? positiveHemisphere : negativeHemisphere;
  const totalSeconds = Math.round(Math.abs(value) * 3600);
  const degrees = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${degrees}°${String(minutes).padStart(2, '0')}'${String(seconds).padStart(2, '0')}"${hemisphere}`;
}

function formatMarsDms(latDeg: number, lonDeg: number): string {
  const normalizedLon = ((lonDeg + 180) % 360 + 360) % 360 - 180;
  return `${formatDms(latDeg, 'N', 'S')} ${formatDms(normalizedLon, 'E', 'W')}`;
}

function chooseScaleDistance(targetMeters: number): number {
  if (!Number.isFinite(targetMeters) || targetMeters <= 0) return 1000;
  const exponent = Math.floor(Math.log10(targetMeters));
  const power = 10 ** exponent;
  const candidates = [1, 2, 5].map((factor) => factor * power).filter((value) => value <= targetMeters);
  return candidates.at(-1) ?? power / 2;
}

function formatScaleDistance(meters: number): string {
  if (meters >= 1000) return `${Math.round(meters / 1000).toLocaleString()} km`;
  return `${Math.round(meters).toLocaleString()} m`;
}

function formatAltitude(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 10000) return `${Math.max(0, Math.round(meters)).toLocaleString()} m`;
  return `${(meters / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km`;
}

export function CursorTelemetryPill({ telemetry, cameraTelemetry }: CursorTelemetryPillProps) {
  const metersPerPixel = cameraTelemetry?.metersPerPixel ?? 0;
  const scaleDistance = chooseScaleDistance(metersPerPixel * 110);
  const scaleWidth = metersPerPixel > 0 ? Math.max(28, Math.min(124, (scaleDistance / metersPerPixel))) : 72;

  return (
    <footer
      aria-label="Mars map scale, camera altitude, and cursor coordinates"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex h-8 sm:h-9 items-center justify-between gap-1.5 sm:gap-2 border-t border-white/10 bg-[#080c13]/90 px-2.5 text-[9px] text-slate-300 shadow-[0_-8px_24px_rgba(0,0,0,.22)] backdrop-blur-xl sm:px-4 sm:text-[10px]"
    >
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2.5">
        <span className="hidden font-mono-tabular text-slate-500 sm:inline">MARS</span>
        <div className="flex shrink-0 flex-col items-center gap-0.5" aria-label={`Map scale ${formatScaleDistance(scaleDistance)}`}>
          <span className="font-mono-tabular text-[8px] sm:text-[9px] leading-none text-slate-200">{formatScaleDistance(scaleDistance)}</span>
          <div className="relative h-1.5 border-t border-slate-200 max-w-[72px] sm:max-w-none" style={{ width: `${scaleWidth}px` }}>
            <span className="absolute left-0 top-[-2px] h-1.5 border-l border-slate-200" />
            <span className="absolute right-0 top-[-2px] h-1.5 border-r border-slate-200" />
          </div>
        </div>
      </div>

      <div className="shrink-0 font-mono-tabular text-slate-400">
        <span className="hidden sm:inline">Camera: </span>
        <span className="sm:hidden">Cam: </span>
        <span className="text-cyan-200">{formatAltitude(cameraTelemetry?.altitudeAboveEllipsoidMeters ?? NaN)}</span>
      </div>

      <div className="min-w-0 truncate text-right font-mono-tabular">
        {telemetry ? (
          <span className="whitespace-nowrap">
            <span className="text-slate-200">{formatMarsDms(telemetry.latDeg, telemetry.lonDeg)}</span>
            <span className="mx-1 text-slate-600">·</span>
            <span className="text-cyan-300">{formatSurfaceElevation(telemetry.elevationMeters)}</span>
          </span>
        ) : (
          <span className="text-slate-500">
            <span className="hidden sm:inline">Move cursor over Mars for coordinates · MOLA elevation</span>
            <span className="sm:hidden">Tap globe for coords · MOLA</span>
          </span>
        )}
      </div>
    </footer>
  );
}
