import { Bot, Satellite } from 'lucide-react';

interface LeftMarginControlsProps {
  showSatellites: boolean;
  showRovers: boolean;
  onToggleSatellites: () => void;
  onToggleRovers: () => void;
}

export function LeftMarginControls({
  showSatellites,
  showRovers,
  onToggleSatellites,
  onToggleRovers,
}: LeftMarginControlsProps) {
  return (
    <div
      aria-label="Spacecraft and rover visibility controls"
      className="pointer-events-auto fixed bottom-14 left-4 z-20 flex flex-col items-start gap-2"
    >
      <button
        type="button"
        aria-pressed={showSatellites}
        aria-label={showSatellites ? 'Hide Satellite' : 'Show Satellite'}
        onClick={onToggleSatellites}
        title={showSatellites ? 'Hide satellites and orbital tracks' : 'Show satellites and orbital tracks'}
        className={`group flex h-10 items-center justify-center rounded-2xl border px-3 text-xs font-medium backdrop-blur-md shadow-2xl transition-all duration-200 cursor-pointer whitespace-nowrap hover:px-3.5 focus-visible:px-3.5 ${
          showSatellites
            ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30'
            : 'border-white/15 bg-[#0B0F17]/82 text-slate-200 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Satellite
          className={`h-4 w-4 shrink-0 ${showSatellites ? 'text-cyan-300' : 'text-slate-400'}`}
          aria-hidden="true"
        />
        <span className="max-w-0 overflow-hidden opacity-0 transition-all duration-200 group-hover:ml-2 group-hover:max-w-[9rem] group-hover:opacity-100 group-focus-visible:ml-2 group-focus-visible:max-w-[9rem] group-focus-visible:opacity-100">
          Show Satellite
        </span>
      </button>

      <button
        type="button"
        aria-pressed={showRovers}
        aria-label={showRovers ? 'Hide Rover' : 'Show Rover'}
        onClick={onToggleRovers}
        title={showRovers ? 'Hide rovers and landers' : 'Show rovers and landers'}
        className={`group flex h-10 items-center justify-center rounded-2xl border px-3 text-xs font-medium backdrop-blur-md shadow-2xl transition-all duration-200 cursor-pointer whitespace-nowrap hover:px-3.5 focus-visible:px-3.5 ${
          showRovers
            ? 'border-orange-400/60 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30'
            : 'border-white/15 bg-[#0B0F17]/82 text-slate-200 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Bot
          className={`h-4 w-4 shrink-0 ${showRovers ? 'text-orange-300' : 'text-slate-400'}`}
          aria-hidden="true"
        />
        <span className="max-w-0 overflow-hidden opacity-0 transition-all duration-200 group-hover:ml-2 group-hover:max-w-[9rem] group-hover:opacity-100 group-focus-visible:ml-2 group-focus-visible:max-w-[9rem] group-focus-visible:opacity-100">
          Show Rover
        </span>
      </button>
    </div>
  );
}
