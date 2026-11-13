import { useCallback, useEffect, useRef, useState } from 'react';
import { CursorTelemetry, CursorTelemetryPill } from './components/CursorTelemetryPill';
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
import { TargetInfoCard } from './components/TargetInfoCard';
import { ProjectedWeatherBadge, WeatherBadges } from './components/WeatherBadges';
import { MARS_TARGETS, MarsTarget, TelemetryMode } from './data/marsData';
import {
  FALLBACK_WEATHER_STATIONS,
  MarsWeatherStation,
  fetchMarsWeatherTelemetry,
} from './services/marsWeather';

export default function App() {
  const globeRef = useRef<MarsGlobeHandle | null>(null);

  const [selectedTarget, setSelectedTarget] = useState<MarsTarget | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyleMode>('optical');
  const [telemetryMode, setTelemetryMode] = useState<TelemetryMode>('realtime');
  const [headingRad, setHeadingRad] = useState<number>(0);

  const [weatherEnabled, setWeatherEnabled] = useState<boolean>(false);
  const [weatherStations, setWeatherStations] = useState<MarsWeatherStation[]>(
    FALLBACK_WEATHER_STATIONS
  );
  const [weatherBadges, setWeatherBadges] = useState<ProjectedWeatherBadge[]>([]);
  const weatherFetchedRef = useRef<boolean>(false);

  const [liveSatellites, setLiveSatellites] = useState<Record<string, LiveSatellitePosition>>({});

  // Real-time cursor surface coordinates & MOLA elevation
  const [cursorTelemetry, setCursorTelemetry] = useState<CursorTelemetry | null>(null);

  // Two-point geodesic distance measurement tool
  const [measureMode, setMeasureMode] = useState<boolean>(false);
  const [measureHasPointA, setMeasureHasPointA] = useState<boolean>(false);
  const [measureLivePreview, setMeasureLivePreview] = useState<LiveMeasurePreview | null>(null);
  const [measureResult, setMeasureResult] = useState<MeasureResult | null>(null);

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

  const handleSelectWeatherStationTarget = useCallback((targetId: string) => {
    const matched = MARS_TARGETS.find((t) => t.id === targetId);
    if (matched) {
      setSelectedTarget(matched);
      globeRef.current?.zoomToTarget(matched);
    }
  }, []);

  const handleClearMeasurement = useCallback(() => {
    globeRef.current?.clearMeasurement();
  }, []);

  const handleExitMeasureMode = useCallback(() => {
    globeRef.current?.clearMeasurement();
    setMeasureMode(false);
  }, []);

  // Keyboard shortcuts: Escape exits Measure Mode or closes Knowledge Card, R resets globe
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'Escape') {
        if (measureMode) {
          globeRef.current?.clearMeasurement();
          setMeasureMode(false);
        } else {
          setSelectedTarget(null);
        }
      } else if (e.key === 'r' || e.key === 'R') {
        globeRef.current?.resetGlobe();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [measureMode]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-slate-100">
      {/* 90%+ Full-Viewport 3D Mars Globe */}
      <MarsGlobe
        ref={globeRef}
        selectedTargetId={selectedTarget?.id ?? null}
        mapStyle={mapStyle}
        telemetryMode={telemetryMode}
        weatherEnabled={weatherEnabled}
        weatherStations={weatherStations}
        measureMode={measureMode}
        onSelectTarget={setSelectedTarget}
        onHeadingChange={setHeadingRad}
        onLiveSatellitesUpdate={setLiveSatellites}
        onWeatherBadgesUpdate={setWeatherBadges}
        onCursorTelemetryChange={setCursorTelemetry}
        onMeasureHasPointAChange={setMeasureHasPointA}
        onMeasureLivePreviewChange={setMeasureLivePreview}
        onMeasureResultChange={setMeasureResult}
      />

      {/* Toggleable Surface Weather Telemetry Badges */}
      {weatherEnabled && (
        <WeatherBadges
          badges={weatherBadges}
          onSelectStationTarget={handleSelectWeatherStationTarget}
        />
      )}

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

      {/* Bottom-Left Real-Time Cursor Surface Coordinates & Elevation Telemetry Pill */}
      <CursorTelemetryPill telemetry={cursorTelemetry} />

      {/* Control 2: Bottom-Center Google Earth-Style Map Style Switcher & Weather Toggle */}
      <MapStyleBar
        mapStyle={mapStyle}
        onChangeMapStyle={setMapStyle}
        weatherEnabled={weatherEnabled}
        onToggleWeather={() => setWeatherEnabled((prev) => !prev)}
      />

      {/* Control 3: Bottom-Right Compact Navigation Controls (Measure, Compass, Globe Reset, +, -) */}
      <NavControls
        headingRad={headingRad}
        measureMode={measureMode}
        onToggleMeasure={() => setMeasureMode((prev) => !prev)}
        onZoomIn={() => globeRef.current?.zoomIn()}
        onZoomOut={() => globeRef.current?.zoomOut()}
        onResetNorth={() => globeRef.current?.resetNorth()}
        onResetGlobe={() => globeRef.current?.resetGlobe()}
      />

      {/* Top-Right Google Earth-Style Knowledge Card (Opens on Pin Single-Click) */}
      {selectedTarget && (
        <TargetInfoCard
          target={selectedTarget}
          liveSatellite={liveSatellites[selectedTarget.id]}
          telemetryMode={telemetryMode}
          onChangeTelemetryMode={setTelemetryMode}
          onZoomToSurface={handleZoomToSurface}
          onClose={() => setSelectedTarget(null)}
        />
      )}

      {/* Top-Right 3-Dot Menu (Details & Data Sources / About) */}
      <InfoMenu hasTargetCardOpen={Boolean(selectedTarget)} />
    </main>
  );
}
