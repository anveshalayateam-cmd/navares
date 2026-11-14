import { Thermometer, Wind } from 'lucide-react';
import { MarsWeatherStation } from '../services/marsWeather';

export interface ProjectedWeatherBadge {
  station: MarsWeatherStation;
  x: number;
  y: number;
  visible: boolean;
  isCloseUp?: boolean;
}

interface WeatherBadgesProps {
  badges: ProjectedWeatherBadge[];
  selectedTargetId: string | null;
  onSelectStationTarget: (targetId: string) => void;
}

export function WeatherBadges({
  badges,
  selectedTargetId,
  onSelectStationTarget,
}: WeatherBadgesProps) {
  // Filter visible stations and apply gentle screen-space staggering so tight neighbors don't overlap
  const visibleBadges = badges.filter((b) => b.visible);
  const placed: Array<{ x: number; y: number; badge: ProjectedWeatherBadge }> = [];

  for (const badge of visibleBadges) {
    let px = Math.round(badge.x);
    let py = Math.round(badge.y);
    const isExpanded = badge.isCloseUp || badge.station.targetId === selectedTargetId;
    const minDx = isExpanded ? 175 : 108;
    const minDy = isExpanded ? 74 : 26;

    for (let attempt = 0; attempt < 5; attempt++) {
      const collides = placed.some(
        (p) => Math.abs(p.x - px) < minDx && Math.abs(p.y - py) < minDy
      );
      if (!collides) break;
      py -= minDy;
    }

    placed.push({ x: px, y: py, badge });
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      {placed.map(({ badge: { station, isCloseUp }, x, y }) => {
        const isSelected = station.targetId === selectedTargetId;
        const expanded = Boolean(isCloseUp || isSelected);
        const dotColor = station.category === 'rover' ? 'bg-orange-400' : 'bg-amber-300';

        if (!expanded) {
          return (
            <button
              key={station.id}
              type="button"
              onClick={() => onSelectStationTarget(station.targetId)}
              title={`${station.stationName}: ${station.minTempC} to ${station.maxTempC}, ${station.windSummary}, ${station.pressurePa}`}
              style={{
                transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -135%)`,
              }}
              className="group pointer-events-auto absolute top-0 left-0 flex items-center gap-1.5 rounded-full border border-cyan-400/35 bg-[#0B0F17]/84 px-2.5 py-1 text-left backdrop-blur-md shadow-lg transition-all hover:z-30 hover:border-cyan-300/80 hover:bg-[#0B0F17]/95 cursor-pointer whitespace-nowrap"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  station.isLiveApi ? 'bg-[#00FF41]' : dotColor
                }`}
                aria-hidden="true"
              />
              <span className="font-display text-[10px] font-semibold text-cyan-200">
                {station.shortName}
              </span>
              <span className="font-mono-tabular text-[10px] font-medium text-amber-300">
                {station.currentTempC}
              </span>
              <span className="hidden group-hover:inline font-mono-tabular text-[10px] text-slate-300">
                · {station.pressurePa}
              </span>
            </button>
          );
        }

        return (
          <button
            key={station.id}
            type="button"
            onClick={() => onSelectStationTarget(station.targetId)}
            style={{
              transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -125%)`,
            }}
            className={`pointer-events-auto absolute top-0 left-0 flex flex-col gap-1 rounded-xl border bg-[#0B0F17]/88 px-3 py-2 text-left backdrop-blur-md shadow-2xl transition-colors cursor-pointer min-w-[192px] ${
              isSelected
                ? 'z-20 border-cyan-300/80'
                : 'border-cyan-400/35 hover:z-30 hover:border-cyan-300/70'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-semibold tracking-wide text-cyan-300">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    station.isLiveApi ? 'bg-[#00FF41]' : dotColor
                  }`}
                  aria-hidden="true"
                />
                {station.stationName}
              </span>
              <span className="font-mono-tabular text-[10px] text-slate-400">
                {station.sol}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 text-[11px] font-mono-tabular text-slate-100">
              <span className="inline-flex items-center gap-1">
                <Thermometer className="h-3 w-3 text-orange-400" aria-hidden="true" />
                {station.minTempC} / {station.maxTempC}
              </span>
              <span className="text-[10px] text-amber-300">Now {station.currentTempC}</span>
            </div>

            <div className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular text-slate-300">
              <span className="inline-flex items-center gap-1">
                <Wind className="h-3 w-3 text-cyan-400" aria-hidden="true" />
                {station.windSummary}
              </span>
              <span className="text-slate-400">{station.pressurePa}</span>
            </div>

            <div className="text-[10px] text-slate-400 truncate">{station.opacity}</div>
          </button>
        );
      })}
    </div>
  );
}
