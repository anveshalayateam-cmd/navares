import { BoxSelect, ChevronDown, ChevronUp, Droplets, Mountain, Radiation, RotateCcw, Thermometer, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDistance, formatLatLon, formatSurfaceElevation } from '../utils/marsMath';
import { SiteAnalysisResult } from '../utils/marsWaterModel';

export interface LiveSiteRectPreview {
  widthKm: number;
  heightKm: number;
  areaKm2: number;
}

interface SiteAnalysisOverlayProps {
  siteAnalysisMode: boolean;
  hasFirstCorner: boolean;
  livePreview: LiveSiteRectPreview | null;
  result: SiteAnalysisResult | null;
  onReselectArea: () => void;
  onCloseAnalysis: () => void;
}

function formatAreaKm2(areaKm2: number): string {
  if (areaKm2 < 0.01) {
    return `${Math.round(areaKm2 * 1_000_000).toLocaleString('en-US')} m²`;
  }
  if (areaKm2 < 10) {
    return `${areaKm2.toFixed(2)} km²`;
  }
  if (areaKm2 < 1000) {
    return `${areaKm2.toFixed(1)} km²`;
  }
  return `${Math.round(areaKm2).toLocaleString('en-US')} km²`;
}

function formatTemp(val: number | null): string {
  if (val === null || !Number.isFinite(val)) return 'No TES data';
  const r = Math.round(val);
  return `${r > 0 ? '+' : ''}${r}°C`;
}

