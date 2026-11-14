import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraTelemetry, CursorTelemetry, CursorTelemetryPill } from './components/CursorTelemetryPill';
import { InfoMenu } from './components/InfoMenu';
import { MapStyleBar, MapStyleMode } from './components/MapStyleBar';
import {
  LiveSatellitePosition,
  MarsGlobe,
  MarsGlobeHandle,
} from './components/MarsGlobe';
import {
  LiveMeasurePreview,
  MeasureResult,
  MeasureToolOverlay,
} from './components/MeasureToolOverlay';
import { NavControls } from './components/NavControls';
import { SearchBar } from './components/SearchBar';
import { SurvivalRouteOverlay } from './components/SurvivalRouteOverlay';
import { TargetInfoCard } from './components/TargetInfoCard';
import { MarsTarget, TelemetryMode } from './data/marsData';
import {
  FALLBACK_WEATHER_STATIONS,
  MarsWeatherStation,
  fetchMarsWeatherTelemetry,
} from './services/marsWeather';
import { RouteEndpoint, SurvivalRouteResult } from './utils/marsPathfinder';

export default function App() {
  const globeRef = useRef<MarsGlobeHandle | null>(null);

  const [selectedTarget, setSelectedTarget] = useState<MarsTarget | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyleMode>('optical');
  const [telemetryMode, setTelemetryMode] = useState<TelemetryMode>('realtime');
  const [headingRad, setHeadingRad] = useState<number>(0);
  const [cameraTelemetry, setCameraTelemetry] = useState<CameraTelemetry | null>(null);
  const [sunShadowEnabled, setSunShadowEnabled] = useState<boolean>(true);
  const [gridEnabled, setGridEnabled] = useState<boolean>(false);

  const [weatherEnabled, setWeatherEnabled] = useState<boolean>(false);
  const [weatherStations, setWeatherStations] = useState<MarsWeatherStation[]>(
    FALLBACK_WEATHER_STATIONS
  );
  const weatherFetchedRef = useRef<boolean>(false);

  const [liveSatellites, setLiveSatellites] = useState<Record<string, LiveSatellitePosition>>({});

  // Real-time cursor surface coordinates & MOLA elevation
  const [cursorTelemetry, setCursorTelemetry] = useState<CursorTelemetry | null>(null);

  // Two-point geodesic distance measurement tool
  const [measureMode, setMeasureMode] = useState<boolean>(false);
  const [measureHasPointA, setMeasureHasPointA] = useState<boolean>(false);
  const [measureLivePreview, setMeasureLivePreview] = useState<LiveMeasurePreview | null>(null);
  const [measureResult, setMeasureResult] = useState<MeasureResult | null>(null);

  // Multi-objective Optimal Astronaut Survival Route Pathfinder
  const [routeMode, setRouteMode] = useState<boolean>(false);
  const [routeStart, setRouteStart] = useState<RouteEndpoint | null>(null);
  const [routeResult, setRouteResult] = useState<SurvivalRouteResult | null>(null);

  // Fetch NASA MSL REMS surface weather when Weather overlay is toggled ON
  useEffect(() => {
    if (!weatherEnabled || weatherFetchedRef.current) return;
    weatherFetchedRef.current = true;
    fetchMarsWeatherTelemetry().then((stations) => {
      setWeatherStations(stations);
    });
  }, [weatherEnabled]);

  const handleSearchSelectAndFly = useCallback((target: MarsTarget) => {
    setSelectedTarget(target);
    globeRef.current?.zoomToTarget(target);
  }, []);

  const handleZoomToSurface = useCallback((target: MarsTarget) => {
    globeRef.current?.zoomToTarget(target);
  }, []);

  const handleClearMeasurement = useCallback(() => {
    globeRef.current?.clearMeasurement();
  }, []);

  const handleExitMeasureMode = useCallback(() => {
    globeRef.current?.clearMeasurement();
    setMeasureMode(false);
  }, []);

  const handleToggleMeasure = useCallback(() => {
    setMeasureMode((prev) => {
      const next = !prev;
      if (next) {
        globeRef.current?.clearSurvivalRoute();
        setRouteMode(false);
      }
      return next;
    });
  }, []);

  const handleToggleRouteMode = useCallback(() => {
    setRouteMode((prev) => {
      const next = !prev;
      if (next) {
        globeRef.current?.clearMeasurement();
        setMeasureMode(false);
      }
      return next;
    });
  }, []);

  const handleClearSurvivalRoute = useCallback(() => {
    globeRef.current?.clearSurvivalRoute();
  }, []);

  const handleExitRouteMode = useCallback(() => {
    if (!routeResult) {
      globeRef.current?.clearSurvivalRoute();
    }
    setRouteMode(false);
  }, [routeResult]);

  // Keyboard shortcuts: Escape exits Measure/Route Mode or closes Knowledge Card, R resets globe
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'Escape') {
        if (measureMode) {
          globeRef.current?.clearMeasurement();
          setMeasureMode(false);
        } else if (routeMode) {
          if (!routeResult) {
            globeRef.current?.clearSurvivalRoute();
          }
          setRouteMode(false);
        } else {
          setSelectedTarget(null);
        }
      } else if (e.key === 'r' || e.key === 'R') {
        globeRef.current?.resetGlobe();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [measureMode, routeMode, routeResult]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-slate-100">
      {/* 90%+ Full-Viewport 3D Mars Globe */}
      <MarsGlobe
        ref={globeRef}
        selectedTargetId={selectedTarget?.id ?? null}
        mapStyle={mapStyle}
        sunShadowEnabled={sunShadowEnabled}
        gridEnabled={gridEnabled}
        telemetryMode={telemetryMode}
        weatherEnabled={weatherEnabled}
        measureMode={measureMode}
        routeMode={routeMode}
        onSelectTarget={setSelectedTarget}
        onHeadingChange={setHeadingRad}
        onLiveSatellitesUpdate={setLiveSatellites}
        onCursorTelemetryChange={setCursorTelemetry}
        onCameraTelemetryChange={setCameraTelemetry}
        onMeasureHasPointAChange={setMeasureHasPointA}
        onMeasureLivePreviewChange={setMeasureLivePreview}
        onMeasureResultChange={setMeasureResult}
        onRouteStartChange={setRouteStart}
        onRouteResultChange={setRouteResult}
      />

      {/* Control 1: Top-Left Floating Search & Quick-Jump Pill */}
      <SearchBar onSelectAndFly={handleSearchSelectAndFly} />

      {/* Geodesic Measure Tool Banner, Live Distance Tooltip & Result Card */}
      <MeasureToolOverlay
        measureMode={measureMode}
        hasPointA={measureHasPointA}
        livePreview={measureLivePreview}
        result={measureResult}
        onClearMeasurement={handleClearMeasurement}
        onExitMeasureMode={handleExitMeasureMode}
      />

      {/* Optimal Astronaut Survival Pathfinder Banner & Telemetry Card */}
      <SurvivalRouteOverlay
        routeMode={routeMode}
        startPoint={routeStart}
        routeResult={routeResult}
        onClearRoute={handleClearSurvivalRoute}
        onExitRouteMode={handleExitRouteMode}
      />

      {/* Bottom-Left Real-Time Cursor Surface Coordinates & Elevation Telemetry Pill */}
      <CursorTelemetryPill telemetry={cursorTelemetry} cameraTelemetry={cameraTelemetry} />

      {/* Control 2: Bottom-Center Google Earth-Style Map Style Switcher & Weather Toggle */}
      <MapStyleBar
        mapStyle={mapStyle}
        onChangeMapStyle={setMapStyle}
        gridEnabled={gridEnabled}
        onToggleGrid={() => setGridEnabled((enabled) => !enabled)}
        weatherEnabled={weatherEnabled}
        onToggleWeather={() => setWeatherEnabled((prev) => !prev)}
      />

      {/* Control 3: Bottom-Right Compact Navigation Controls (Route, Measure, Compass, Globe Reset, +, -) */}
      <NavControls
        headingRad={headingRad}
        tiltDeg={cameraTelemetry?.tiltDeg ?? 0}
        cameraAltitudeMeters={cameraTelemetry?.altitudeAboveEllipsoidMeters ?? null}
        measureMode={measureMode}
        routeMode={routeMode}
        sunShadowEnabled={sunShadowEnabled}
        onToggleMeasure={handleToggleMeasure}
        onToggle3DView={() => globeRef.current?.toggle3DView()}
        onToggleRouteMode={handleToggleRouteMode}
        onZoomIn={() => globeRef.current?.zoomIn()}
        onZoomOut={() => globeRef.current?.zoomOut()}
        onResetNorth={() => globeRef.current?.resetNorth()}
        onResetGlobe={() => globeRef.current?.resetGlobe()}
        onSetTilt={(tiltDeg) => globeRef.current?.setCameraTilt(tiltDeg)}
        onSetHeading={(headingDeg) => globeRef.current?.setCameraHeading(headingDeg)}
        onToggleSunShadow={() => setSunShadowEnabled((enabled) => !enabled)}
      />

      {/* Top-Right Google Earth-Style Knowledge Card (Opens on Pin Single-Click) */}
      {selectedTarget && (
        <TargetInfoCard
          target={selectedTarget}
          liveSatellite={liveSatellites[selectedTarget.id]}
          weatherEnabled={weatherEnabled}
          weatherStation={weatherStations.find((s) => s.targetId === selectedTarget.id)}
          telemetryMode={telemetryMode}
          onChangeTelemetryMode={setTelemetryMode}
          onZoomToSurface={handleZoomToSurface}
          onClose={() => setSelectedTarget(null)}
        />
      )}

      {/* Top-Right 3-Dot Menu */}
      <InfoMenu hasTargetCardOpen={Boolean(selectedTarget)} />
    </main>
  );
}
