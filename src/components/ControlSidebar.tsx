import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Gauge,
  Layers,
  MapPin,
  Orbit,
  Route,
  ShieldAlert,
} from 'lucide-react';
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  MARS_TARGETS,
  MapLayerState,
  MarsTarget,
  TargetCategory,
  TelemetryMode,
} from '../data/marsData';
import { formatLatLon } from '../utils/marsMath';
import { LiveSatellitePosition } from './MarsGlobe';

interface ControlSidebarProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  visibleCategories: Record<TargetCategory, boolean>;
  onToggleCategory: (category: TargetCategory) => void;
  layers: MapLayerState;
  onToggleLayer: (layerKey: keyof MapLayerState) => void;
  telemetryMode: TelemetryMode;
  onChangeTelemetryMode: (mode: TelemetryMode) => void;
  selectedTargetId: string | null;
  onJumpToTarget: (target: MarsTarget) => void;
  liveSatellites: Record<string, LiveSatellitePosition>;
}

const CATEGORY_ORDER: TargetCategory[] = ['rover', 'satellite', 'landmark'];

export function ControlSidebar({
  isOpen,
  onToggleOpen,
  visibleCategories,
  onToggleCategory,
  layers,
  onToggleLayer,
  telemetryMode,
  onChangeTelemetryMode,
  selectedTargetId,
  onJumpToTarget,
  liveSatellites,
}: ControlSidebarProps) {
  const filteredTargets = MARS_TARGETS.filter((t) => visibleCategories[t.category]);

  const layerItems: Array<{
    key: keyof MapLayerState;
    label: string;
    detail: string;
    icon: typeof Layers;
  }> = [
    {
      key: 'baseImagery',
      label: 'Base Satellite Imagery',
      detail: 'NASA Viking 232m Mosaic',
      icon: Layers,
    },
    {
      key: 'molaOverlay',
      label: 'MOLA Topographic Shade',
      detail: 'Laser Altimetry Elevation',
      icon: MapPin,
    },
    {
      key: 'slopeHazardMode',
      label: '3D Terrain Slope Mode',
      detail: '2x Relief & Steep Cliff Ramp',
      icon: ShieldAlert,
    },
    {
      key: 'roverTraverses',
      label: 'Rover Traverse Paths',
      detail: 'Surface Waypoint Tracks',
      icon: Route,
    },
    {
      key: 'orbitTrails',
      label: 'Orbit Trails',
      detail: 'Inclined Orbital Rings & Wakes',
      icon: Orbit,
    },
    {
      key: 'hazardZones',
      label: 'Astronaut Hazard Zones',
      detail: 'Dust, Slope & Radiation Risks',
      icon: ShieldAlert,
    },
  ];

  return (
    <aside
      aria-label="Mission Navigation Sidebar"
      className={`fixed top-24 left-4 bottom-4 z-20 flex items-start transition-transform duration-200 ease-out ${
        isOpen ? 'translate-x-0' : '-translate-x-[calc(100%-2.5rem)]'
      }`}
    >
      {/* Main Collapsible Panel */}
      <div
        className={`flex h-full w-[312px] max-w-[calc(100vw-4rem)] flex-col rounded-xl border border-white/10 bg-[#0B0F17]/84 backdrop-blur-md shadow-2xl overflow-hidden transition-opacity duration-150 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="hud-scroll flex-1 overflow-y-auto p-4 space-y-5">
          {/* 1. Telemetry Mode Switch */}
          <section aria-labelledby="telemetry-mode-heading">
            <div className="flex items-center justify-between mb-2">
              <h2
                id="telemetry-mode-heading"
                className="font-display text-xs font-semibold tracking-wider text-slate-300 uppercase flex items-center gap-1.5"
              >
                <Gauge className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                <span>Telemetry Mode</span>
              </h2>
            </div>

            <div
              role="group"
              aria-label="Orbital simulation speed"
              className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-[#07090E]/80 p-1"
            >
              <button
                type="button"
                onClick={() => onChangeTelemetryMode('realtime')}
                className={`rounded-md px-2.5 py-2 text-xs font-medium transition-colors duration-150 whitespace-nowrap cursor-pointer ${
                  telemetryMode === 'realtime'
                    ? 'bg-slate-800 text-white border border-white/15'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Real-Time (1x)
              </button>
              <button
                type="button"
                onClick={() => onChangeTelemetryMode('simulation100x')}
                className={`rounded-md px-2.5 py-2 text-xs font-medium transition-colors duration-150 whitespace-nowrap cursor-pointer ${
                  telemetryMode === 'simulation100x'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                100x Orbit Sim
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400 leading-snug">
              {telemetryMode === 'simulation100x'
                ? 'Accelerated orbital propagation active for MRO and MAVEN.'
                : 'Static prototype / 1x realistic Keplerian orbital velocity.'}
            </p>
          </section>

          <hr className="border-white/10" />

          {/* 2. Category Filters */}
          <section aria-labelledby="category-filters-heading">
            <h2
              id="category-filters-heading"
              className="font-display text-xs font-semibold tracking-wider text-slate-300 uppercase mb-2.5"
            >
              Target Categories
            </h2>
            <div className="grid grid-cols-3 gap-1.5">
              {CATEGORY_ORDER.map((category) => {
                const active = visibleCategories[category];
                const count = MARS_TARGETS.filter((t) => t.category === category).length;
                const color = CATEGORY_COLORS[category];

                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => onToggleCategory(category)}
                    aria-pressed={active}
                    className={`flex flex-col items-start rounded-lg border px-2.5 py-2 text-left transition-colors duration-150 cursor-pointer ${
                      active
                        ? 'border-white/20 bg-white/[0.06] text-slate-100'
                        : 'border-white/5 bg-transparent text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: active ? color : '#475569' }}
                        aria-hidden="true"
                      />
                      <span className="font-mono-tabular text-[11px] text-slate-400">
                        {count}
                      </span>
                    </div>
                    <span className="mt-1 text-xs font-medium whitespace-nowrap">
                      {CATEGORY_LABELS[category]}s
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <hr className="border-white/10" />

          {/* 3. Quick-Jump Location List */}
          <section aria-labelledby="quick-jump-heading">
            <div className="flex items-center justify-between mb-2">
              <h2
                id="quick-jump-heading"
                className="font-display text-xs font-semibold tracking-wider text-slate-300 uppercase"
              >
                Quick-Jump Targets
              </h2>
              <span className="font-mono-tabular text-[11px] text-slate-400">
                {filteredTargets.length} visible
              </span>
            </div>

            {filteredTargets.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-[#07090E]/60 p-3 text-xs text-slate-400">
                All categories are hidden. Enable a target category above to resume navigation.
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredTargets.map((target) => {
                  const isSelected = target.id === selectedTargetId;
                  const color = CATEGORY_COLORS[target.category];
                  const liveSat = liveSatellites[target.id];
                  const coordDisplay =
                    target.category === 'satellite' && liveSat
                      ? formatLatLon(liveSat.latDeg, liveSat.lonDeg, 1)
                      : formatLatLon(target.latitude, target.longitude, 2);

                  return (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => onJumpToTarget(target)}
                      className={`group flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 cursor-pointer ${
                        isSelected
                          ? 'border-orange-400/50 bg-orange-500/12 text-white'
                          : 'border-white/8 bg-[#07090E]/55 text-slate-200 hover:border-white/20 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: color }}
                            aria-hidden="true"
                          />
                          <span className="truncate text-xs font-semibold">
                            {target.name}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 pl-4 text-[11px] text-slate-400 font-mono-tabular truncate">
                          <span>{CATEGORY_LABELS[target.category]}</span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{coordDisplay}</span>
                        </div>
                      </div>
                      <ChevronRight
                        className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-slate-200"
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <hr className="border-white/10" />

          {/* 4. Map Layer Toggles */}
          <section aria-labelledby="map-layers-heading">
            <h2
              id="map-layers-heading"
              className="font-display text-xs font-semibold tracking-wider text-slate-300 uppercase mb-2.5"
            >
              Map &amp; Hazard Layers
            </h2>
            <div className="space-y-1.5">
              {layerItems.map((item) => {
                const enabled = layers[item.key];
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onToggleLayer(item.key)}
                    aria-pressed={enabled}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors duration-150 cursor-pointer ${
                      enabled
                        ? 'border-white/15 bg-white/[0.05] text-slate-100'
                        : 'border-white/5 bg-transparent text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <Icon
                        className={`h-3.5 w-3.5 shrink-0 ${
                          enabled ? 'text-orange-400' : 'text-slate-500'
                        }`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{item.label}</div>
                        <div className="text-[11px] text-slate-400 truncate">{item.detail}</div>
                      </div>
                    </div>
                    <span className="shrink-0 text-slate-400" aria-hidden="true">
                      {enabled ? (
                        <Eye className="h-3.5 w-3.5 text-cyan-400" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-slate-600" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* Collapse / Expand Handle */}
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Collapse mission sidebar' : 'Expand mission sidebar'}
        className="pointer-events-auto ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-[#0B0F17]/88 text-slate-200 backdrop-blur-md shadow-xl transition-colors duration-150 hover:border-orange-400/50 hover:text-white cursor-pointer"
        title={isOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
      >
        {isOpen ? (
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </aside>
  );
}
