import { Compass } from 'lucide-react';
import { formatLatLon, formatSurfaceElevation } from '../utils/marsMath';

export interface CursorTelemetry {
  latDeg: number;
  lonDeg: number;
  elevationMeters: number;
}

interface CursorTelemetryPillProps {
  telemetry: CursorTelemetry | null;
}

export function CursorTelemetryPill({ telemetry }: CursorTelemetryPillProps) {
  return (
    <div
      aria-label="Live Martian surface coordinates and elevation"
      className="pointer-events-none fixed bottom-[72px] left-4 lg:bottom-5 z-20 hidden sm:flex items-center gap-2.5 rounded-full border border-white/15 bg-[#0B0F17]/82 px-3.5 py-1.5 backdrop-blur-md shadow-2xl"
    >
      <Compass className="h-3.5 w-3.5 shrink-0 text-orange-400" aria-hidden="true" />
      {telemetry ? (
        <div className="flex items-center gap-2 font-mono-tabular text-[11px] text-slate-200 whitespace-nowrap">
          <span>{formatLatLon(telemetry.latDeg, telemetry.lonDeg, 2)}</span>
          <span className="text-slate-600" aria-hidden="true">
            |
          </span>
          <span className="text-cyan-300 font-medium">
            Elev: {formatSurfaceElevation(telemetry.elevationMeters)}
          </span>
        </div>
      ) : (
        <span className="font-mono-tabular text-[11px] text-slate-400 whitespace-nowrap">
          Off-Surface / Deep Space
        </span>
      )}
    </div>
  );
}
