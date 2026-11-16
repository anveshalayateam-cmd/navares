import { MapPin, X } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { formatLatLon, formatSurfaceElevation } from '../utils/marsMath';
import {
  computeSurfaceRadiationDoseFromElev,
  formatMarsSurfaceTempC,
  getMarsSurfaceTempC,
} from '../utils/marsOverlayMaps';
import { sampleMarsWaterAvailability } from '../utils/marsWaterModel';

export interface DroppedPinCandidate {
  latDeg: number;
  lonDeg: number;
  elevMeters: number;
}

interface DropPinOverlayProps {
  dropPinMode: boolean;
  pendingPoint: DroppedPinCandidate | null;
  temperatureLs: number;
  defaultPinNumber: number;
  onConfirmPin: (name: string) => void;
  onCancelPending: () => void;
  onExitDropPinMode: () => void;
}

export function DropPinOverlay({
  dropPinMode,
  pendingPoint,
  temperatureLs,
  defaultPinNumber,
  onConfirmPin,
  onCancelPending,
  onExitDropPinMode,
}: DropPinOverlayProps) {
  const [pinName, setPinName] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (pendingPoint) {
      setPinName(`Session Pin ${defaultPinNumber}`);
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 15);
    }
  }, [pendingPoint, defaultPinNumber]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = pinName.trim() || `Session Pin ${defaultPinNumber}`;
    onConfirmPin(cleaned);
  };

  if (!dropPinMode && !pendingPoint) return null;

  const dose = pendingPoint
    ? computeSurfaceRadiationDoseFromElev(pendingPoint.elevMeters)
    : null;
  const tempC = pendingPoint
    ? getMarsSurfaceTempC(pendingPoint.latDeg, pendingPoint.lonDeg, temperatureLs)
    : null;
  const water = pendingPoint
    ? sampleMarsWaterAvailability(pendingPoint.latDeg, pendingPoint.lonDeg)
    : null;

  return (
    <>
      {dropPinMode && !pendingPoint && (
        <div
          role="status"
          className="pointer-events-auto fixed top-[60px] sm:top-[68px] left-2.5 right-2.5 sm:right-auto sm:left-4 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-400/35 bg-[#0B0F17]/90 px-3 py-1.5 sm:px-3.5 sm:py-2 backdrop-blur-md shadow-2xl sm:max-w-[min(26rem,calc(100vw-2rem))]"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden="true" />
            <span className="text-[11px] sm:text-xs text-slate-100 leading-snug">
              Click anywhere on Mars to drop a temporary session pin
            </span>
          </div>
          <button
            type="button"
            onClick={onExitDropPinMode}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/20 hover:text-white cursor-pointer whitespace-nowrap"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            <span>Cancel</span>
          </button>
        </div>
      )}

      {pendingPoint && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="drop-pin-dialog-title"
          onClick={onCancelPending}
          onPointerDown={(e) => e.stopPropagation()}
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-sky-400/35 bg-[#0B0F17]/95 p-4 sm:p-5 text-slate-100 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sky-400/35 bg-sky-500/15 text-sky-300">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2
                    id="drop-pin-dialog-title"
                    className="font-display text-sm sm:text-base font-bold text-white"
                  >
                    Name Temporary Pin
                  </h2>
                  <p className="truncate font-mono-tabular text-[11px] text-slate-400">
                    {formatLatLon(pendingPoint.latDeg, pendingPoint.lonDeg, 4)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCancelPending}
                aria-label="Cancel pin creation"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="hud-scroll mt-3.5 sm:mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
              <div>
                <label
                  htmlFor="custom-pin-name"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Location Name (active for this session)
                </label>
                <input
                  id="custom-pin-name"
                  ref={inputRef}
                  type="text"
                  maxLength={48}
                  value={pinName}
                  onChange={(e) => setPinName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      onCancelPending();
                    }
                  }}
                  placeholder="Enter a name for this Martian site..."
                  className="w-full rounded-xl border border-white/15 bg-white/[0.05] px-3.5 py-2 sm:py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/25"
                />
              </div>

              <dl className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px]">
                <div>
                  <dt className="text-slate-400">Elevation</dt>
                  <dd className="font-mono-tabular font-semibold text-cyan-300">
                    {formatSurfaceElevation(pendingPoint.elevMeters)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Radiation</dt>
                  <dd className="font-mono-tabular font-semibold text-emerald-300">
                    {dose !== null ? `${dose.toFixed(2)} mSv/day` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">TES Surface Temp</dt>
                  <dd className="font-mono-tabular font-semibold text-amber-300">
                    {formatMarsSurfaceTempC(tempC)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Odyssey H2O</dt>
                  <dd className="font-mono-tabular font-semibold text-sky-300">
                    {water ? `${water.waterWtPct.toFixed(2)} wt%` : '—'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-4 sm:mt-5 flex shrink-0 items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancelPending}
                className="h-9 sm:h-10 rounded-xl border border-white/15 bg-white/[0.05] px-4 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-9 sm:h-10 rounded-xl bg-sky-400 px-4 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-300 cursor-pointer"
              >
                Drop Pin
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
