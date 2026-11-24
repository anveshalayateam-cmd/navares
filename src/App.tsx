import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraTelemetry, CursorTelemetry, CursorTelemetryPill } from './components/CursorTelemetryPill';
import { DropPinOverlay, DroppedPinCandidate } from './components/DropPinOverlay';
import { InfoMenu } from './components/InfoMenu';
import { LeftMarginControls } from './components/LeftMarginControls';
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
import { LiveSiteDrawPreview, SiteAnalysisOverlay } from './components/SiteAnalysisOverlay';
import { SurvivalRouteOverlay } from './components/SurvivalRouteOverlay';
import { TargetInfoCard } from './components/TargetInfoCard';
import { MarsTarget, TelemetryMode } from './data/marsData';
import { formatLatLon, formatSurfaceElevation } from './utils/marsMath';
import {
  computeSurfaceRadiationDoseFromElev,
  formatMarsSurfaceTempC,
  getMarsSurfaceTempC,
} from './utils/marsOverlayMaps';
import {
  SitePolygonVertex,
  analyzeMarsSitePolygon,
  sampleMarsWaterAvailability,
} from './utils/marsWaterModel';
import {
  LiveOrbiterElements,
  loadCachedOrbiterElements,
  refreshOrbiterEphemerides,
} from './services/marsOrbiterSync';
import {
  RoverTelemetryFix,
  loadCachedRoverTelemetry,
  refreshLiveRoverTelemetry,
} from './services/marsRoverTelemetry';
import {
  FALLBACK_WEATHER_STATIONS,
  MarsWeatherStation,
  fetchMarsWeatherTelemetry,
} from './services/marsWeather';
import { RouteEndpoint, SurvivalRouteResult } from './utils/marsPathfinder';

