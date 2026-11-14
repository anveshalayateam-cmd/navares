import { CloudSun, Grid3X3 } from 'lucide-react';
import { MARS_TEMPERATURE_GRADIENT_CSS } from '../utils/marsOverlayMaps';

export type MapStyleMode = 'optical' | 'temperature' | 'radiation' | 'elevation';

interface MapStyleBarProps {
  mapStyle: MapStyleMode;
  onChangeMapStyle: (style: MapStyleMode) => void;
  gridEnabled: boolean;
  onToggleGrid: () => void;
  weatherEnabled: boolean;
  onToggleWeather: () => void;
  temperatureLs: number;
  onTemperatureLsChange: (ls: number) => void;
}

const STYLE_OPTIONS: Array<{ id: MapStyleMode; label: string; title: string }> = [
  { id: 'optical', label: 'Optical', title: 'NASA Viking 232m Natural Color + MRO CTX Detail' },
  { id: 'radiation', label: 'Radiation', title: 'MSL RAD Calibrated Surface Radiation Levels' },
  { id: 'temperature', label: 'Temperature', title: 'NASA MGS TES quality-screened daytime retrievals by Mars solar season' },
  { id: 'elevation', label: 'Elevation', title: 'MOLA Grayscale Elevation (Black = Lowest, White = Highest)' },
];

