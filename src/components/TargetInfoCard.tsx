import { Crosshair, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { CATEGORY_COLORS, CATEGORY_LABELS, MarsTarget } from '../data/marsData';
import { formatLatLon } from '../utils/marsMath';
import { LiveSatellitePosition } from './MarsGlobe';

interface TargetInfoCardProps {
  target: MarsTarget;
  liveSatellite?: LiveSatellitePosition;
  onZoomToSurface: (target: MarsTarget) => void;
  onResetOrbitView: () => void;
  onClose: () => void;
}

export function TargetInfoCard({
  target,
  liveSatellite,
  onZoomToSurface,
  onResetOrbitView,
  onClose,
}: TargetInfoCardProps) {
  const categoryColor = CATEGORY_COLORS[target.category];
  const coordinatesText =
    target.category === 'satellite' && liveSatellite
      ? formatLatLon(liveSatellite.latDeg, liveSatellite.lonDeg, 3)
      : formatLatLon(target.latitude, target.longitude, 4);

  const elevationText =
    target.category === 'satellite' && liveSatellite
      ? `${liveSatellite.altKm.toFixed(0)} km Orbit · ${target.orbit?.inclinationDeg}° Inc`
      : target.elevationLabel;

  return (
    <section
      aria-label={`${target.name} Mission Control Dossier`}
      className="pointer-events-auto fixed top-24 right-4 bottom-16 z-20 flex w-[370px] max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-white/12 bg-[#0B0F17]/86 backdrop-blur-md shadow-2xl overflow-hidden"
    >
      {/* Header Zone: Leads directly with Title + Clean Unboxed Category/Status Line */}
      <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: categoryColor }}
              aria-hidden="true"
            />
            <span style={{ color: categoryColor }}>
              {CATEGORY_LABELS[target.category]}
            </span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span className="truncate text-slate-400">{target.agency}</span>
          </div>
          <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-white">
            {target.name}
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">{target.region}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close target dossier"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition-colors hover:border-white/25 hover:text-white cursor-pointer"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="hud-scroll flex-1 overflow-y-auto p-4 space-y-4">
        {/* Precision Telemetry Grid */}
        <dl className="grid grid-cols-1 gap-2.5 border-b border-white/10 pb-4 text-xs">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-400 shrink-0">Coordinates</dt>
            <dd className="font-mono-tabular font-medium text-slate-100 text-right">
              {coordinatesText}
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-400 shrink-0">
              {target.category === 'satellite' ? 'Orbital Altitude' : 'Elevation'}
            </dt>
            <dd className="font-mono-tabular font-medium text-cyan-300 text-right">
              {elevationText}
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-400 shrink-0">Mission Status</dt>
            <dd className="font-medium text-emerald-400 text-right">
              {target.missionStatus}
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-slate-400 shrink-0">Reference Epoch</dt>
            <dd className="font-mono-tabular text-slate-300 text-right">
              {target.epochOrSol}
            </dd>
          </div>

          {target.orbit && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-slate-400 shrink-0">Orbital Velocity</dt>
              <dd className="font-mono-tabular text-slate-200 text-right">
                {target.orbit.orbitalVelocityKmS.toFixed(2)} km/s · {target.orbit.periodMinutes} min period
              </dd>
            </div>
          )}
        </dl>

        {/* Scientific Significance */}
        <div>
          <h3 className="font-display text-xs font-semibold tracking-wider text-slate-300 uppercase">
            Scientific Significance
          </h3>
          <p className="mt-1.5 text-xs sm:text-[13px] leading-relaxed text-slate-300">
            {target.scientificSignificance}
          </p>
        </div>

        <hr className="border-white/10" />

        {/* Astronaut Survival & Hazard Notes */}
        <div className="space-y-2.5">
          <h3 className="font-display text-xs font-semibold tracking-wider text-amber-400 uppercase flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Astronaut Survival &amp; Hazard Notes</span>
          </h3>

          <dl className="space-y-2 text-xs">
            <div>
              <dt className="text-slate-400">Slope &amp; Terrain</dt>
              <dd className="mt-0.5 text-slate-200 leading-snug">
                {target.survivalNotes.slopeSteepness}
              </dd>
            </div>

            <div>
              <dt className="text-slate-400">Dust &amp; Atmospheric Risk</dt>
              <dd className="mt-0.5 text-slate-200 leading-snug">
                {target.survivalNotes.dustRisk}
              </dd>
            </div>

            <div>
              <dt className="text-slate-400">Radiation Exposure</dt>
              <dd className="mt-0.5 text-slate-200 leading-snug">
                {target.survivalNotes.radiationLevel}
              </dd>
            </div>

            <div>
              <dt className="text-slate-400">Thermal Envelope</dt>
              <dd className="mt-0.5 font-mono-tabular text-slate-200">
                {target.survivalNotes.thermalRange}
              </dd>
            </div>
          </dl>

          <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 p-3 text-xs leading-relaxed text-amber-100/90">
            <span className="font-semibold text-amber-300">Field Advisory: </span>
            {target.survivalNotes.astronautAdvisory}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center gap-2 border-t border-white/10 bg-[#07090E]/70 p-3.5">
        <button
          type="button"
          onClick={() => onZoomToSurface(target)}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-xs font-semibold text-slate-950 transition-colors duration-150 hover:bg-orange-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 whitespace-nowrap cursor-pointer"
        >
          <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {target.category === 'satellite' ? 'Zoom to Spacecraft' : 'Zoom to Surface'}
          </span>
        </button>

        <button
          type="button"
          onClick={onResetOrbitView}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2.5 text-xs font-medium text-slate-200 transition-colors duration-150 hover:border-white/30 hover:bg-white/[0.08] whitespace-nowrap cursor-pointer"
          title="Return to global orbit"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Orbit</span>
        </button>
      </div>
    </section>
  );
}
