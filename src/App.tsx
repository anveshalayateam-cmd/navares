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
import { LiveSiteRectPreview, SiteAnalysisOverlay } from './components/SiteAnalysisOverlay';
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
  SiteBounds,
  analyzeMarsSiteRectangle,
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
  const [extraDetails, setExtraDetails] = useState<boolean>(false);

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

  // Rectangular Site Habitability Analysis state
  const [siteAnalysisMode, setSiteAnalysisMode] = useState<boolean>(false);
  const [siteHasCornerA, setSiteHasCornerA] = useState<boolean>(false);
  const [siteLivePreview, setSiteLivePreview] = useState<LiveSiteRectPreview | null>(null);
  const [siteBounds, setSiteBounds] = useState<SiteBounds | null>(null);

  const siteAnalysisResult = useMemo(
    () => (siteBounds ? analyzeMarsSiteRectangle(siteBounds, temperatureLs) : null),
    [siteBounds, temperatureLs]
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
        setSiteBounds(null);
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
        setSiteBounds(null);
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
        setSiteBounds(null);
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
        setSiteBounds(null);
      } else if (!siteBounds) {
        globeRef.current?.clearSiteSelection();
      }
      return next;
    });
  }, [siteBounds]);

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
          slopeSteepness: 'Inspect local contour relief with Measure / Analyse Site tools',
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
    setSiteBounds(null);
    setSiteAnalysisMode(true);
  }, []);

  const handleCloseSiteAnalysis = useCallback(() => {
    globeRef.current?.clearSiteSelection();
    setSiteBounds(null);
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
        } else if (siteAnalysisMode || siteBounds) {
          globeRef.current?.clearSiteSelection();
          setSiteBounds(null);
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
  }, [measureMode, routeMode, routeResult, dropPinMode, pendingDropPoint, siteAnalysisMode, siteBounds]);

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
        onSiteRectHasCornerAChange={setSiteHasCornerA}
        onSiteRectLivePreviewChange={setSiteLivePreview}
        onSiteRectComplete={setSiteBounds}
        extraDetails={extraDetails}
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

      {/* Opt-in Murray Lab CTX high-res detail (all map modes) */}
      <div className="pointer-events-auto fixed top-[3.75rem] left-2.5 sm:top-[4.25rem] sm:left-4 z-30">
        <button
          type="button"
          aria-pressed={extraDetails}
          aria-label={extraDetails ? 'Disable Extra Details (Murray Lab CTX)' : 'Enable Extra Details (Murray Lab CTX)'}
          title={
            extraDetails
              ? 'Hide high-resolution orbital detail (Murray Lab CTX)'
              : 'Show high-resolution orbital detail (Murray Lab CTX ~5 m/px)'
          }
          onClick={() => setExtraDetails((prev) => !prev)}
          className={`group flex h-9 md:h-10 items-center justify-center rounded-2xl border px-2.5 md:px-3 text-xs font-medium backdrop-blur-md shadow-2xl transition-all duration-200 cursor-pointer whitespace-nowrap hover:px-3.5 focus-visible:px-3.5 ${
            extraDetails
              ? 'border-amber-400/60 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30'
              : 'border-white/15 bg-[#0B0F17]/82 text-slate-200 hover:bg-white/10 hover:text-white'
          }`}
        >
          <svg
            className={`h-4 w-4 shrink-0 ${extraDetails ? 'text-amber-300' : 'text-slate-400'}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
          <span className="max-w-0 overflow-hidden opacity-0 transition-all duration-200 group-hover:ml-2 group-hover:max-w-[14rem] group-hover:opacity-100 group-focus-visible:ml-2 group-focus-visible:max-w-[14rem] group-focus-visible:opacity-100">
            Extra Details
          </span>
        </button>
      </div>

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

      {/* Rectangular Site Habitability Analysis Banner & Telemetry Card */}
      <SiteAnalysisOverlay
        siteAnalysisMode={siteAnalysisMode}
        hasFirstCorner={siteHasCornerA}
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
        onStartZoomIn={handleStartZoomIn}
        onStartZoomOut={handleStartZoomOut}
        onStopZoom={handleStopZoom}
        onWheelZoom={handleWheelZoom}
        measureMode={measureMode}
        onToggleMeasure={handleToggleMeasure}
        routeMode={routeMode}
        onToggleRouteMode={handleToggleRouteMode}
        sunShadowEnabled={sunShadowEnabled}
        onToggleSunShadow={() => setSunShadowEnabled((v) => !v)}
        onResetNorth={() => globeRef.current?.resetNorth()}
        onResetGlobe={() => globeRef.current?.resetGlobe()}
        onSetHeading={(deg) => globeRef.current?.setCameraHeading(deg)}
        onSetTilt={(deg) => globeRef.current?.setCameraTilt(deg)}
        onToggle3D={() => globeRef.current?.toggle3DView()}
      />

      {selectedTarget && (
        <TargetInfoCard
          target={selectedTarget}
          temperatureLs={temperatureLs}
          telemetryMode={telemetryMode}
          liveRovers={liveRovers}
          liveSatellites={liveSatellites}
          weatherEnabled={weatherEnabled}
          weatherStations={weatherStations}
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