export function MapStyleBar({
  mapStyle,
  onChangeMapStyle,
  gridEnabled,
  onToggleGrid,
  weatherEnabled,
  onToggleWeather,
  temperatureLs,
  onTemperatureLsChange,
}: MapStyleBarProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-14 z-20 flex flex-col items-center gap-2.5 px-2 sm:px-4 max-sm:gap-1.5">
      {mapStyle === 'temperature' && (
        <div className="pointer-events-auto flex flex-col gap-1.5 rounded-2xl border border-white/15 bg-[#0B0F17]/86 px-4 py-2 backdrop-blur-md shadow-2xl">
          <div
            aria-label="Temperature scale from -125°C violet/blue to +20°C red"
            className="h-2.5 w-64 rounded-full border border-white/15 sm:w-80"
            style={{ background: MARS_TEMPERATURE_GRADIENT_CSS }}
          />
          <div className="relative h-4 w-64 whitespace-nowrap font-mono-tabular text-[10px] text-slate-200 sm:w-80 sm:text-[11px]">
            <span className="absolute left-0 text-indigo-300">-125°C</span>
            <span className="absolute text-cyan-300" style={{ left: '34.48%', transform: 'translateX(-50%)' }}>-75°C</span>
            <span className="absolute text-emerald-300" style={{ left: '65.52%', transform: 'translateX(-50%)' }}>-30°C</span>
            <span className="absolute text-orange-400" style={{ left: '86.21%', transform: 'translateX(-50%)' }}>0°C</span>
            <span className="absolute right-0 font-semibold text-red-400">+20°C</span>
          </div>
          <div className="mt-1 w-64 border-t border-white/10 pt-1.5 sm:w-80">
            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-300">
              <label htmlFor="mars-tes-season" className="font-medium text-cyan-200">TES season · Ls {temperatureLs}°–{temperatureLs + 30}°</label>
              <span className="text-slate-500">12 archive files sampled</span>
            </div>
            <input
              id="mars-tes-season"
              type="range"
              min={0}
              max={330}
              step={30}
              value={temperatureLs}
              onChange={(event) => onTemperatureLsChange(Number(event.target.value))}
              aria-label="Mars solar longitude season for NASA TES surface temperatures"
              className="mt-1 w-full cursor-pointer accent-cyan-400"
            />
            <p className="text-[9px] leading-snug text-slate-500">NASA MGS TES daytime retrievals; cells without valid observations remain transparent.</p>
          </div>
        </div>
      )}

      {mapStyle === 'radiation' && (
        <div className="pointer-events-auto flex max-w-[min(44rem,calc(100vw-1rem))] flex-wrap items-center justify-center gap-2.5 rounded-full border border-[#00FF41]/35 bg-[#050806]/88 px-4 py-1.5 backdrop-blur-md shadow-2xl">
          <span className="whitespace-nowrap text-[11px] font-medium text-slate-200">Radiation Dose (MSL RAD Calibrated):</span>
          <span className="whitespace-nowrap font-mono-tabular text-[11px] text-slate-300">0.2 mSv/day (Sheltered / Black)</span>
          <div aria-label="Radiation scale from 0.2 mSv/day sheltered black to 1.2+ mSv/day high exposure bright green" className="h-2.5 w-32 rounded-full border border-white/15 sm:w-44" style={{ background: 'linear-gradient(90deg, #000000 0%, #001a05 22%, #008f11 55%, #00ff41 85%, #7dff9b 100%)' }} />
          <span className="whitespace-nowrap font-mono-tabular text-[11px] font-semibold text-[#00FF41]">1.2+ mSv/day (High Exposure / Bright Green)</span>
        </div>
      )}

      {mapStyle === 'elevation' && (
        <div className="pointer-events-auto flex max-w-[min(44rem,calc(100vw-1rem))] flex-wrap items-center justify-center gap-2.5 rounded-full border border-white/15 bg-[#0B0F17]/86 px-4 py-1.5 backdrop-blur-md shadow-2xl">
          <span className="whitespace-nowrap font-mono-tabular text-[11px] text-slate-300">-8 km (Black / Lowest)</span>
          <div aria-label="Grayscale elevation scale from -8 km black to +21 km white" className="h-2.5 w-32 rounded-full border border-white/20 sm:w-44" style={{ background: 'linear-gradient(90deg, #000000 0%, #808080 50%, #ffffff 100%)' }} />
          <span className="whitespace-nowrap font-mono-tabular text-[11px] text-slate-300">0 km (Mid Gray)</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="whitespace-nowrap font-mono-tabular text-[11px] font-semibold text-white">+21 km (White / Highest)</span>
        </div>
      )}

      <div className="relative flex min-h-10 w-full max-w-[1440px] items-center justify-between gap-2 max-sm:flex-col max-sm:items-stretch max-sm:gap-1.5">
        <button
          type="button"
          aria-pressed={gridEnabled}
          onClick={onToggleGrid}
          className={`pointer-events-auto inline-flex shrink-0 cursor-pointer items-center gap-2 self-center rounded-full border px-3.5 py-2 text-xs font-medium whitespace-nowrap shadow-2xl backdrop-blur-md transition-colors duration-150 max-sm:self-start ${
            gridEnabled
              ? 'border-cyan-300/45 bg-cyan-400/15 text-cyan-100'
              : 'border-white/15 bg-[#0B0F17]/82 text-slate-300 hover:bg-[#0B0F17] hover:text-white'
          }`}
          title="Show or hide 15° latitude and longitude graticule lines"
        >
          <Grid3X3 className={`h-3.5 w-3.5 ${gridEnabled ? 'text-cyan-300' : 'text-slate-400'}`} aria-hidden="true" />
          <span>Grid (Lat/Lon): {gridEnabled ? 'ON' : 'OFF'}</span>
        </button>

        <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2 max-sm:static max-sm:order-2 max-sm:self-center max-sm:translate-x-0">
          <div role="radiogroup" aria-label="Mars base imagery layer" className="flex items-center gap-1 rounded-full border border-white/15 bg-[#0B0F17]/82 p-1 shadow-2xl backdrop-blur-md">
            {STYLE_OPTIONS.map((opt) => {
              const active = mapStyle === opt.id;
              const isRadiationActive = active && opt.id === 'radiation';
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={opt.title}
                  onClick={() => onChangeMapStyle(opt.id)}
                  className={`shrink-0 cursor-pointer rounded-full px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 sm:px-3.5 ${
                    isRadiationActive
                      ? 'bg-[#00FF41] font-semibold text-black shadow-sm'
                      : active
                        ? 'bg-white font-semibold text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          aria-pressed={weatherEnabled}
          onClick={onToggleWeather}
          className={`pointer-events-auto inline-flex shrink-0 cursor-pointer items-center gap-2 self-center rounded-full border px-4 py-2 text-xs font-medium whitespace-nowrap shadow-2xl backdrop-blur-md transition-colors duration-150 max-sm:order-3 max-sm:self-end ${
            weatherEnabled
              ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
              : 'border-white/15 bg-[#0B0F17]/82 text-slate-300 hover:bg-[#0B0F17] hover:text-white'
          }`}
          title="Show or hide NASA TES daytime temperature samples on existing map labels"
        >
          <CloudSun className={`h-3.5 w-3.5 ${weatherEnabled ? 'text-cyan-300' : 'text-slate-400'}`} aria-hidden="true" />
          <span>Weather: {weatherEnabled ? 'ON' : 'OFF'}</span>
        </button>
      </div>
    </div>
  );
}
