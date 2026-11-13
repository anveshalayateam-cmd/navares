import { Thermometer, Wind } from 'lucide-react';
import { MarsWeatherStation } from '../services/marsWeather';

export interface ProjectedWeatherBadge {
  station: MarsWeatherStation;
  x: number;
  y: number;
  visible: boolean;
}

interface WeatherBadgesProps {
  badges: ProjectedWeatherBadge[];
  onSelectStationTarget: (targetId: string) => void;
}

export function WeatherBadges({ badges, onSelectStationTarget }: WeatherBadgesProps) {
  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      {badges
        .filter((b) => b.visible)
        .map(({ station, x, y }) => (
          <button
            key={station.id}
            type="button"
            onClick={() => onSelectStationTarget(station.targetId)}
            style={{
              transform: `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -115%)`,
            }}
            className="pointer-events-auto absolute top-0 left-0 flex flex-col gap-1 rounded-xl border border-cyan-400/35 bg-[#0B0F17]/86 px-3 py-2 text-left backdrop-blur-md shadow-2xl transition-colors hover:border-cyan-300/70 cursor-pointer min-w-[186px]"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-display text-[11px] font-semibold tracking-wide text-cyan-300">
                {station.stationName}
              </span>
              <span className="font-mono-tabular text-[10px] text-slate-400">
                {station.sol}
              </span>
            </div>

            <div className="flex items-center gap-3 text-[11px] font-mono-tabular text-slate-100">
              <span className="inline-flex items-center gap-1">
                <Thermometer className="h-3 w-3 text-orange-400" aria-hidden="true" />
                {station.minTempC} / {station.maxTempC}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular text-slate-300">
              <span className="inline-flex items-center gap-1">
                <Wind className="h-3 w-3 text-cyan-400" aria-hidden="true" />
                {station.windSummary}
              </span>
              <span className="text-slate-400">{station.pressurePa}</span>
            </div>
          </button>
        ))}
    </div>
  );
}
