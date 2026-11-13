import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlSidebar } from './components/ControlSidebar';
import {
  CursorTelemetry,
  LiveSatellitePosition,
  MarsGlobe,
  MarsGlobeHandle,
} from './components/MarsGlobe';
import { MissionHeader } from './components/MissionHeader';
import { TargetInfoCard } from './components/TargetInfoCard';
import {
  CATEGORY_COLORS,
  MapLayerState,
  MarsTarget,
  TargetCategory,
  TelemetryMode,
} from './data/marsData';
import { MartianSolTime, computeMartianSol } from './utils/marsMath';

export default function App() {
  const globeRef = useRef<MarsGlobeHandle | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [selectedTarget, setSelectedTarget] = useState<MarsTarget | null>(null);
  const [telemetryMode, setTelemetryMode] = useState<TelemetryMode>('realtime');
  const [tileWarning, setTileWarning] = useState<string | null>(null);

  const [visibleCategories, setVisibleCategories] = useState<Record<TargetCategory, boolean>>({
    rover: true,
    satellite: true,
    landmark: true,
  });

  const [layers, setLayers] = useState<MapLayerState>({
    baseImagery: true,
    molaOverlay: false,
    slopeHazardMode: false,
    roverTraverses: true,
    orbitTrails: true,
    hazardZones: true,
  });

  const [cursorTelemetry, setCursorTelemetry] = useState<CursorTelemetry>({
    latitude: null,
    longitude: null,
    elevationMeters: null,
    cameraAltitudeKm: 9200,
  });

  const [liveSatellites, setLiveSatellites] = useState<Record<string, LiveSatellitePosition>>({});

  const simStartRef = useRef<number>(Date.now());
  const [solTime, setSolTime] = useState<MartianSolTime>(() => computeMartianSol(Date.now()));

  // Live Martian Sol Clock ticker (updates every 1s; advances accelerated MTC in 100x mode)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedSec = (now - simStartRef.current) / 1000;
      const mult = telemetryMode === 'simulation100x' ? 100 : 1;
      setSolTime(computeMartianSol(now, mult, elapsedSec));
    }, 1000);

    return () => clearInterval(interval);
  }, [telemetryMode]);

  const handleResetOrbitView = useCallback(() => {
    globeRef.current?.resetOrbitView();
  }, []);

  const handleZoomToSurface = useCallback((target: MarsTarget) => {
    globeRef.current?.flyToTarget(target);
  }, []);

  const handleJumpToTarget = useCallback((target: MarsTarget) => {
    setSelectedTarget(target);
    globeRef.current?.flyToTarget(target);
  }, []);

  const handleToggleCategory = useCallback((category: TargetCategory) => {
    setVisibleCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  }, []);

  const handleToggleLayer = useCallback((layerKey: keyof MapLayerState) => {
    setLayers((prev) => ({
      ...prev,
      [layerKey]: !prev[layerKey],
    }));
  }, []);

  // Keyboard shortcuts: Escape closes info card, R resets orbit view
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'Escape') {
        setSelectedTarget(null);
      } else if (e.key === 'r' || e.key === 'R') {
        handleResetOrbitView();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleResetOrbitView]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#05070B] text-slate-100">
      {/* Full-Viewport 3D CesiumJS Mars Globe */}
      <MarsGlobe
        ref={globeRef}
        selectedTargetId={selectedTarget?.id ?? null}
        visibleCategories={visibleCategories}
        layers={layers}
        telemetryMode={telemetryMode}
        onSelectTarget={setSelectedTarget}
        onCursorTelemetry={setCursorTelemetry}
        onLiveSatellitesUpdate={setLiveSatellites}
        onTileWarning={setTileWarning}
      />

      {/* Top Mission Control Header */}
      <MissionHeader
        solTime={solTime}
        cursorTelemetry={cursorTelemetry}
        telemetryMode={telemetryMode}
        onResetOrbitView={handleResetOrbitView}
      />

      {/* Left Collapsible Navigation & Layer Sidebar */}
      <ControlSidebar
        isOpen={sidebarOpen}
        onToggleOpen={() => setSidebarOpen((prev) => !prev)}
        visibleCategories={visibleCategories}
        onToggleCategory={handleToggleCategory}
        layers={layers}
        onToggleLayer={handleToggleLayer}
        telemetryMode={telemetryMode}
        onChangeTelemetryMode={setTelemetryMode}
        selectedTargetId={selectedTarget?.id ?? null}
        onJumpToTarget={handleJumpToTarget}
        liveSatellites={liveSatellites}
      />

      {/* Right Glassmorphism Mission Control Info Card */}
      {selectedTarget && (
        <TargetInfoCard
          target={selectedTarget}
          liveSatellite={liveSatellites[selectedTarget.id]}
          onZoomToSurface={handleZoomToSurface}
          onResetOrbitView={handleResetOrbitView}
          onClose={() => setSelectedTarget(null)}
        />
      )}

      {/* Tile Network Warning Toast (Non-blocking fallback notice) */}
      {tileWarning && (
        <div
          role="status"
          className="pointer-events-auto fixed top-24 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-lg border border-amber-500/35 bg-[#0B0F17]/90 px-4 py-2 text-xs text-amber-200 backdrop-blur-md shadow-xl"
        >
          <span>{tileWarning}</span>
          <button
            type="button"
            onClick={() => setTileWarning(null)}
            className="text-amber-400 hover:text-amber-200 font-medium cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Subtle Bottom-Right Symbology & Interaction Guide */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-10 hidden sm:flex items-center gap-3 rounded-lg border border-white/10 bg-[#0B0F17]/78 px-3.5 py-2 text-[11px] text-slate-300 backdrop-blur-md">
        <div className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: CATEGORY_COLORS.rover }}
            aria-hidden="true"
          />
          <span>Rovers</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: CATEGORY_COLORS.satellite }}
            aria-hidden="true"
          />
          <span>Orbiters</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: CATEGORY_COLORS.landmark }}
            aria-hidden="true"
          />
          <span>Landmarks</span>
        </div>
        <span aria-hidden="true" className="text-slate-600">
          |
        </span>
        <span className="text-slate-400">
          Click pin for dossier · Double-click to zoom
        </span>
        <span aria-hidden="true" className="text-slate-600">
          |
        </span>
        <span className="text-slate-500">NASA Mars Trek WMTS</span>
      </div>
    </main>
  );
}