export function SiteAnalysisOverlay({
  siteAnalysisMode,
  hasFirstCorner,
  livePreview,
  result,
  onReselectArea,
  onCloseAnalysis,
}: SiteAnalysisOverlayProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(false);
  }, [result?.centerLatDeg, result?.centerLonDeg, result?.areaKm2]);

  if (!siteAnalysisMode && !result) return null;

  const score = result?.habitability.overallScore ?? 0;
  const tierColors =
    score >= 80
      ? {
          ring: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300',
          bar: 'bg-emerald-400',
          accent: 'text-emerald-300',
        }
      : score >= 62
        ? {
            ring: 'border-cyan-400/50 bg-cyan-500/15 text-cyan-300',
            bar: 'bg-cyan-400',
            accent: 'text-cyan-300',
          }
        : score >= 42
          ? {
              ring: 'border-amber-400/50 bg-amber-500/15 text-amber-300',
              bar: 'bg-amber-400',
              accent: 'text-amber-300',
            }
          : {
              ring: 'border-rose-400/50 bg-rose-500/15 text-rose-300',
              bar: 'bg-rose-400',
              accent: 'text-rose-300',
            };

  return (
    <div className="pointer-events-none fixed top-[60px] sm:top-[68px] left-2.5 right-2.5 sm:right-auto sm:left-4 z-20 flex sm:w-[min(24rem,calc(100vw-2rem))] max-h-[calc(100dvh-13.5rem)] md:max-h-[calc(100dvh-9.5rem)] flex-col gap-2">
      {siteAnalysisMode && (
        <div
          role="status"
          className="pointer-events-auto flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-400/35 bg-[#0B0F17]/90 px-3 py-1.5 sm:px-3.5 sm:py-2 backdrop-blur-md shadow-2xl"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <BoxSelect className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
            <span className="text-[11px] sm:text-xs text-slate-100 leading-snug">
              {result
                ? 'Site analysis complete · Click corner on Mars to analyse another area'
                : hasFirstCorner
                  ? `Click opposite corner to finish rectangle${
                      livePreview
                        ? ` · ${formatDistance(livePreview.widthKm * 1000)} × ${formatDistance(livePreview.heightKm * 1000)}`
                        : ''
                    }`
                  : 'Click first corner on Mars to select a rectangular site'}
            </span>
          </div>
          <button
            type="button"
            onClick={onCloseAnalysis}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/20 hover:text-white cursor-pointer whitespace-nowrap"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            <span>Exit</span>
          </button>
        </div>
      )}

      {result && (
        <aside
          aria-label="Martian site habitability analysis"
          className={`pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-amber-400/30 bg-[#0B0F17]/90 backdrop-blur-md shadow-2xl ${
            collapsed ? 'shrink-0' : 'min-h-0 flex-1'
          }`}
        >
          {/* Header */}
          <div
            className={`flex shrink-0 items-start justify-between gap-2 px-3.5 py-2.5 sm:px-4 sm:py-3 ${
              collapsed ? '' : 'border-b border-white/10'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <BoxSelect className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
              <div className="min-w-0">
                <h3 className="font-display text-sm font-bold text-white">
                  Site Habitability Analysis
                </h3>
                <p className="truncate font-mono-tabular text-[11px] text-slate-400">
                  {collapsed ? (
                    <>
                      <span className={`font-semibold ${tierColors.accent}`}>
                        {result.habitability.overallScore}/100
                      </span>{' '}
                      · {formatAreaKm2(result.areaKm2)} · {result.water.meanWtPct.toFixed(1)}% H₂O
                    </>
                  ) : (
                    <>
                      {formatLatLon(result.centerLatDeg, result.centerLonDeg, 2)} ·{' '}
                      {formatAreaKm2(result.areaKm2)}
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setCollapsed((prev) => !prev)}
                aria-expanded={!collapsed}
                aria-label={collapsed ? 'Expand site habitability analysis' : 'Collapse site habitability analysis'}
                title={collapsed ? 'Expand analysis' : 'Collapse analysis'}
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              >
                {collapsed ? (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={onReselectArea}
                title="Select a new rectangular site"
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/15 hover:text-white cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span>New Area</span>
              </button>
              <button
                type="button"
                onClick={onCloseAnalysis}
                aria-label="Close site analysis"
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {!collapsed && (
            /* Scrollable Body */
            <div className="hud-scroll min-h-0 flex-1 overflow-y-auto px-3.5 py-3 sm:px-4 sm:py-3.5 space-y-3 sm:space-y-3.5 text-xs">
            {/* Habitability Condition Hero Score */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    Habitability Condition
                  </div>
                  <div className={`mt-0.5 font-display text-sm font-bold ${tierColors.accent}`}>
                    {result.habitability.tier}
                  </div>
                </div>
                <div
                  className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded-xl border ${tierColors.ring}`}
                >
                  <span className="font-mono-tabular text-lg font-bold leading-none">
                    {result.habitability.overallScore}
                  </span>
                  <span className="font-mono-tabular text-[9px] opacity-80">/ 100</span>
                </div>
              </div>

              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${tierColors.bar}`}
                  style={{ width: `${result.habitability.overallScore}%` }}
                />
              </div>

              {/* 4 Weighted Sub-Scores */}
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Water / ISRU (30%)</span>
                  <span className="font-mono-tabular font-semibold text-sky-300">
                    {result.habitability.subScores.waterIsru}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Radiation (25%)</span>
                  <span className="font-mono-tabular font-semibold text-emerald-300">
                    {result.habitability.subScores.radiationShielding}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Thermal (25%)</span>
                  <span className="font-mono-tabular font-semibold text-amber-300">
                    {result.habitability.subScores.thermalMildness}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Terrain &amp; Air (20%)</span>
                  <span className="font-mono-tabular font-semibold text-slate-200">
                    {result.habitability.subScores.terrainAndPressure}
                  </span>
                </div>
              </div>
            </div>

            {/* 4 Empirical Environmental Readouts */}
            <div className="grid grid-cols-1 gap-2">
              {/* Water Availability (NASA Odyssey) */}
              <div className="rounded-xl border border-sky-400/25 bg-sky-500/[0.06] p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-sky-300">
                    <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
                    Water Availability
                  </span>
                  <span className="font-mono-tabular font-bold text-white">
                    {result.water.meanWtPct.toFixed(2)} wt% H₂O
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 font-mono-tabular text-[10px] text-slate-300">
                  <span>
                    Range: {result.water.minWtPct.toFixed(2)}–{result.water.maxWtPct.toFixed(2)} wt%
                    {result.water.meanUncertaintyWtPct !== null
                      ? ` (±${result.water.meanUncertaintyWtPct.toFixed(2)}%)`
                      : ''}
                  </span>
                  <span>
                    {result.water.meanNsCps !== null
                      ? `${result.water.meanNsCps.toFixed(2)} n/s`
                      : ''}
                  </span>
                </div>
                <div className="text-[10px] text-sky-200/85">
                  {result.water.tier} · {result.water.primarySource}
                </div>
              </div>

              {/* Radiation Data */}
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
                    <Radiation className="h-3.5 w-3.5" aria-hidden="true" />
                    Surface Radiation
                  </span>
                  <span className="font-mono-tabular font-bold text-white">
                    {result.radiation.meanMsVDay.toFixed(2)} mSv/day
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 font-mono-tabular text-[10px] text-slate-300">
                  <span>
                    Range: {result.radiation.minMsVDay.toFixed(2)}–{result.radiation.maxMsVDay.toFixed(2)} mSv/day
                  </span>
                  <span>~{Math.round(result.radiation.annualMeanMsV)} mSv/yr</span>
                </div>
                <div className="text-[10px] text-emerald-200/85">
                  MSL RAD Calibrated · {result.radiation.tier}
                </div>
              </div>

              {/* Temperature Data */}
              <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-amber-300">
                    <Thermometer className="h-3.5 w-3.5" aria-hidden="true" />
                    Daytime Temperature
                  </span>
                  <span className="font-mono-tabular font-bold text-white">
                    {formatTemp(result.temperature.meanC)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 font-mono-tabular text-[10px] text-slate-300">
                  <span>
                    Range: {formatTemp(result.temperature.minC)} to{' '}
                    {formatTemp(result.temperature.maxC)}
                  </span>
                  <span>Ls {result.temperature.solarLongitudeLs}°</span>
                </div>
                <div className="text-[10px] text-amber-200/85">
                  NASA MGS TES Retrievals · {result.temperature.validCoveragePct}% bin coverage
                </div>
              </div>

              {/* Elevation Data */}
              <div className="rounded-xl border border-white/12 bg-white/[0.04] p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-cyan-300">
                    <Mountain className="h-3.5 w-3.5" aria-hidden="true" />
                    Elevation &amp; Relief
                  </span>
                  <span className="font-mono-tabular font-bold text-white">
                    {formatSurfaceElevation(result.elevation.meanMeters)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 font-mono-tabular text-[10px] text-slate-300">
                  <span>
                    Min {formatSurfaceElevation(result.elevation.minMeters)} · Max{' '}
                    {formatSurfaceElevation(result.elevation.maxMeters)}
                  </span>
                  <span>Δh {Math.round(result.elevation.reliefMeters).toLocaleString()} m</span>
                </div>
                <div className="font-mono-tabular text-[10px] text-slate-400">
                  Mean slope ~{result.elevation.meanSlopeDeg.toFixed(1)}° ·{' '}
                  {result.elevation.surfacePressureMbar.toFixed(1)} mbar ·{' '}
                  {formatDistance(result.widthKm * 1000)} × {formatDistance(result.heightKm * 1000)}
                </div>
              </div>
            </div>

            {/* Assessment Summary & Advisories */}
            <div className="border-t border-white/10 pt-2.5 space-y-1.5">
              <p className="text-[11px] leading-relaxed text-slate-200">
                {result.habitability.summary}
              </p>
              <ul className="space-y-1 text-[11px] leading-snug text-slate-300">
                {result.habitability.advisories.map((note) => (
                  <li key={note} className="flex items-start gap-1.5">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-300" aria-hidden="true" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          )}
        </aside>
      )}
    </div>
  );
}