export default function App() {
  const globeRef = useRef<MarsGlobeHandle | null>(null);
  const [globeReady, setGlobeReady] = useState(false);

  const [selectedTarget, setSelectedTarget] = useState<MarsTarget | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyleMode>('optical');
  const [temperatureLs, setTemperatureLs] = useState<number>(0);
  const [telemetryMode, setTelemetryMode] = useState<TelemetryMode>('realtime');
  const [headingRad, setHeadingRad] = useState<number>(0);
  const [cameraTelemetry, setCameraTelemetry] = useState<CameraTelemetry | null>(null);
  const [sunShadowEnabled, setSunShadowEnabled] = useState<boolean>(true);
  const [gridEnabled, setGridEnabled] = useState<boolean>(false);
  const [showSatellites, setShowSatellites] = useState<boolean>(false);
  const [showRovers, setShowRovers] = useState<boolean>(false);

  const [weatherEnabled, setWeatherEnabled] = useState<boolean>(false);
  const [weatherStations, setWeatherStations] = useState<MarsWeatherStation[]>(
    FALLBACK_WEATHER_STATIONS
  );
  const weatherFetchedRef = useRef<boolean>(false);

  const [liveRovers, setLiveRovers] = useState<Record<string, RoverTelemetryFix>>(() =>
    loadCachedRoverTelemetry()
  );
  const [liveOrbiterElements, setLiveOrbiterElements] = useState<
    Record<string, LiveOrbiterElements>
  >(() => loadCachedOrbiterElements());
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

  // Drop Temporary Session Pin state
  const [dropPinMode, setDropPinMode] = useState<boolean>(false);
  const [pendingDropPoint, setPendingDropPoint] = useState<DroppedPinCandidate | null>(null);
  const [customPins, setCustomPins] = useState<MarsTarget[]>([]);

  // Pencil Freehand Site Habitability Analysis state
  const [siteAnalysisMode, setSiteAnalysisMode] = useState<boolean>(false);
  const [siteIsDrawing, setSiteIsDrawing] = useState<boolean>(false);
  const [siteLivePreview, setSiteLivePreview] = useState<LiveSiteDrawPreview | null>(null);
  const [sitePolygon, setSitePolygon] = useState<SitePolygonVertex[] | null>(null);

  const siteAnalysisResult = useMemo(
    () =>
      sitePolygon && sitePolygon.length >= 3
        ? analyzeMarsSitePolygon(sitePolygon, temperatureLs)
        : null,
    [sitePolygon, temperatureLs]
  );

  // Fetch NASA MSL REMS surface weather when Weather overlay is toggled ON
  useEffect(() => {
    if (!weatherEnabled || weatherFetchedRef.current) return;
    weatherFetchedRef.current = true;
    fetchMarsWeatherTelemetry().then((stations) => {
      setWeatherStations(stations);
    });
  }, [weatherEnabled]);

  // Synchronize live rover waypoints & JPL Horizons orbiter ephemeris with localStorage fallback
  useEffect(() => {
    let cancelled = false;

    const syncTelemetry = () => {
      refreshLiveRoverTelemetry(loadCachedRoverTelemetry()).then((updated) => {
        if (!cancelled) setLiveRovers(updated);
      });
      refreshOrbiterEphemerides(loadCachedOrbiterElements()).then((updated) => {
        if (!cancelled) setLiveOrbiterElements(updated);
      });
    };

    syncTelemetry();

    const handleOnline = () => syncTelemetry();
    const handleOffline = () => {
      setLiveRovers((prev) => {
        const next: Record<string, RoverTelemetryFix> = {};
        for (const [id, fix] of Object.entries(prev)) {
          next[id] = { ...fix, status: 'offline-fallback' };
        }
        return next;
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const intervalId = window.setInterval(syncTelemetry, 300_000);

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.clearInterval(intervalId);
    };
  }, []);

  const handleSearchSelectAndFly = useCallback((target: MarsTarget) => {
    if (target.category === 'satellite') {
      setShowSatellites(true);
    } else if (target.category === 'rover') {
      setShowRovers(true);
    }
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
        globeRef.current?.clearSiteSelection();
        setRouteMode(false);
        setDropPinMode(false);
        setPendingDropPoint(null);
        setSiteAnalysisMode(false);
        setSiteIsDrawing(false);
        setSitePolygon(null);
      }
      return next;
    });
  }, []);

  const handleToggleRouteMode = useCallback(() => {
    setRouteMode((prev) => {
      const next = !prev;
      if (next) {
        globeRef.current?.clearMeasurement();
        globeRef.current?.clearSiteSelection();
        setMeasureMode(false);
        setDropPinMode(false);
        setPendingDropPoint(null);
        setSiteAnalysisMode(false);
        setSiteIsDrawing(false);
        setSitePolygon(null);
      }
      return next;
    });
  }, []);

  const handleToggleDropPin = useCallback(() => {
    setDropPinMode((prev) => {
      const next = !prev;
      setPendingDropPoint(null);
      if (next) {
        globeRef.current?.clearMeasurement();
        globeRef.current?.clearSurvivalRoute();
        globeRef.current?.clearSiteSelection();
        setMeasureMode(false);
        setRouteMode(false);
        setSiteAnalysisMode(false);
        setSiteIsDrawing(false);
        setSitePolygon(null);
      }
      return next;
    });
  }, []);

  const handleToggleSiteAnalysis = useCallback(() => {
    setSiteAnalysisMode((prev) => {
      const next = !prev;
      if (next) {
        globeRef.current?.clearMeasurement();
        globeRef.current?.clearSurvivalRoute();
        globeRef.current?.clearSiteSelection();
        setMeasureMode(false);
        setRouteMode(false);
        setDropPinMode(false);
        setPendingDropPoint(null);
        setSiteIsDrawing(false);
        setSitePolygon(null);
      } else if (!sitePolygon) {
        globeRef.current?.clearSiteSelection();
      }
      return next;
    });
  }, [sitePolygon]);

  const handleConfirmCustomPin = useCallback(
    (name: string) => {
      if (!pendingDropPoint) return;
      const { latDeg, lonDeg, elevMeters } = pendingDropPoint;
      const dose = computeSurfaceRadiationDoseFromElev(elevMeters);
      const radSeverity: MarsTarget['radiationSeverity'] =
        dose >= 0.78 ? 'critical' : dose >= 0.55 ? 'moderate' : 'sheltered';
      const tesTemp = getMarsSurfaceTempC(latDeg, lonDeg, temperatureLs);
      const water = sampleMarsWaterAvailability(latDeg, lonDeg);
      const id = `__custom-pin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const shortName = name.length > 22 ? `${name.slice(0, 20).trim()}…` : name;

      const created: MarsTarget = {
        id,
        name,
        shortName,
        category: 'landmark',
        region: 'Custom Session Location',
        latitude: latDeg,
        longitude: lonDeg,
        elevationLabel: `${formatSurfaceElevation(elevMeters)} (MOLA Model)`,
        elevationMeters: elevMeters,
        surfaceRadiation: `${dose.toFixed(2)} mSv/day · ${radSeverity === 'critical' ? 'High Exposure' : radSeverity === 'moderate' ? 'Moderate' : 'Sheltered'}`,
        radiationSeverity: radSeverity,
        surfaceTempRange:
          tesTemp !== null ? `${formatMarsSurfaceTempC(tesTemp)} daytime TES` : 'Outside TES coverage',
        missionStatus: 'Temporary Session Pin',
        agency: 'User Waypoint',
        epochOrSol: formatLatLon(latDeg, lonDeg, 2),
        scientificSignificance: `Session-only waypoint pinned at ${formatLatLon(latDeg, lonDeg, 3)}. NASA Odyssey surface hydration reads ${water.waterWtPct.toFixed(2)} wt% (${water.source}; ${water.tier}).`,
        searchKeywords: `custom pin session waypoint ${name}`,
        photoUrl: '',
        photoCaption: `Procedural Martian Surface View · ${name}`,
        survivalNotes: {
          slopeSteepness: 'Inspect local contour relief with Measure / Pencil tools',
          dustRisk: 'Seasonal Martian airborne dust varies with solar longitude (Ls)',
          radiationLevel: `${dose.toFixed(2)} mSv/day (~${Math.round(dose * 365.25)} mSv/yr)`,
          thermalRange: formatMarsSurfaceTempC(tesTemp),
          astronautAdvisory: `Hydration potential: ${water.waterWtPct.toFixed(2)} wt% H2O (${water.tier}). Temporary pin clears when the browser session ends.`,
        },
        isCustomPin: true,
      };

      setCustomPins((prev) => [created, ...prev]);
      setPendingDropPoint(null);
      setDropPinMode(false);
      setSelectedTarget(created);
    },
    [pendingDropPoint, temperatureLs]
  );

  const handleDeleteCustomPin = useCallback((pinId: string) => {
    setCustomPins((prev) => prev.filter((p) => p.id !== pinId));
    setSelectedTarget((prev) => (prev?.id === pinId ? null : prev));
  }, []);

  const handleReselectSiteArea = useCallback(() => {
    globeRef.current?.clearSiteSelection();
    setSiteIsDrawing(false);
    setSitePolygon(null);
    setSiteAnalysisMode(true);
  }, []);

  const handleCloseSiteAnalysis = useCallback(() => {
    globeRef.current?.clearSiteSelection();
    setSiteIsDrawing(false);
    setSitePolygon(null);
    setSiteAnalysisMode(false);
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

  const handleStartZoomIn = useCallback(() => globeRef.current?.startZoomIn(), []);
  const handleStartZoomOut = useCallback(() => globeRef.current?.startZoomOut(), []);
  const handleStopZoom = useCallback(() => globeRef.current?.stopZoom(), []);
  const handleWheelZoom = useCallback((deltaY: number) => globeRef.current?.wheelZoom(deltaY), []);

  // Keyboard shortcuts: Escape exits active tools or closes Knowledge Card, R resets globe
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'Escape') {
        if (pendingDropPoint) {
          setPendingDropPoint(null);
        } else if (dropPinMode) {
          setDropPinMode(false);
        } else if (siteAnalysisMode || sitePolygon) {
          globeRef.current?.clearSiteSelection();
          setSiteIsDrawing(false);
          setSitePolygon(null);
          setSiteAnalysisMode(false);
        } else if (measureMode) {
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
  }, [measureMode, routeMode, routeResult, dropPinMode, pendingDropPoint, siteAnalysisMode, sitePolygon]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-slate-100">
      {/* 90%+ Full-Viewport 3D Mars Globe */}
      <MarsGlobe
        ref={globeRef}
        selectedTargetId={selectedTarget?.id ?? null}
        mapStyle={mapStyle}
        temperatureLs={temperatureLs}
        sunShadowEnabled={sunShadowEnabled}
        gridEnabled={gridEnabled}
        telemetryMode={telemetryMode}
        weatherEnabled={weatherEnabled}
        measureMode={measureMode}
        routeMode={routeMode}
        dropPinMode={dropPinMode}
        siteAnalysisMode={siteAnalysisMode}
        customPins={customPins}
        showSatellites={showSatellites}
        showRovers={showRovers}
        liveRovers={liveRovers}
        liveOrbiterElements={liveOrbiterElements}
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
        onDropPinPoint={setPendingDropPoint}
        onSiteDrawingChange={setSiteIsDrawing}
        onSiteDrawLivePreviewChange={setSiteLivePreview}
        onSitePolygonComplete={setSitePolygon}
        onGlobeReady={setGlobeReady}
      />

      {/* Hide all chrome until the globe finishes loading */}
      {globeReady && (
        <>
      {/* Control 1: Top-Left Floating Search & Quick-Jump Pill */}
      <SearchBar
        onSelectAndFly={handleSearchSelectAndFly}
        liveRovers={liveRovers}
        customPins={customPins}
      />

      {/* Temporary Session Pin Prompt & Naming Modal */}
      <DropPinOverlay
        dropPinMode={dropPinMode}
        pendingPoint={pendingDropPoint}
        temperatureLs={temperatureLs}
        defaultPinNumber={customPins.length + 1}
        onConfirmPin={handleConfirmCustomPin}
        onCancelPending={() => setPendingDropPoint(null)}
        onExitDropPinMode={() => {
          setPendingDropPoint(null);
          setDropPinMode(false);
        }}
      />

      {/* Pencil Freehand Site Habitability Analysis Banner & Telemetry Card */}
      <SiteAnalysisOverlay
        siteAnalysisMode={siteAnalysisMode}
        isDrawing={siteIsDrawing}
        livePreview={siteLivePreview}
        result={siteAnalysisResult}
        onReselectArea={handleReselectSiteArea}
        onCloseAnalysis={handleCloseSiteAnalysis}
      />

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

      {/* Left-Margin Toggle Buttons for Satellites & Rovers */}
      <LeftMarginControls
        showSatellites={showSatellites}
        showRovers={showRovers}
        onToggleSatellites={() => {
          setShowSatellites((prev) => {
            const next = !prev;
            if (!next) {
              setSelectedTarget((sel) => (sel?.category === 'satellite' ? null : sel));
            }
            return next;
          });
        }}
        onToggleRovers={() => {
          setShowRovers((prev) => {
            const next = !prev;
            if (!next) {
              setSelectedTarget((sel) => (sel?.category === 'rover' ? null : sel));
            }
            return next;
          });
        }}
      />

      {/* Bottom-Left Real-Time Cursor Surface Coordinates & Elevation Telemetry Pill */}
      <CursorTelemetryPill telemetry={cursorTelemetry} cameraTelemetry={cameraTelemetry} />

      {/* Control 2: Bottom-Center Google Earth-Style Map Style Switcher, Weather & Analyse Site */}
      <MapStyleBar
        mapStyle={mapStyle}
        onChangeMapStyle={setMapStyle}
        temperatureLs={temperatureLs}
        onTemperatureLsChange={setTemperatureLs}
        gridEnabled={gridEnabled}
        onToggleGrid={() => setGridEnabled((enabled) => !enabled)}
        dropPinMode={dropPinMode}
        onToggleDropPin={handleToggleDropPin}
        weatherEnabled={weatherEnabled}
        onToggleWeather={() => setWeatherEnabled((prev) => !prev)}
        siteAnalysisMode={siteAnalysisMode}
        onToggleSiteAnalysis={handleToggleSiteAnalysis}
      />

      {/* Control 3: Bottom-Right Compact Navigation Controls (Route, Measure, Compass, Globe Reset, +, -) */}
      <NavControls
        headingRad={headingRad}
        tiltDeg={cameraTelemetry?.tiltDeg ?? 0}
        cameraAltitudeMeters={cameraTelemetry?.altitudeAboveEllipsoidMeters ?? null}
        measureMode={measureMode}
        routeMode={routeMode}
        sunShadowEnabled={sunShadowEnabled}
        shadowsAllowed={mapStyle === 'optical'}
        onToggleMeasure={handleToggleMeasure}
        onToggle3DView={() => globeRef.current?.toggle3DView()}
        onToggleRouteMode={handleToggleRouteMode}
        onStartZoomIn={handleStartZoomIn}
        onStartZoomOut={handleStartZoomOut}
        onStopZoom={handleStopZoom}
        onWheelZoom={handleWheelZoom}
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
          temperatureLs={temperatureLs}
          liveSatellite={liveSatellites[selectedTarget.id]}
          liveRover={liveRovers[selectedTarget.id]}
          liveOrbiter={liveOrbiterElements[selectedTarget.id]}
          weatherEnabled={weatherEnabled}
          weatherStation={weatherStations.find((s) => s.targetId === selectedTarget.id)}
          telemetryMode={telemetryMode}
          onChangeTelemetryMode={setTelemetryMode}
          onZoomToSurface={handleZoomToSurface}
          onDeleteCustomPin={handleDeleteCustomPin}
          onClose={() => setSelectedTarget(null)}
        />
      )}

      {/* Top-Right 3-Dot Menu */}
      <InfoMenu hasTargetCardOpen={Boolean(selectedTarget)} />
        </>
      )}
    </main>
  );
}
