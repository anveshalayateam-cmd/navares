import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  CATEGORY_COLORS,
  MARS_CONSTANTS,
  MARS_TARGETS,
  MarsTarget,
  TelemetryMode,
  getMarsElevation,
} from '../data/marsData';
import { getLocationAreaInfo } from '../data/marsFeatureOutlines';
import { LiveOrbiterElements } from '../services/marsOrbiterSync';
import { RoverTelemetryFix } from '../services/marsRoverTelemetry';
import { CesiumEntity, CesiumImageryLayer, CesiumViewer } from '../types/cesium';
import {
  computeSatelliteCartesian,
  createGlowPinDataUri,
  createRoverSprite,
  createSatelliteSprite,
  sampleSatelliteOrbitArc,
} from '../utils/marsMath';
import {
  RouteEndpoint,
  SurvivalRouteResult,
  computeOptimalSurvivalRoute,
  wrapLongitudeDeg,
} from '../utils/marsPathfinder';
import {
  formatMarsSurfaceTempC,
  getMarsSurfaceTempC,
} from '../utils/marsOverlayMaps';
import {
  SiteBounds,
  computeRectangleDimensionsKm,
  getPositiveLonSpanDeg,
  normalizeSiteRectangle,
} from '../utils/marsWaterModel';
import { getGlobalMarsCloudCanvas } from '../utils/marsClouds';
import { createMarsProceduralImageryProvider } from '../utils/marsTiledProviders';
import { CameraTelemetry, CursorTelemetry } from './CursorTelemetryPill';
import { DroppedPinCandidate } from './DropPinOverlay';
import { MapStyleMode } from './MapStyleBar';
import { LiveMeasurePreview, MeasureResult } from './MeasureToolOverlay';
import { LiveSiteRectPreview } from './SiteAnalysisOverlay';

export interface LiveSatellitePosition {
  latDeg: number;
  lonDeg: number;
  altKm: number;
  velocityKmS: number;
  source?: LiveOrbiterElements['source'];
}

export interface MarsGlobeHandle {
  zoomToLocation: (lat: number, lon: number, alt?: number) => void;
  zoomToTarget: (target: MarsTarget) => void;
  startZoomIn: () => void;
  startZoomOut: () => void;
  stopZoom: () => void;
  wheelZoom: (deltaY: number) => void;
  toggle3DView: () => void;
  setCameraTilt: (tiltDeg: number) => void;
  setCameraHeading: (headingDeg: number) => void;
  resetNorth: () => void;
  resetGlobe: () => void;
  clearMeasurement: () => void;
  clearSurvivalRoute: () => void;
  clearSiteSelection: () => void;
}

interface MarsGlobeProps {
  selectedTargetId: string | null;
  mapStyle: MapStyleMode;
  temperatureLs: number;
  sunShadowEnabled: boolean;
  gridEnabled: boolean;
  telemetryMode: TelemetryMode;
  weatherEnabled: boolean;
  measureMode: boolean;
  routeMode: boolean;
  dropPinMode: boolean;
  siteAnalysisMode: boolean;
  customPins: MarsTarget[];
  showSatellites: boolean;
  showRovers: boolean;
  liveRovers: Record<string, RoverTelemetryFix>;
  liveOrbiterElements: Record<string, LiveOrbiterElements>;
  onSelectTarget: (target: MarsTarget | null) => void;
  onHeadingChange: (headingRad: number) => void;
  onLiveSatellitesUpdate: (positions: Record<string, LiveSatellitePosition>) => void;
  onCursorTelemetryChange: (telemetry: CursorTelemetry | null) => void;
  onCameraTelemetryChange: (telemetry: CameraTelemetry | null) => void;
  onMeasureHasPointAChange: (hasPointA: boolean) => void;
  onMeasureLivePreviewChange: (preview: LiveMeasurePreview | null) => void;
  onMeasureResultChange: (result: MeasureResult | null) => void;
  onRouteStartChange: (start: RouteEndpoint | null) => void;
  onRouteResultChange: (result: SurvivalRouteResult | null) => void;
  onDropPinPoint: (point: DroppedPinCandidate) => void;
  onSiteRectHasCornerAChange: (hasCornerA: boolean) => void;
  onSiteRectLivePreviewChange: (preview: LiveSiteRectPreview | null) => void;
  onSiteRectComplete: (bounds: SiteBounds) => void;
  onGlobeReady?: (ready: boolean) => void;
}

const PRIMARY_GLOBAL_LANDMARK_IDS = new Set([
  'olympus-mons',
  'valles-marineris',
  'hellas-planitia',
  'arcadia-planitia',
  'gale-crater',
  'north-polar-cap',
  'south-polar-cap',
  'tharsis-montes',
  'syrtis-major',
  'argyre-planitia',
  'korolev-crater',
  'noctis-labyrinths',
  'elysium-planitia',
  'utopia-planitia',
  'amazonis-planitia',
  'chryse-planitia',
  'airy-zero',
]);

const PRIMARY_GLOBAL_SATELLITE_IDS = new Set([
  'mro',
  'maven',
  'odyssey',
  'mars-express',
  'tgo',
  'hope',
  'mgs',
  'tianwen-1',
  'mangalyaan',
  'mars-relay-eq1',
]);

const PRIMARY_GLOBAL_ROVER_IDS = new Set([
  'perseverance',
  'curiosity',
  'zhurong',
  'opportunity',
  'spirit',
  'insight',
  'phoenix',
  'viking-1',
  'viking-2',
  'pathfinder',
  'beagle-2',
  'mars-3',
  'schiaparelli',
  'ingenuity',
  'rosalind-franklin',
]);

const MARS_TERRAIN_VERTICAL_EXAGGERATION = 2.2;

// Astronomical starfield: CesiumJS's built-in Tycho-2 star catalog cubemap (derived from the
// Hipparcos / Tycho-2 catalogues, NASA/Goddard SVS). Faces are resolved against the same Cesium
// CDN release that index.html loads so the skybox never requests a missing local asset.
const CESIUM_CDN_RELEASE_BASE =
  'https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/';
const TYCHO_STARFIELD_SKYBOX_BASE = `${CESIUM_CDN_RELEASE_BASE}Assets/Textures/SkyBox/tycho2t3_80_`;

const MIN_CAMERA_HEIGHT_METERS = 1500;
// Closer global framing to match the default Mars overview shown in the app reference.
const DEFAULT_CAMERA_HEIGHT_METERS = 12_000_000;
const MAX_CAMERA_HEIGHT_METERS = 23_000_000;
const SURFACE_SECONDARY_PIN_MAX_DIST_METERS = 4_800_000;
const CAMERA_INPUT_SENSITIVITY_MULTIPLIER = 0.6;
const ZOOM_SPEED_MULTIPLIER = 4.0;

// Rendering performance tuning: cap the WebGL backbuffer on High-DPI displays and relax
// tile detail on constrained (touch/mobile) devices so camera gliding holds 60 FPS.
const DESKTOP_MAX_RESOLUTION_SCALE = 1.25;
const MOBILE_RESOLUTION_SCALE = 1.0;
const DESKTOP_MAXIMUM_SCREEN_SPACE_ERROR = 2;
const MOBILE_MAXIMUM_SCREEN_SPACE_ERROR = 2.5;
// Disable FXAA (a full-screen post-process pass) once sustained frame rate falls below this.
const FXAA_DISABLE_FPS_THRESHOLD = 55;
const FPS_SAMPLE_WINDOW_MS = 1000;
// Cap React state churn driven by the render loop to ~10-15 updates/second.
const HEADING_THROTTLE_MS = 100;
const CURSOR_PICK_THROTTLE_MS = 66;

const isMobileOrTouchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  const coarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const touchCapable = 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
  return coarsePointer || touchCapable;
};

const CTX_MAX_ALPHA = 0.45;
const CTX_FADE_START_METERS = 900_000;
const CTX_FULL_ALPHA_METERS = 40_000;

function getCtxFadeAlpha(cameraHeightMeters: number): number {
  const progress = Math.max(
    0,
    Math.min(
      1,
      (CTX_FADE_START_METERS - cameraHeightMeters) /
        (CTX_FADE_START_METERS - CTX_FULL_ALPHA_METERS)
    )
  );
  // Smooth S-curve fade for zero pop-in during fast zoom
  const smooth = progress * progress * (3 - 2 * progress);
  return CTX_MAX_ALPHA * smooth;
}

// Clouds: full at high altitude, progressive fade as the camera zooms in.
const CLOUDS_MAX_ALPHA = 0.48;
const CLOUDS_FADE_START_METERS = 3_500_000; // begin fading below ~3500 km
const CLOUDS_FADE_END_METERS = 250_000; // fully gone near surface
const CLOUD_SHELL_ALTITUDE_METERS = 58_000;

function getCloudFadeAlpha(cameraHeightMeters: number): number {
  if (cameraHeightMeters >= CLOUDS_FADE_START_METERS) return CLOUDS_MAX_ALPHA;
  if (cameraHeightMeters <= CLOUDS_FADE_END_METERS) return 0;
  const progress =
    (cameraHeightMeters - CLOUDS_FADE_END_METERS) /
    (CLOUDS_FADE_START_METERS - CLOUDS_FADE_END_METERS);
  const smooth = progress * progress * (3 - 2 * progress);
  return CLOUDS_MAX_ALPHA * smooth;
}

// Optical color: far = classic bright mosaic; near = sandy / butterscotch of the loading image.
const COLOR_BLEND_FAR_METERS = 12_000_000;
const COLOR_BLEND_NEAR_METERS = 400_000;

const OPTICAL_COLOR_FAR = {
  hue: -0.04,
  contrast: 1.15,
  brightness: 1.0,
  saturation: 1.35,
  gamma: 0.88,
};
const OPTICAL_COLOR_NEAR = {
  hue: 0.02,
  contrast: 1.08,
  brightness: 0.96,
  saturation: 0.92,
  gamma: 0.98,
};
const CTX_COLOR_FAR = {
  hue: -0.04,
  contrast: 1.2,
  brightness: 0.94,
  saturation: 1.35,
  gamma: 0.85,
};
const CTX_COLOR_NEAR = {
  hue: 0.02,
  contrast: 1.1,
  brightness: 0.94,
  saturation: 0.92,
  gamma: 0.95,
};

function getAltitudeColorBlend(cameraHeightMeters: number): number {
  // 0 = far (original), 1 = near (image-matched sandy)
  if (cameraHeightMeters >= COLOR_BLEND_FAR_METERS) return 0;
  if (cameraHeightMeters <= COLOR_BLEND_NEAR_METERS) return 1;
  const progress =
    (COLOR_BLEND_FAR_METERS - cameraHeightMeters) /
    (COLOR_BLEND_FAR_METERS - COLOR_BLEND_NEAR_METERS);
  return progress * progress * (3 - 2 * progress);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function applyOpticalColorForAltitude(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layer: any,
  t: number,
  isOpticalMode: boolean
): void {
  if (!layer) return;
  if (!isOpticalMode) {
    layer.hue = 0.0;
    layer.contrast = 1.25;
    layer.brightness = 0.3;
    layer.saturation = 0.15;
    layer.gamma = 0.9;
    return;
  }
  // Restore every Optical grading property after scientific modes, which darken this layer.
  // Brightness is not altitude-graded: it must always return to the full default value.
  layer.hue = lerp(0.0, -0.06, t);
  layer.saturation = lerp(1.0, 1.45, t);
  layer.contrast = lerp(1.0, 1.18, t);
  layer.brightness = 1.0;
  layer.gamma = lerp(1.0, 0.82, t);
}

function applyCtxColorForAltitude(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layer: any,
  cameraHeightMeters: number
): void {
  if (!layer) return;
  const t = getAltitudeColorBlend(cameraHeightMeters);
  layer.hue = lerp(CTX_COLOR_FAR.hue, CTX_COLOR_NEAR.hue, t);
  layer.contrast = lerp(CTX_COLOR_FAR.contrast, CTX_COLOR_NEAR.contrast, t);
  layer.brightness = lerp(CTX_COLOR_FAR.brightness, CTX_COLOR_NEAR.brightness, t);
  layer.saturation = lerp(CTX_COLOR_FAR.saturation, CTX_COLOR_NEAR.saturation, t);
  layer.gamma = lerp(CTX_COLOR_FAR.gamma, CTX_COLOR_NEAR.gamma, t);
}

function getTargetPinLabel(
  target: MarsTarget,
  weatherEnabled: boolean,
  temperatureLs: number,
  latitudeDeg = target.latitude,
  longitudeDeg = target.longitude
): string {
  if (!weatherEnabled) return target.shortName;
  return `${target.shortName} • ${formatMarsSurfaceTempC(
    getMarsSurfaceTempC(latitudeDeg, longitudeDeg, temperatureLs)
  )}`;
}

export const MarsGlobe = forwardRef<MarsGlobeHandle, MarsGlobeProps>(function MarsGlobe(
  {
    selectedTargetId,
    mapStyle,
    temperatureLs,
    sunShadowEnabled,
    gridEnabled,
    telemetryMode,
    weatherEnabled,
    measureMode,
    routeMode,
    dropPinMode,
    siteAnalysisMode,
    customPins,
    showSatellites,
    showRovers,
    liveRovers,
    liveOrbiterElements,
    onSelectTarget,
    onHeadingChange,
    onLiveSatellitesUpdate,
    onCursorTelemetryChange,
    onCameraTelemetryChange,
    onMeasureHasPointAChange,
    onMeasureLivePreviewChange,
    onMeasureResultChange,
    onRouteStartChange,
    onRouteResultChange,
    onDropPinPoint,
    onSiteRectHasCornerAChange,
    onSiteRectLivePreviewChange,
    onSiteRectComplete,
    onGlobeReady,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const amberHazeOverlayRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marsEllipsoidRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marsTilingSchemeRef = useRef<any>(null);

  const vikingLayerRef = useRef<CesiumImageryLayer | null>(null);
  const ctxLayerRef = useRef<CesiumImageryLayer | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cloudShellPrimitiveRef = useRef<any>(null);
  const cloudModeBlendRef = useRef<number>(mapStyle === 'optical' ? 1 : 0);
  const reliefShadeLayerRef = useRef<CesiumImageryLayer | null>(null);
  const temperatureLayerRef = useRef<CesiumImageryLayer | null>(null);
  const loadedTemperatureLsRef = useRef<number | null>(null);
  const radiationLayerRef = useRef<CesiumImageryLayer | null>(null);
  const elevationLayerRef = useRef<CesiumImageryLayer | null>(null);
  const gridEntitiesRef = useRef<CesiumEntity[]>([]);
  const rebuildGridRef = useRef<((enabled: boolean, exaggeration: number) => void) | null>(null);
  const cameraAnimationFrameRef = useRef<number | null>(null);
  const layerTransitionFrameRef = useRef<number | null>(null);
  const lastCursorPositionRef = useRef<{ x: number; y: number } | null>(null);
  const selectedRegionEntityRef = useRef<CesiumEntity | null>(null);
  const selectedTargetIdRef = useRef<string | null>(selectedTargetId);
  const zoomHoldTimerRef = useRef<number | null>(null);
  const zoomHoldRafRef = useRef<number | null>(null);

  const pinEntitiesRef = useRef<Map<string, CesiumEntity>>(new Map());
  const spacecraftEntitiesRef = useRef<Map<string, CesiumEntity>>(new Map());
  const roverEntitiesRef = useRef<Map<string, CesiumEntity>>(new Map());
  const orbitRingEntitiesRef = useRef<Map<string, CesiumEntity>>(new Map());
  const orbitWakeEntitiesRef = useRef<Map<string, CesiumEntity>>(new Map());
  const simBoostMsRef = useRef<number>(0);

  // Measure tool refs
  const measureStateRef = useRef<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pointA: {
      cartesian: any;
      carto: any;
      latDeg: number;
      lonDeg: number;
      elevMeters: number;
      visualSample?: { latDeg: number; lonDeg: number; elev0: number; elev4: number; elev11: number };
    } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pointB: {
      cartesian: any;
      carto: any;
      latDeg: number;
      lonDeg: number;
      elevMeters: number;
      visualSample?: { latDeg: number; lonDeg: number; elev0: number; elev4: number; elev11: number };
    } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hoverCartesian: any | null;
    previewVisualSamples: Array<{
      latDeg: number;
      lonDeg: number;
      elev0: number;
      elev4: number;
      elev11: number;
    }>;
    previewSpanMeters: number;
    lockedVisualSamples: Array<{
      latDeg: number;
      lonDeg: number;
      elev0: number;
      elev4: number;
      elev11: number;
    }>;
    lockedSpanMeters: number;
    pointAEntity: CesiumEntity | null;
    pointBEntity: CesiumEntity | null;
    previewLineEntity: CesiumEntity | null;
    lockedLineEntity: CesiumEntity | null;
  }>({
    pointA: null,
    pointB: null,
    hoverCartesian: null,
    previewVisualSamples: [],
    previewSpanMeters: 0,
    lockedVisualSamples: [],
    lockedSpanMeters: 0,
    pointAEntity: null,
    pointBEntity: null,
    previewLineEntity: null,
    lockedLineEntity: null,
  });

  // Survival Route Pathfinder refs
  const routeStateRef = useRef<{
    start: RouteEndpoint | null;
    destination: RouteEndpoint | null;
    result: SurvivalRouteResult | null;
    hasResult: boolean;
    startEntity: CesiumEntity | null;
    destEntity: CesiumEntity | null;
    optimalLineEntity: CesiumEntity | null;
    directLineEntity: CesiumEntity | null;
    pulseRingEntities: CesiumEntity[];
  }>({
    start: null,
    destination: null,
    result: null,
    hasResult: false,
    startEntity: null,
    destEntity: null,
    optimalLineEntity: null,
    directLineEntity: null,
    pulseRingEntities: [],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customPinEntitiesRef = useRef<Map<string, { entity: CesiumEntity; horizonPos: any }>>(
    new Map()
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createSurfacePositionFnRef = useRef<
    ((latDeg: number, lonDeg: number, elevMeters: number, offsetMeters?: number) => any) | null
  >(null);

  // Site Habitability Rectangular Selection refs
  const siteRectStateRef = useRef<{
    cornerA: {
      latDeg: number;
      lonDeg: number;
      elevMeters: number;
      visualSample?: { latDeg: number; lonDeg: number; elev0: number; elev4: number; elev11: number };
    } | null;
    cornerB: {
      latDeg: number;
      lonDeg: number;
      elevMeters: number;
      visualSample?: { latDeg: number; lonDeg: number; elev0: number; elev4: number; elev11: number };
    } | null;
    bounds: SiteBounds | null;
    ringSamples: Array<{
      latDeg: number;
      lonDeg: number;
      elev0: number;
      elev4: number;
      elev11: number;
    }>;
    ringSpanMeters: number;
    builtDetailLevel: number | null;
    fillPrimitive: unknown | null;
    cornerAEntity: CesiumEntity | null;
    cornerBEntity: CesiumEntity | null;
    rectEntity: CesiumEntity | null;
  }>({
    cornerA: null,
    cornerB: null,
    bounds: null,
    ringSamples: [],
    ringSpanMeters: 0,
    builtDetailLevel: null,
    fillPrimitive: null,
    cornerAEntity: null,
    cornerBEntity: null,
    rectEntity: null,
  });

  const mapStyleRef = useRef<MapStyleMode>(mapStyle);
  const telemetryModeRef = useRef<TelemetryMode>(telemetryMode);
  const weatherEnabledRef = useRef<boolean>(weatherEnabled);
  const measureModeRef = useRef<boolean>(measureMode);
  const routeModeRef = useRef<boolean>(routeMode);
  const dropPinModeRef = useRef<boolean>(dropPinMode);
  const siteAnalysisModeRef = useRef<boolean>(siteAnalysisMode);
  const customPinsRef = useRef<MarsTarget[]>(customPins);
  const sunShadowEnabledRef = useRef<boolean>(sunShadowEnabled);
  const gridEnabledRef = useRef<boolean>(gridEnabled);
  const showSatellitesRef = useRef<boolean>(showSatellites);
  const showRoversRef = useRef<boolean>(showRovers);
  const liveRoversRef = useRef<Record<string, RoverTelemetryFix>>(liveRovers);
  const liveOrbiterElementsRef = useRef<Record<string, LiveOrbiterElements>>(liveOrbiterElements);
  const onSelectTargetRef = useRef(onSelectTarget);
  const onHeadingChangeRef = useRef(onHeadingChange);
  const onLiveSatellitesUpdateRef = useRef(onLiveSatellitesUpdate);
  const onCursorTelemetryChangeRef = useRef(onCursorTelemetryChange);
  const onCameraTelemetryChangeRef = useRef(onCameraTelemetryChange);
  const onMeasureHasPointAChangeRef = useRef(onMeasureHasPointAChange);
  const onMeasureLivePreviewChangeRef = useRef(onMeasureLivePreviewChange);
  const onMeasureResultChangeRef = useRef(onMeasureResultChange);
  const onRouteStartChangeRef = useRef(onRouteStartChange);
  const onRouteResultChangeRef = useRef(onRouteResultChange);
  const onDropPinPointRef = useRef(onDropPinPoint);
  const onSiteRectHasCornerAChangeRef = useRef(onSiteRectHasCornerAChange);
  const onSiteRectLivePreviewChangeRef = useRef(onSiteRectLivePreviewChange);
  const onSiteRectCompleteRef = useRef(onSiteRectComplete);

  const [webglError, setWebglError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);
  const loadingStartedAtRef = useRef<number>(performance.now());

  mapStyleRef.current = mapStyle;
  telemetryModeRef.current = telemetryMode;
  weatherEnabledRef.current = weatherEnabled;
  measureModeRef.current = measureMode;
  routeModeRef.current = routeMode;
  dropPinModeRef.current = dropPinMode;
  siteAnalysisModeRef.current = siteAnalysisMode;
  customPinsRef.current = customPins;
  sunShadowEnabledRef.current = sunShadowEnabled;
  gridEnabledRef.current = gridEnabled;
  showSatellitesRef.current = showSatellites;
  showRoversRef.current = showRovers;
  liveRoversRef.current = liveRovers;
  liveOrbiterElementsRef.current = liveOrbiterElements;
  selectedTargetIdRef.current = selectedTargetId;
  onSelectTargetRef.current = onSelectTarget;
  onHeadingChangeRef.current = onHeadingChange;
  onLiveSatellitesUpdateRef.current = onLiveSatellitesUpdate;
  onCursorTelemetryChangeRef.current = onCursorTelemetryChange;
  onCameraTelemetryChangeRef.current = onCameraTelemetryChange;
  onMeasureHasPointAChangeRef.current = onMeasureHasPointAChange;
  onMeasureLivePreviewChangeRef.current = onMeasureLivePreviewChange;
  onMeasureResultChangeRef.current = onMeasureResultChange;
  onRouteStartChangeRef.current = onRouteStartChange;
  onRouteResultChangeRef.current = onRouteResultChange;
  onDropPinPointRef.current = onDropPinPoint;
  onSiteRectHasCornerAChangeRef.current = onSiteRectHasCornerAChange;
  onSiteRectLivePreviewChangeRef.current = onSiteRectLivePreviewChange;
  onSiteRectCompleteRef.current = onSiteRectComplete;

  const getEffectiveEpochMs = () => Date.now() + simBoostMsRef.current;

  const getRoverCoords = (target: MarsTarget) => {
    const fix = liveRoversRef.current[target.id];
    if (fix) {
      return {
        latitude: fix.latitude,
        longitude: fix.longitude,
        elevationMeters: fix.elevationMeters,
      };
    }
    return {
      latitude: target.latitude,
      longitude: target.longitude,
      elevationMeters: getMarsElevation(target.latitude, target.longitude, 4),
    };
  };

  const cancelCameraOrientationAnimation = () => {
    if (cameraAnimationFrameRef.current !== null) {
      cancelAnimationFrame(cameraAnimationFrameRef.current);
      cameraAnimationFrameRef.current = null;
    }
  };

  const zoomToLocationInternal = (lat: number, lon: number, alt = 15000) => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    const marsEllipsoid = marsEllipsoidRef.current;
    if (!viewer || viewer.isDestroyed() || !Cesium || !marsEllipsoid) return;

    cancelCameraOrientationAnimation();
    viewer.trackedEntity = undefined;
    viewer.camera.cancelFlight();

    const lookAheadMeters = alt / Math.tan(Cesium.Math.toRadians(65));
    const metersPerDegLat = (Math.PI * MARS_CONSTANTS.EQUATORIAL_RADIUS) / 180;
    const latOffset = lookAheadMeters / metersPerDegLat;
    const cameraLat = Math.max(-88.5, lat - latOffset);
    const terrainHeight =
      getMarsElevation(cameraLat, lon, 4) * viewer.scene.verticalExaggeration;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        lon,
        cameraLat,
        terrainHeight + alt,
        marsEllipsoid
      ),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-65),
        roll: 0,
      },
      duration: 2.0,
      endTransform: Cesium.Matrix4.IDENTITY,
    });
  };

  const zoomToTargetInternal = (target: MarsTarget) => {
    if (target.category === 'satellite' && target.orbit) {
      const viewer = viewerRef.current;
      const Cesium = window.Cesium;
      if (!viewer || viewer.isDestroyed() || !Cesium) return;

      cancelCameraOrientationAnimation();
      viewer.trackedEntity = undefined;
      viewer.camera.cancelFlight();

      // Aim slightly ahead at 1x speed so the 2s camera flight meets the orbiter cleanly
      const targetEpochMs =
        getEffectiveEpochMs() + (telemetryModeRef.current === 'realtime' ? 1800 : 0);
      const liveElem = liveOrbiterElementsRef.current[target.id];
      const satNow = computeSatelliteCartesian(target, targetEpochMs, liveElem);
      const satNext = computeSatelliteCartesian(target, targetEpochMs + 1000, liveElem);

      const satPos = new Cesium.Cartesian3(satNow.x, satNow.y, satNow.z);
      const nextPos = new Cesium.Cartesian3(satNext.x, satNext.y, satNext.z);

      const velDir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.subtract(nextPos, satPos, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const radialUp = Cesium.Cartesian3.normalize(satPos, new Cesium.Cartesian3());

      // 25,000 m behind (-0.92 * velDir) and slightly above (+0.39 * radialUp) facing Mars horizon
      const offsetDir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.add(
          Cesium.Cartesian3.multiplyByScalar(velDir, -0.92, new Cesium.Cartesian3()),
          Cesium.Cartesian3.multiplyByScalar(radialUp, 0.39, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        ),
        new Cesium.Cartesian3()
      );
      const camDest = Cesium.Cartesian3.add(
        satPos,
        Cesium.Cartesian3.multiplyByScalar(offsetDir, 25000, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );

      const lookDir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.subtract(satPos, camDest, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const camRight = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.cross(lookDir, radialUp, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const camUp = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.cross(camRight, lookDir, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );

      viewer.camera.flyTo({
        destination: camDest,
        orientation: {
          direction: lookDir,
          up: camUp,
        },
        duration: 2.0,
        endTransform: Cesium.Matrix4.IDENTITY,
      });
      return;
    }
    if (target.category === 'rover') {
      const coords = getRoverCoords(target);
      // Fly smoothly below 35 km (slant range ~11 km) to reveal the rover directly on the crater floor
      zoomToLocationInternal(coords.latitude, coords.longitude, 11000);
      return;
    }
    const areaInfo = getLocationAreaInfo(target);
    const adaptiveAlt = areaInfo
      ? Math.max(6000, Math.min(2_200_000, Math.round(areaInfo.radiusKm * 1800)))
      : 15000;
    zoomToLocationInternal(target.latitude, target.longitude, adaptiveAlt);
  };

  const resetGlobeInternal = () => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    const marsEllipsoid = marsEllipsoidRef.current;
    if (!viewer || viewer.isDestroyed() || !Cesium || !marsEllipsoid) return;

    cancelCameraOrientationAnimation();
    viewer.trackedEntity = undefined;
    viewer.camera.cancelFlight();

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(65.0, 12.0, DEFAULT_CAMERA_HEIGHT_METERS, marsEllipsoid),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
      duration: 1.6,
      endTransform: Cesium.Matrix4.IDENTITY,
    });
  };

  const setCameraOrientationInternal = (
    headingRad: number,
    tiltDeg: number,
    duration = 360
  ) => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    const marsEllipsoid = marsEllipsoidRef.current;
    if (!viewer || viewer.isDestroyed() || !Cesium || !marsEllipsoid) return;

    const canvas = viewer.scene.canvas;
    const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const centerRay = viewer.camera.getPickRay(center);
    const centerPoint = centerRay
      ? viewer.scene.globe.pick(centerRay, viewer.scene) ??
        viewer.camera.pickEllipsoid(center, marsEllipsoid)
      : viewer.camera.pickEllipsoid(center, marsEllipsoid);
    const fallbackSurface = marsEllipsoid.scaleToGeodeticSurface(viewer.camera.positionWC);
    const pickedPoint = centerPoint ?? fallbackSurface;
    const cartographic = pickedPoint
      ? marsEllipsoid.cartesianToCartographic(pickedPoint)
      : undefined;
    if (!cartographic) return;

    const latitude = Cesium.Math.toDegrees(cartographic.latitude);
    const longitude = Cesium.Math.toDegrees(cartographic.longitude);
    const terrainHeight =
      getMarsElevation(latitude, longitude, 4) * viewer.scene.verticalExaggeration;
    const target = Cesium.Cartesian3.fromDegrees(
      longitude,
      latitude,
      terrainHeight + 80,
      marsEllipsoid
    );
    const range = Math.max(
      MIN_CAMERA_HEIGHT_METERS,
      Math.min(MAX_CAMERA_HEIGHT_METERS, Cesium.Cartesian3.distance(viewer.camera.positionWC, target))
    );
    const currentHeading = viewer.camera.heading;
    const targetHeading = ((headingRad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const headingDelta = ((targetHeading - currentHeading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const currentTilt = Math.max(
      0,
      Math.min(80, 90 + Cesium.Math.toDegrees(viewer.camera.pitch))
    );
    const clampedTilt = Math.max(0, Math.min(80, tiltDeg));
    const startedAt = performance.now();

    cancelCameraOrientationAnimation();
    viewer.camera.cancelFlight();

    if (duration <= 0) {
      (viewer.camera as any).lookAt(
        target,
        new Cesium.HeadingPitchRange(headingRad, Cesium.Math.toRadians(clampedTilt - 90), range)
      );
      (viewer.camera as any).lookAtTransform(Cesium.Matrix4.IDENTITY);
      onHeadingChangeRef.current(viewer.camera.heading);
      onCameraTelemetryChangeRef.current({
        altitudeAboveEllipsoidMeters: Math.max(
          0,
          marsEllipsoid.cartesianToCartographic(viewer.camera.positionWC)?.height ??
          DEFAULT_CAMERA_HEIGHT_METERS
        ),
        metersPerPixel: 0,
        tiltDeg: clampedTilt,
      });
      return;
    }

    const animate = (now: number) => {
      if (viewer.isDestroyed()) return;
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = progress * progress * (3 - 2 * progress);
      const heading = currentHeading + headingDelta * eased;
      const tilt = currentTilt + (clampedTilt - currentTilt) * eased;
      (viewer.camera as any).lookAt(
        target,
        new Cesium.HeadingPitchRange(heading, Cesium.Math.toRadians(tilt - 90), range)
      );

      if (progress < 1) {
        cameraAnimationFrameRef.current = requestAnimationFrame(animate);
      } else {
        (viewer.camera as any).lookAtTransform(Cesium.Matrix4.IDENTITY);
        cameraAnimationFrameRef.current = null;
      }
    };
    cameraAnimationFrameRef.current = requestAnimationFrame(animate);
  };

  const setCameraTiltInternal = (tiltDeg: number) => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || viewer.isDestroyed() || !Cesium) return;
    setCameraOrientationInternal(viewer.camera.heading, tiltDeg, 0);
  };

  const setCameraHeadingInternal = (headingDeg: number) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const currentTilt = Math.max(0, Math.min(80, 90 + (viewer.camera.pitch * 180) / Math.PI));
    setCameraOrientationInternal((headingDeg * Math.PI) / 180, currentTilt, 0);
  };

  const toggle3DViewInternal = () => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const currentTilt = Math.max(
      0,
      Math.min(80, 90 + (viewer.camera.pitch * 180) / Math.PI)
    );
    setCameraOrientationInternal(
      viewer.camera.heading,
      currentTilt < 2 ? 60 : 0,
      800
    );
  };

  const resetNorthInternal = () => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || viewer.isDestroyed() || !Cesium) return;

    viewer.trackedEntity = undefined;
    cancelCameraOrientationAnimation();
    viewer.camera.cancelFlight();

    viewer.camera.flyTo({
      destination: viewer.camera.positionWC,
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
      duration: 0.75,
      endTransform: Cesium.Matrix4.IDENTITY,
    });
  };

  const stopContinuousZoomInternal = () => {
    if (zoomHoldTimerRef.current !== null) {
      window.clearTimeout(zoomHoldTimerRef.current);
      zoomHoldTimerRef.current = null;
    }
    if (zoomHoldRafRef.current !== null) {
      cancelAnimationFrame(zoomHoldRafRef.current);
      zoomHoldRafRef.current = null;
    }
  };

  const startContinuousZoomInternal = (direction: 1 | -1) => {
    stopContinuousZoomInternal();
    const viewer = viewerRef.current;
    const marsEllipsoid = marsEllipsoidRef.current;
    if (!viewer || viewer.isDestroyed() || !marsEllipsoid) return;

    // Require press-and-hold (>140ms) so single clicks on + / - have zero effect
    zoomHoldTimerRef.current = window.setTimeout(() => {
      zoomHoldTimerRef.current = null;
      if (viewer.isDestroyed()) return;

      cancelCameraOrientationAnimation();
      viewer.trackedEntity = undefined;
      viewer.camera.cancelFlight();

      let lastTs = performance.now();
      const stepFrame = (now: number) => {
        if (viewer.isDestroyed()) {
          zoomHoldRafRef.current = null;
          return;
        }
        const dtSec = Math.min(0.05, Math.max(0.004, (now - lastTs) / 1000));
        lastTs = now;

        const carto = marsEllipsoid.cartesianToCartographic(viewer.camera.positionWC);
        const cameraHeight = carto ? Math.max(MIN_CAMERA_HEIGHT_METERS, carto.height) : 10000;
        const speedFactorPerSec = 0.85 * CAMERA_INPUT_SENSITIVITY_MULTIPLIER * ZOOM_SPEED_MULTIPLIER;
        const rawDelta = Math.max(
          20 * ZOOM_SPEED_MULTIPLIER,
          cameraHeight * speedFactorPerSec * dtSec
        );

        if (direction > 0) {
          const moveStep = Math.min(Math.max(0, cameraHeight - MIN_CAMERA_HEIGHT_METERS), rawDelta);
          if (moveStep > 0) viewer.camera.moveForward(moveStep);
        } else {
          const moveStep = Math.min(
            Math.max(0, MAX_CAMERA_HEIGHT_METERS - cameraHeight),
            rawDelta
          );
          if (moveStep > 0) viewer.camera.moveBackward(moveStep);
        }

        zoomHoldRafRef.current = requestAnimationFrame(stepFrame);
      };

      zoomHoldRafRef.current = requestAnimationFrame(stepFrame);
    }, 140);
  };

  const wheelZoomInternal = (deltaY: number) => {
    const viewer = viewerRef.current;
    const marsEllipsoid = marsEllipsoidRef.current;
    if (!viewer || viewer.isDestroyed() || !marsEllipsoid || deltaY === 0) return;

    cancelCameraOrientationAnimation();
    viewer.trackedEntity = undefined;
    viewer.camera.cancelFlight();

    const carto = marsEllipsoid.cartesianToCartographic(viewer.camera.positionWC);
    const cameraHeight = carto ? Math.max(MIN_CAMERA_HEIGHT_METERS, carto.height) : 10000;
    const step = Math.max(
      15 * ZOOM_SPEED_MULTIPLIER,
      cameraHeight * 0.06 * CAMERA_INPUT_SENSITIVITY_MULTIPLIER * ZOOM_SPEED_MULTIPLIER
    );
    if (deltaY < 0) {
      const moveStep = Math.min(Math.max(0, cameraHeight - MIN_CAMERA_HEIGHT_METERS), step);
      if (moveStep > 0) viewer.camera.moveForward(moveStep);
    } else {
      const moveStep = Math.min(Math.max(0, MAX_CAMERA_HEIGHT_METERS - cameraHeight), step);
      if (moveStep > 0) viewer.camera.moveBackward(moveStep);
    }
  };

  const clearMeasurementInternal = () => {
    const ms = measureStateRef.current;
    ms.pointA = null;
    ms.pointB = null;
    ms.hoverCartesian = null;
    ms.previewVisualSamples = [];
    ms.previewSpanMeters = 0;
    ms.lockedVisualSamples = [];
    ms.lockedSpanMeters = 0;
    if (ms.pointAEntity) ms.pointAEntity.show = false;
    if (ms.pointBEntity) ms.pointBEntity.show = false;
    if (ms.previewLineEntity) ms.previewLineEntity.show = false;
    if (ms.lockedLineEntity) ms.lockedLineEntity.show = false;
    onMeasureHasPointAChangeRef.current(false);
    onMeasureLivePreviewChangeRef.current(null);
    onMeasureResultChangeRef.current(null);
  };

  const clearSurvivalRouteInternal = () => {
    const viewer = viewerRef.current;
    const rs = routeStateRef.current;
    rs.start = null;
    rs.destination = null;
    rs.result = null;
    rs.hasResult = false;
    if (rs.startEntity) rs.startEntity.show = false;
    if (rs.destEntity) rs.destEntity.show = false;
    if (rs.optimalLineEntity) rs.optimalLineEntity.show = false;
    if (rs.directLineEntity) rs.directLineEntity.show = false;
    if (viewer && !viewer.isDestroyed()) {
      for (const ring of rs.pulseRingEntities) {
        viewer.entities.remove(ring);
      }
    }
    rs.pulseRingEntities = [];
    onRouteStartChangeRef.current(null);
    onRouteResultChangeRef.current(null);
  };

  const clearSiteSelectionInternal = () => {
    const viewer = viewerRef.current;
    const sr = siteRectStateRef.current;
    sr.cornerA = null;
    sr.cornerB = null;
    sr.bounds = null;
    sr.ringSamples = [];
    sr.ringSpanMeters = 0;
    sr.builtDetailLevel = null;
    if (sr.fillPrimitive && viewer && !viewer.isDestroyed()) {
      viewer.scene.primitives.remove(sr.fillPrimitive);
    }
    sr.fillPrimitive = null;
    if (sr.cornerAEntity) sr.cornerAEntity.show = false;
    if (sr.cornerBEntity) sr.cornerBEntity.show = false;
    if (sr.rectEntity) sr.rectEntity.show = false;
    onSiteRectHasCornerAChangeRef.current(false);
    onSiteRectLivePreviewChangeRef.current(null);
  };

  useImperativeHandle(ref, () => ({
    zoomToLocation: zoomToLocationInternal,
    zoomToTarget: zoomToTargetInternal,
    startZoomIn: () => startContinuousZoomInternal(1),
    startZoomOut: () => startContinuousZoomInternal(-1),
    stopZoom: stopContinuousZoomInternal,
    wheelZoom: wheelZoomInternal,
    toggle3DView: toggle3DViewInternal,
    setCameraTilt: setCameraTiltInternal,
    setCameraHeading: setCameraHeadingInternal,
    resetNorth: resetNorthInternal,
    resetGlobe: resetGlobeInternal,
    clearMeasurement: clearMeasurementInternal,
    clearSurvivalRoute: clearSurvivalRouteInternal,
    clearSiteSelection: clearSiteSelectionInternal,
  }));

  useEffect(() => {
    const container = containerRef.current;
    const Cesium = window.Cesium;
    if (!container) return;

    if (!Cesium) {
      setWebglError('CesiumJS failed to load from CDN. Please verify network connectivity.');
      return;
    }

    // Custom Mars Ellipsoid (3396190m eq, 3376200m pol)
    const marsEllipsoid = new Cesium.Ellipsoid(
      MARS_CONSTANTS.EQUATORIAL_RADIUS,
      MARS_CONSTANTS.EQUATORIAL_RADIUS,
      MARS_CONSTANTS.POLAR_RADIUS
    );
    marsEllipsoidRef.current = marsEllipsoid;

    try {
      Cesium.Ellipsoid.WGS84 = marsEllipsoid;
    } catch {
      // Safe guard if WGS84 property is frozen
    }
    try {
      if ('default' in Cesium.Ellipsoid) {
        Cesium.Ellipsoid.default = marsEllipsoid;
      }
    } catch {
      // Safe guard if default property is frozen
    }

    const marsTilingScheme = new Cesium.GeographicTilingScheme({
      ellipsoid: marsEllipsoid,
    });
    marsTilingSchemeRef.current = marsTilingScheme;
    const terrainTileWidth = 65;
    const terrainTileHeight = 65;
    const marsTerrainProvider = new Cesium.CustomHeightmapTerrainProvider({
      width: terrainTileWidth,
      height: terrainTileHeight,
      tilingScheme: marsTilingScheme,
      callback: (x: number, y: number, level: number) => {
        const rectangle = marsTilingScheme.tileXYToRectangle(x, y, level);
        const heights = new Float32Array(terrainTileWidth * terrainTileHeight);
        for (let row = 0; row < terrainTileHeight; row += 1) {
          const latitude = Cesium.Math.toDegrees(
            rectangle.north -
              (row / (terrainTileHeight - 1)) * (rectangle.north - rectangle.south)
          );
          for (let column = 0; column < terrainTileWidth; column += 1) {
            const longitude = Cesium.Math.toDegrees(
              rectangle.west +
                (column / (terrainTileWidth - 1)) * (rectangle.east - rectangle.west)
            );
            heights[row * terrainTileWidth + column] = getMarsElevation(
              latitude,
              longitude,
              level
            );
          }
        }
        return heights;
      },
    });

    let viewer: CesiumViewer;
    try {
      viewer = new Cesium.Viewer(container, {
        globe: new Cesium.Globe(marsEllipsoid),
        terrainProvider: marsTerrainProvider,
        mapProjection: new Cesium.GeographicProjection(marsEllipsoid),
        baseLayer: false,
        baseLayerPicker: false,
        geocoder: false,
        timeline: false,
        animation: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        creditContainer: document.createElement('div'),
      });
    } catch (err) {
      setWebglError(
        err instanceof Error
          ? `WebGL 3D Globe failed to initialize: ${err.message}`
          : 'WebGL 3D context is unavailable in this browser.'
      );
      return;
    }

    // Enable the fixed, camera-relative terminator only in Optical mode.
    const initialShadowEnabled =
      sunShadowEnabledRef.current && mapStyleRef.current === 'optical';
    viewer.scene.globe.enableLighting = initialShadowEnabled;
    viewer.scene.sun = new Cesium.Sun();
    viewer.scene.sun.show = true;
    viewer.scene.globe.dynamicAtmosphereLighting = initialShadowEnabled;
    viewer.scene.globe.dynamicAtmosphereLightingFromSun = false;

    viewerRef.current = viewer;
    // Keep camera glides on a continuous render loop and allow high-refresh displays to render
    // above the default 60 FPS target without changing scene resolution or visual styling.
    (viewer as any).targetFrameRate = 240;
    (viewer.scene as any).requestRenderMode = false;

    // Rendering performance: cap the WebGL backbuffer on High-DPI screens (full devicePixelRatio
    // is wasteful) and relax it to 1.0 on touch/mobile devices where fill rate is the bottleneck.
    const mobileOrTouch = isMobileOrTouchDevice();
    viewer.resolutionScale = mobileOrTouch
      ? MOBILE_RESOLUTION_SCALE
      : Math.min(window.devicePixelRatio || 1, DESKTOP_MAX_RESOLUTION_SCALE);

    // Smooth continuous camera motion requires the render loop to run every frame.
    viewer.scene.requestRenderMode = false;

    viewer.imageryLayers.removeAll(true);

    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
      Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
    );

    const controller = viewer.scene.screenSpaceCameraController;
    controller.enableCollisionDetection = false;
    controller.minimumZoomDistance = 2500;
    controller.maximumZoomDistance = MAX_CAMERA_HEIGHT_METERS;
    controller.enableZoom = true;
    controller.enableRotate = true;
    controller.enableTilt = true;
    controller.enableTranslate = true;
    controller.zoomFactor = 5.0 * CAMERA_INPUT_SENSITIVITY_MULTIPLIER * ZOOM_SPEED_MULTIPLIER;
    controller.inertiaZoom = 0.85;
    controller.inertiaSpin = 0.94;
    controller.inertiaTranslate = 0.94;
    controller.maximumMovementRatio = 0.05;
    controller.bounceAnimationTime = 0;
    controller.zoomEventTypes = [
      Cesium.CameraEventType.WHEEL,
      {
        eventType: Cesium.CameraEventType.WHEEL,
        modifier: Cesium.KeyboardEventModifier.CTRL,
      },
      Cesium.CameraEventType.PINCH,
    ];
    controller.tiltEventTypes = [
      Cesium.CameraEventType.PINCH,
      Cesium.CameraEventType.RIGHT_DRAG,
      {
        eventType: Cesium.CameraEventType.LEFT_DRAG,
        modifier: Cesium.KeyboardEventModifier.CTRL,
      },
    ];

    // Subtle dusty Martian amber/butterscotch haze that is fully visible by 100 km
    // and fades out completely by 200 km, keeping orbital views crisp against the starfield.
    viewer.scene.backgroundColor = Cesium.Color.BLACK;
    viewer.scene.highDynamicRange = false;
    const marsSkyAtmosphere = new Cesium.SkyAtmosphere(marsEllipsoid);
    marsSkyAtmosphere.show = false;
    marsSkyAtmosphere.hueShift = 0.0;
    marsSkyAtmosphere.saturationShift = 0.0;
    marsSkyAtmosphere.brightnessShift = -1.0;
    marsSkyAtmosphere.atmosphereRayleighScaleHeight = 6800;
    marsSkyAtmosphere.atmosphereMieScaleHeight = 3200;
    marsSkyAtmosphere.atmosphereLightIntensity = 0.0;
    marsSkyAtmosphere.perFragmentAtmosphere = true;
    viewer.scene.skyAtmosphere = marsSkyAtmosphere;

    viewer.scene.globe.baseColor = Cesium.Color.BLACK;
    viewer.scene.globe.preloadSiblings = true;
    viewer.scene.globe.preloadAncestors = true;
    viewer.scene.globe.tileCacheSize = 800;
    viewer.scene.globe.maximumScreenSpaceError = mobileOrTouch
      ? MOBILE_MAXIMUM_SCREEN_SPACE_ERROR
      : DESKTOP_MAXIMUM_SCREEN_SPACE_ERROR;
    viewer.scene.verticalExaggeration = MARS_TERRAIN_VERTICAL_EXAGGERATION;
    // Keep the Optical terminator active at every zoom level, but never shade
    // the scientific Radiation, Temperature, or Elevation map styles.
    viewer.scene.globe.enableLighting = initialShadowEnabled;
    viewer.scene.globe.dynamicAtmosphereLighting = initialShadowEnabled;
    // Use the same camera-relative directional light as the surface terminator.
    viewer.scene.globe.dynamicAtmosphereLightingFromSun = false;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.globe.nightFadeInDistance = 10_000_000.0;
    viewer.scene.globe.nightFadeOutDistance = 50_000_000.0;
    if (viewer.scene.fog) {
      viewer.scene.fog.enabled = false;
      viewer.scene.fog.density = 0.0;
      viewer.scene.fog.minimumBrightness = 0.02;
      viewer.scene.fog.screenSpaceErrorFactor = 2.0;
    }
    // Keep globe lighting active at every supported camera altitude; do not fade the night-side shadow with zoom.
    viewer.scene.globe.lightingFadeOutDistance = 1_000_000_000;
    viewer.scene.globe.lightingFadeInDistance = 1_000_000_000;
    viewer.scene.globe.atmosphereLightIntensity = 0.0;
    viewer.scene.globe.atmosphereHueShift = 0.0;
    viewer.scene.globe.atmosphereSaturationShift = 0.0;
    viewer.scene.globe.atmosphereBrightnessShift = -1.0;
    viewer.scene.globe.atmosphereRayleighScaleHeight = 6800;
    viewer.scene.globe.atmosphereMieScaleHeight = 3200;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    (viewer.scene.globe as any).lambertDiffuseMultiplier = 0.85;
    (viewer.scene.globe as any).showWaterEffect = false;

    viewer.scene.moon = undefined;

    // Replace any custom/AI-generated space backdrop with CesiumJS's built-in Tycho-2 star
    // catalog skybox so the starfield renders authentic astronomical star positions.
    const starfieldSkyBox = new Cesium.SkyBox({
      sources: {
        positiveX: `${TYCHO_STARFIELD_SKYBOX_BASE}px.jpg`,
        negativeX: `${TYCHO_STARFIELD_SKYBOX_BASE}mx.jpg`,
        positiveY: `${TYCHO_STARFIELD_SKYBOX_BASE}py.jpg`,
        negativeY: `${TYCHO_STARFIELD_SKYBOX_BASE}my.jpg`,
        positiveZ: `${TYCHO_STARFIELD_SKYBOX_BASE}pz.jpg`,
        negativeZ: `${TYCHO_STARFIELD_SKYBOX_BASE}mz.jpg`,
      },
    });
    starfieldSkyBox.show = true;
    viewer.scene.skyBox = starfieldSkyBox;

    const removeRenderError = viewer.scene.renderError?.addEventListener(
      (_scene: unknown, error: unknown) => {
        const message = error instanceof Error ? error.message : String(error ?? 'Unknown WebGL render error');
        console.error('[MarsGlobe] Cesium render error:', error);
        setWebglError(`3D Globe encountered a rendering error: ${message}`);
      }
    );

    const configureLayerFiltering = (layer: CesiumImageryLayer) => {
      layer.magnificationFilter = Cesium.TextureMagnificationFilter.LINEAR;
      layer.minificationFilter = Cesium.TextureMinificationFilter.LINEAR;
      // Preserve the Sun-lit day side and let native globe lighting darken the night side.
      layer.dayAlpha = 1.0;
      layer.nightAlpha =
        sunShadowEnabledRef.current && mapStyleRef.current === 'optical' ? 0.0 : 1.0;
    };

    // 1. Optical Base Layer: Viking Color Mosaic 232m (natural daytime color)
    const vikingProvider = new Cesium.WebMapTileServiceImageryProvider({
      url: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg',
      layer: 'Mars_Viking_MDIM21_ClrMosaic_global_232m',
      style: 'default',
      format: 'image/jpeg',
      tileMatrixSetID: 'default028mm',
      maximumLevel: 7,
      tilingScheme: marsTilingScheme,
    });
    const unbindVikingErr = vikingProvider.errorEvent.addEventListener((e: { retry?: boolean }) => {
      if (e) e.retry = false;
    });
    const opticalLayer = viewer.imageryLayers.addImageryProvider(vikingProvider);
    configureLayerFiltering(opticalLayer);
    opticalLayer.show = true;
    // Start at orbital (far) grading; post-render loop blends toward sandy near-surface look
    opticalLayer.hue = OPTICAL_COLOR_FAR.hue;
    opticalLayer.contrast = OPTICAL_COLOR_FAR.contrast;
    opticalLayer.brightness = OPTICAL_COLOR_FAR.brightness;
    opticalLayer.saturation = OPTICAL_COLOR_FAR.saturation;
    opticalLayer.gamma = OPTICAL_COLOR_FAR.gamma;
    vikingLayerRef.current = opticalLayer;

    // 2. High-Res MRO CTX Overlay (up to zoom level 13 / 6 m/px, smooth progressive blend below 900 km)
    const ctxProvider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/{z}/{y}/{x}',
      tilingScheme: marsTilingScheme,
      tileWidth: 512,
      tileHeight: 512,
      minimumLevel: 4,
      maximumLevel: 13,
    });
    const unbindCtxErr = ctxProvider.errorEvent.addEventListener((e: { retry?: boolean }) => {
      if (e) e.retry = false;
    });
    const ctxLayer = viewer.imageryLayers.addImageryProvider(ctxProvider);
    configureLayerFiltering(ctxLayer);
    ctxLayer.show = false;
    ctxLayer.alpha = 0.0;
    ctxLayer.hue = CTX_COLOR_FAR.hue;
    ctxLayer.contrast = CTX_COLOR_FAR.contrast;
    ctxLayer.brightness = CTX_COLOR_FAR.brightness;
    ctxLayer.saturation = CTX_COLOR_FAR.saturation;
    ctxLayer.gamma = CTX_COLOR_FAR.gamma;
    ctxLayerRef.current = ctxLayer;

    // 2b. Global Translucent Limb/Horizon Martian Cloud Shell (full at altitude, fades on zoom-in;
    //     invisible straight-on from the front, emerging along edges/horizons & fading into space)
    const initialCloudOpacity =
      getCloudFadeAlpha(DEFAULT_CAMERA_HEIGHT_METERS) * cloudModeBlendRef.current;
    const showInitialClouds = initialCloudOpacity > 0.003;
    const cloudMaterial = new Cesium.Material({
      fabric: {
        type: 'MarsLimbCloudShell',
        uniforms: {
          image: getGlobalMarsCloudCanvas(),
          u_opacity: showInitialClouds ? initialCloudOpacity : 0.0,
          u_shadowEnabled: initialShadowEnabled ? 1.0 : 0.0,
        },
        source: `
          uniform sampler2D image;
          uniform float u_opacity;
          uniform float u_shadowEnabled;

          czm_material czm_getMaterial(czm_materialInput materialInput)
          {
            czm_material material = czm_getDefaultMaterial(materialInput);
            vec3 normalEC = normalize(materialInput.normalEC);
            vec3 toEyeEC = normalize(materialInput.positionToEyeEC);
            float ndotv = clamp(dot(normalEC, toEyeEC), 0.0, 1.0);

            // Invisible from front center (ndotv >= 0.80); builds across sloping globe edges
            float horizonRamp = smoothstep(0.80, 0.18, ndotv);
            float innerBuild = pow(max(horizonRamp, 1e-4), 1.55) * smoothstep(0.0, 0.02, horizonRamp);

            // Smooth outer fade-out past the solid planet rim into black space
            float outerRamp = smoothstep(0.0, 0.185, ndotv);
            float outerFade = pow(max(outerRamp, 1e-4), 1.2) * smoothstep(0.0, 0.02, outerRamp);
            float limbEnvelope = innerBuild * outerFade;

            vec4 tex = texture(image, materialInput.st);
            float wispDetail = mix(0.52, 1.0, tex.a);
            float sheenRamp = smoothstep(0.56, 0.18, ndotv);
            float limbSheen = pow(max(sheenRamp, 1e-4), 1.4) * smoothstep(0.0, 0.02, sheenRamp) * 0.24;
            float edgeAlpha = limbEnvelope * (wispDetail * 0.56 + limbSheen);

            // Match camera-relative solar terminator shading when sun shadow is enabled
            vec3 lightDirEC = normalize(vec3(0.66, 0.42, 0.623));
            float ndotl = dot(normalEC, lightDirEC);
            float terminator = smoothstep(-0.22, 0.40, ndotl);
            float shadowMask = mix(1.0, 0.03 + 0.97 * terminator, u_shadowEnabled);
            float twilight = smoothstep(-0.18, 0.12, ndotl) * (1.0 - smoothstep(0.12, 0.45, ndotl));

            vec3 cloudColor = mix(tex.rgb, vec3(1.0, 0.96, 0.91), twilight * 0.28 * u_shadowEnabled);
            material.diffuse = cloudColor * mix(0.28, 1.0, shadowMask);
            material.alpha = clamp(edgeAlpha * shadowMask * u_opacity, 0.0, 0.85);
            return material;
          }
        `,
      },
      translucent: true,
    });
    const cloudShellPrimitive = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.EllipsoidGeometry({
          radii: new Cesium.Cartesian3(
            MARS_CONSTANTS.EQUATORIAL_RADIUS + CLOUD_SHELL_ALTITUDE_METERS,
            MARS_CONSTANTS.EQUATORIAL_RADIUS + CLOUD_SHELL_ALTITUDE_METERS,
            MARS_CONSTANTS.POLAR_RADIUS + CLOUD_SHELL_ALTITUDE_METERS
          ),
          vertexFormat: Cesium.MaterialAppearance.MaterialSupport.ALL.vertexFormat,
          stackPartitions: 96,
          slicePartitions: 128,
        }),
      }),
      appearance: new Cesium.MaterialAppearance({
        material: cloudMaterial,
        materialSupport: Cesium.MaterialAppearance.MaterialSupport.ALL,
        flat: true,
        translucent: true,
        closed: true,
      }),
      asynchronous: false,
      show: showInitialClouds,
    });
    viewer.scene.primitives.add(cloudShellPrimitive);
    cloudShellPrimitiveRef.current = cloudShellPrimitive;

    // 3. Grayscale MOLA/HRSC Terrain Relief Base (used beneath Temperature & Elevation modes)
    const reliefShadeProvider = new Cesium.WebMapTileServiceImageryProvider({
      url: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MOLA_blend200ppx_HRSC_Shade_clon0dd_200mpp_lzw/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg',
      layer: 'Mars_MOLA_blend200ppx_HRSC_Shade_clon0dd_200mpp_lzw',
      style: 'default',
      format: 'image/jpeg',
      tileMatrixSetID: 'default028mm',
      maximumLevel: 8,
      tilingScheme: marsTilingScheme,
    });
    const unbindShadeErr = reliefShadeProvider.errorEvent.addEventListener((e: { retry?: boolean }) => {
      if (e) e.retry = false;
    });
    const reliefShadeLayer = viewer.imageryLayers.addImageryProvider(reliefShadeProvider);
    configureLayerFiltering(reliefShadeLayer);
    reliefShadeLayer.show = false;
    reliefShadeLayer.saturation = 0.0;
    reliefShadeLayer.contrast = 1.45;
    reliefShadeLayer.brightness = 0.95;
    reliefShadeLayer.gamma = 0.9;
    reliefShadeLayerRef.current = reliefShadeLayer;

    // 4. Multi-Resolution Seasonal Temperature Pyramid (Levels 0-13, bilinear NASA MGS TES)
    const temperatureProvider = createMarsProceduralImageryProvider({
      Cesium,
      tilingScheme: marsTilingScheme,
      mode: 'temperature',
      solarLongitudeLs: temperatureLs,
      maximumLevel: 13,
    });
    const temperatureLayer = viewer.imageryLayers.addImageryProvider(temperatureProvider);
    configureLayerFiltering(temperatureLayer);
    temperatureLayer.show = false;
    temperatureLayer.alpha = 0.85;
    temperatureLayer.contrast = 1.12;
    temperatureLayerRef.current = temperatureLayer;
    loadedTemperatureLsRef.current = temperatureLs;

    // 5. Multi-Resolution Surface Radiation Pyramid (Levels 0-13, MSL RAD calibrated)
    const radiationProvider = createMarsProceduralImageryProvider({
      Cesium,
      tilingScheme: marsTilingScheme,
      mode: 'radiation',
      maximumLevel: 13,
    });
    const radiationLayer = viewer.imageryLayers.addImageryProvider(radiationProvider);
    configureLayerFiltering(radiationLayer);
    radiationLayer.show = false;
    radiationLayer.alpha = 0.88;
    radiationLayer.contrast = 1.45;
    radiationLayerRef.current = radiationLayer;

    // 6. Multi-Resolution Grayscale Elevation Pyramid (Levels 0-13, crisp below 40 km)
    const elevationProvider = createMarsProceduralImageryProvider({
      Cesium,
      tilingScheme: marsTilingScheme,
      mode: 'elevation',
      maximumLevel: 13,
    });
    const elevationLayer = viewer.imageryLayers.addImageryProvider(elevationProvider);
    configureLayerFiltering(elevationLayer);
    elevationLayer.show = false;
    elevationLayer.alpha = 0.72;
    elevationLayer.saturation = 0.0;
    elevationLayer.contrast = 1.5;
    elevationLayer.gamma = 0.9;
    elevationLayerRef.current = elevationLayer;

    // Plot Interactive Glowing Pins, Close-Up Spacecraft & Rover Sprites, and Geodesic Measure Entities
    const pinMap = new Map<string, CesiumEntity>();
    const spacecraftMap = new Map<string, CesiumEntity>();
    const roverMap = new Map<string, CesiumEntity>();
    const roverPositions = new Map<string, unknown>();
    const satCloseState = new Map<string, boolean>();
    const roverCloseState = new Map<string, boolean>();
    const surfaceHorizonPoints = new Map<string, unknown>();
    const pinEyeOffset = new Cesium.Cartesian3(0.0, 0.0, -10000.0);
    const farLabelOffset = new Cesium.Cartesian2(0, -6);
    const closeLabelOffset = new Cesium.Cartesian2(0, 78);
    const roverCloseLabelOffset = new Cesium.Cartesian2(0, 48);
    const getExaggeratedSurfacePosition = (
      latitude: number,
      longitude: number,
      elevationMeters = getMarsElevation(latitude, longitude, 4),
      offsetMeters = 80
    ) =>
      Cesium.Cartesian3.fromDegrees(
        longitude,
        latitude,
        elevationMeters * viewer.scene.verticalExaggeration + offsetMeters,
        marsEllipsoid
      );
    const createSurfacePositionProperty = (
      latitude: number,
      longitude: number,
      elevationMeters = getMarsElevation(latitude, longitude, 4),
      offsetMeters = 80
    ) =>
      new Cesium.CallbackProperty(
        () =>
          getExaggeratedSurfacePosition(latitude, longitude, elevationMeters, offsetMeters),
        false
      );

    const rebuildGraticule = (enabled: boolean, exaggeration: number) => {
      for (const entity of gridEntitiesRef.current) viewer.entities.remove(entity);
      gridEntitiesRef.current = [];
      if (!enabled || viewer.isDestroyed()) return;

      const makeGridPoint = (latitude: number, longitude: number, offsetMeters = 220) =>
        Cesium.Cartesian3.fromDegrees(
          longitude,
          latitude,
          getMarsElevation(latitude, longitude, 4) * exaggeration + offsetMeters,
          marsEllipsoid
        );
      const addPolyline = (
        id: string,
        positions: unknown[],
        highlighted: boolean,
        equator = false
      ) => {
        const color = equator
          ? Cesium.Color.fromCssColorString('#fbbf24').withAlpha(0.82)
          : highlighted
            ? Cesium.Color.fromCssColorString('#67e8f9').withAlpha(0.7)
            : Cesium.Color.fromCssColorString('#dbeafe').withAlpha(0.34);
        gridEntitiesRef.current.push(
          viewer.entities.add({
            id,
            polyline: {
              positions,
              width: equator ? 2.2 : highlighted ? 1.45 : 0.85,
              arcType: Cesium.ArcType.GEODESIC,
              material: color,
            },
          })
        );
      };
      const addDegreeLabel = (id: string, text: string, latitude: number, longitude: number) => {
        gridEntitiesRef.current.push(
          viewer.entities.add({
            id,
            position: makeGridPoint(latitude, longitude, 850),
            label: {
              text,
              font: '600 10px "Chakra Petch", sans-serif',
              fillColor: Cesium.Color.fromCssColorString('#dbeafe').withAlpha(0.82),
              outlineColor: Cesium.Color.fromCssColorString('#07111c').withAlpha(0.95),
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 14000000),
            },
          })
        );
      };

      for (let latitude = -75; latitude <= 75; latitude += 15) {
        const positions = [];
        for (let longitude = -180; longitude <= 180; longitude += 3) {
          positions.push(makeGridPoint(latitude, longitude));
        }
        addPolyline(`__mars-grid-lat-${latitude}`, positions, latitude % 30 === 0, latitude === 0);
        if (latitude !== 0 && latitude % 30 === 0) {
          addDegreeLabel(
            `__mars-grid-label-lat-${latitude}`,
            `${Math.abs(latitude)}°${latitude > 0 ? 'N' : 'S'}`,
            latitude,
            0
          );
        }
      }

      for (let longitude = -180; longitude < 180; longitude += 15) {
        const positions = [];
        for (let latitude = -87; latitude <= 87; latitude += 3) {
          positions.push(makeGridPoint(latitude, longitude));
        }
        addPolyline(
          `__mars-grid-lon-${longitude}`,
          positions,
          longitude === 0 || Math.abs(longitude) % 30 === 0
        );
        if (longitude !== 0 && Math.abs(longitude) % 30 === 0) {
          addDegreeLabel(
            `__mars-grid-label-lon-${longitude}`,
            `${Math.abs(longitude)}°${longitude > 0 ? 'E' : 'W'}`,
            0,
            longitude
          );
        }
      }

      addDegreeLabel('__mars-grid-label-airy-zero', '0° E · Airy-0', -5.1, 0);
      rebuildGridRef.current = rebuildGraticule;
    };
    rebuildGridRef.current = rebuildGraticule;

    for (const target of MARS_TARGETS) {
      const colorHex = CATEGORY_COLORS[target.category];
      const cesiumColor = Cesium.Color.fromCssColorString(colorHex);
      const targetElevation = getMarsElevation(target.latitude, target.longitude, 4);
      const isPrimaryLabel =
        target.category === 'satellite'
          ? PRIMARY_GLOBAL_SATELLITE_IDS.has(target.id)
          : target.category === 'rover'
            ? PRIMARY_GLOBAL_ROVER_IDS.has(target.id)
            : PRIMARY_GLOBAL_LANDMARK_IDS.has(target.id);
      const labelDistanceDisplayCondition = isPrimaryLabel
        ? undefined
        : new Cesium.DistanceDisplayCondition(
            0,
            target.category === 'satellite' ? 8_500_000 : SURFACE_SECONDARY_PIN_MAX_DIST_METERS
          );

      if (target.category === 'satellite' && target.orbit) {
        const positionProperty = new Cesium.CallbackProperty(() => {
          const liveElem = liveOrbiterElementsRef.current[target.id];
          const pos = computeSatelliteCartesian(target, getEffectiveEpochMs(), liveElem);
          return new Cesium.Cartesian3(pos.x, pos.y, pos.z);
        }, false);
        let lastSatelliteLabelUpdate = 0;
        let lastSatelliteLabelLs = -1;
        let satelliteLabelWeatherEnabled = false;
        let satelliteLabelText = target.shortName;
        const satelliteLabelTextProperty = new Cesium.CallbackProperty(() => {
          const weather = weatherEnabledRef.current;
          const temperatureSeason = loadedTemperatureLsRef.current ?? 0;
          if (!weather) {
            satelliteLabelText = target.shortName;
            satelliteLabelWeatherEnabled = false;
            return satelliteLabelText;
          }
          const now = performance.now();
          if (
            !satelliteLabelWeatherEnabled ||
            lastSatelliteLabelLs !== temperatureSeason ||
            now - lastSatelliteLabelUpdate >= 500
          ) {
            const liveElem = liveOrbiterElementsRef.current[target.id];
            const subpoint = computeSatelliteCartesian(target, getEffectiveEpochMs(), liveElem);
            satelliteLabelText = getTargetPinLabel(
              target,
              true,
              temperatureSeason,
              subpoint.latDeg,
              subpoint.lonDeg
            );
            lastSatelliteLabelUpdate = now;
            lastSatelliteLabelLs = temperatureSeason;
            satelliteLabelWeatherEnabled = true;
          }
          return satelliteLabelText;
        }, false);

        const satPin = viewer.entities.add({
          id: target.id,
          name: target.name,
          position: positionProperty,
          show: showSatellitesRef.current,
          billboard: {
            image: createGlowPinDataUri(colorHex, 'satellite', false),
            scale: 0.5,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            eyeOffset: pinEyeOffset,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: satelliteLabelTextProperty,
            font: '600 12px "Chakra Petch", sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#05070B'),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: farLabelOffset,
            eyeOffset: pinEyeOffset,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: labelDistanceDisplayCondition,
          },
        });
        pinMap.set(target.id, satPin);

        const spacecraftEntity = viewer.entities.add({
          id: `${target.id}-spacecraft`,
          name: `${target.name} Spacecraft`,
          position: positionProperty,
          show: false,
          billboard: {
            image: createSatelliteSprite(target.id),
            width: 256,
            height: 256,
            scaleByDistance: new Cesium.NearFarScalar(5000, 1.1, 120000, 0.35),
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            eyeOffset: pinEyeOffset,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        spacecraftMap.set(target.id, spacecraftEntity);
        satCloseState.set(target.id, false);

        // Cache body-fixed 360-degree orbit ring points & refresh when Mars rotates > ~15s effective time
        let cachedRingEpochMs = -1;
        let cachedRingSource = '';
        let cachedRingCartesians: unknown[] = [];
        const ringPositions = new Cesium.CallbackProperty(() => {
          if (!showSatellitesRef.current) return [];
          const effMs = getEffectiveEpochMs();
          const liveElem = liveOrbiterElementsRef.current[target.id];
          const srcTag = liveElem?.syncedAtUtc ?? '';
          if (Math.abs(effMs - cachedRingEpochMs) > 15_000 || cachedRingSource !== srcTag) {
            cachedRingEpochMs = effMs;
            cachedRingSource = srcTag;
            cachedRingCartesians = sampleSatelliteOrbitArc(
              target,
              effMs,
              360,
              128,
              false,
              liveElem
            ).map((p) => new Cesium.Cartesian3(p.x, p.y, p.z));
          }
          return cachedRingCartesians;
        }, false);
        const orbitRingEntity = viewer.entities.add({
          id: `${target.id}-orbit-ring`,
          show: showSatellitesRef.current,
          polyline: {
            positions: ringPositions,
            width: 1.25,
            material: cesiumColor.withAlpha(0.22),
          },
        });
        orbitRingEntitiesRef.current.set(target.id, orbitRingEntity);

        let lastWakeSampleAt = 0;
        let cachedWakeEpochMs = -1;
        let cachedWakeSource = '';
        let cachedWakeCartesians: unknown[] = [];
        const wakePositions = new Cesium.CallbackProperty(() => {
          if (!showSatellitesRef.current) return [];
          const now = performance.now();
          const effMs = getEffectiveEpochMs();
          const liveElem = liveOrbiterElementsRef.current[target.id];
          const srcTag = liveElem?.syncedAtUtc ?? '';
          if (
            now - lastWakeSampleAt >= 120 ||
            Math.abs(effMs - cachedWakeEpochMs) > 2500 ||
            cachedWakeSource !== srcTag
          ) {
            lastWakeSampleAt = now;
            cachedWakeEpochMs = effMs;
            cachedWakeSource = srcTag;
            cachedWakeCartesians = sampleSatelliteOrbitArc(
              target,
              effMs,
              100,
              36,
              true,
              liveElem
            ).map((p) => new Cesium.Cartesian3(p.x, p.y, p.z));
          }
          return cachedWakeCartesians;
        }, false);
        const orbitWakeEntity = viewer.entities.add({
          id: `${target.id}-orbit-wake`,
          show: showSatellitesRef.current,
          polyline: {
            positions: wakePositions,
            width: 3.0,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.3,
              taperPower: 0.6,
              color: cesiumColor.withAlpha(0.85),
            }),
          },
        });
        orbitWakeEntitiesRef.current.set(target.id, orbitWakeEntity);
      } else if (target.category === 'rover') {
        // Rovers dynamically bind to live/cached NASA telemetry coordinates when available
        const roverSurfacePos = new Cesium.CallbackProperty(() => {
          const coords = getRoverCoords(target);
          return getExaggeratedSurfacePosition(
            coords.latitude,
            coords.longitude,
            coords.elevationMeters,
            40
          );
        }, false);
        roverPositions.set(target.id, roverSurfacePos);

        const roverPin = viewer.entities.add({
          id: target.id,
          name: target.name,
          position: roverSurfacePos,
          show: showRoversRef.current,
          billboard: {
            image: createGlowPinDataUri(colorHex, 'rover', false),
            scale: 0.5,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            eyeOffset: pinEyeOffset,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: getTargetPinLabel(target, weatherEnabledRef.current, loadedTemperatureLsRef.current ?? 0),
            font: '600 12px "Chakra Petch", sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#05070B'),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: farLabelOffset,
            eyeOffset: pinEyeOffset,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: labelDistanceDisplayCondition,
          },
        });
        pinMap.set(target.id, roverPin);

        const roverSpriteEntity = viewer.entities.add({
          id: `${target.id}-rover`,
          name: `${target.name} Surface View`,
          position: roverSurfacePos,
          show: false,
          billboard: {
            image: createRoverSprite(target.id),
            width: 256,
            height: 256,
            scaleByDistance: new Cesium.NearFarScalar(1500, 1.0, 35000, 0.25),
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        roverMap.set(target.id, roverSpriteEntity);
        roverCloseState.set(target.id, false);
      } else {
        const surfacePosition = createSurfacePositionProperty(
          target.latitude,
          target.longitude,
          targetElevation,
          180
        );
        surfaceHorizonPoints.set(target.id, surfacePosition);

        const surfacePin = viewer.entities.add({
          id: target.id,
          name: target.name,
          position: surfacePosition,
          billboard: {
            image: createGlowPinDataUri(colorHex, target.category, false),
            scale: 0.5,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            eyeOffset: pinEyeOffset,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: getTargetPinLabel(target, weatherEnabledRef.current, loadedTemperatureLsRef.current ?? 0),
            font: '600 12px "Chakra Petch", sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#05070B'),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: farLabelOffset,
            eyeOffset: pinEyeOffset,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: labelDistanceDisplayCondition,
          },
        });
        pinMap.set(target.id, surfacePin);
      }
    }

    pinEntitiesRef.current = pinMap;
    spacecraftEntitiesRef.current = spacecraftMap;
    roverEntitiesRef.current = roverMap;

    // Adaptive marker & polyline vertical clearance so <1 km points hug the surface without floating
    const getCameraHeightMeters = () => {
      const carto = marsEllipsoid.cartesianToCartographic(viewer.camera.positionWC);
      return carto ? Math.max(0, carto.height) : DEFAULT_CAMERA_HEIGHT_METERS;
    };
    const getCameraDetailLevel = () => {
      const h = getCameraHeightMeters();
      if (h < 15_000) return 11;
      if (h < 80_000) return 8;
      if (h < 350_000) return 6;
      return 4;
    };
    const getAdaptiveMarkerOffset = (maxOffset = 40, minOffset = 0.4) =>
      Math.max(minOffset, Math.min(maxOffset, getCameraHeightMeters() * 0.00045));

    // Visual terrain-climbing helpers (keep real point-to-point distance math strictly untouched)
    const sampleClimbingElevations = (latDeg: number, lonDeg: number) => ({
      latDeg,
      lonDeg,
      elev0: getMarsElevation(latDeg, lonDeg, 0),
      elev4: getMarsElevation(latDeg, lonDeg, 4),
      elev11: getMarsElevation(latDeg, lonDeg, 11),
    });
    const resolveLodClimbElevMeters = (
      sample: { elev0: number; elev4: number; elev11: number },
      camHeight: number
    ) => {
      if (camHeight < 12_000) return sample.elev11;
      if (camHeight < 80_000) return Math.max(sample.elev4, sample.elev11);
      return Math.max(sample.elev0, sample.elev4, sample.elev11);
    };
    const computePathClearanceMeters = (camHeight: number, segLenMeters: number) => {
      const chordSag = (segLenMeters * segLenMeters) / (8 * MARS_CONSTANTS.EQUATORIAL_RADIUS);
      return Math.max(
        1.0,
        Math.min(2500, chordSag * 1.25 + Math.max(camHeight * 0.0008, segLenMeters * 0.03))
      );
    };
    const buildVisualClimbingPositions = (
      samples: Array<{
        latDeg: number;
        lonDeg: number;
        elev0: number;
        elev4: number;
        elev11: number;
      }>,
      spanMeters: number,
      clearanceMultiplier = 1.0
    ) => {
      const camHeight = getCameraHeightMeters();
      const segLen = spanMeters / Math.max(1, samples.length - 1);
      const clearance = computePathClearanceMeters(camHeight, segLen) * clearanceMultiplier;
      const exag = viewer.scene.verticalExaggeration;
      return samples.map((s) =>
        Cesium.Cartesian3.fromDegrees(
          s.lonDeg,
          s.latDeg,
          resolveLodClimbElevMeters(s, camHeight) * exag + clearance,
          marsEllipsoid
        )
      );
    };

    // Geodesic Measure Tool Entities (Minimal 7px Yellow Dots Only + Live Dashed / Locked Solid Terrain-Climbing Line)
    const ms = measureStateRef.current;
    ms.pointAEntity = viewer.entities.add({
      id: '__measure-point-a',
      show: false,
      position: new Cesium.CallbackProperty(
        () => {
          if (!ms.pointA) return Cesium.Cartesian3.fromDegrees(0, 0, 0, marsEllipsoid);
          const camHeight = getCameraHeightMeters();
          const activeSamples =
            ms.lockedVisualSamples.length >= 2
              ? ms.lockedVisualSamples
              : ms.previewVisualSamples;
          const activeSpan =
            ms.lockedVisualSamples.length >= 2 ? ms.lockedSpanMeters : ms.previewSpanMeters;
          const segLen =
            activeSamples.length >= 2 ? activeSpan / (activeSamples.length - 1) : 0;
          const clearance = Math.max(1.2, computePathClearanceMeters(camHeight, segLen));
          const elevMeters = ms.pointA.visualSample
            ? resolveLodClimbElevMeters(ms.pointA.visualSample, camHeight)
            : ms.pointA.elevMeters;
          return getExaggeratedSurfacePosition(
            ms.pointA.latDeg,
            ms.pointA.lonDeg,
            elevMeters,
            clearance
          );
        },
        false
      ),
      point: {
        pixelSize: 7,
        color: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    ms.pointBEntity = viewer.entities.add({
      id: '__measure-point-b',
      show: false,
      position: new Cesium.CallbackProperty(
        () => {
          if (!ms.pointB) return Cesium.Cartesian3.fromDegrees(0, 0, 0, marsEllipsoid);
          const camHeight = getCameraHeightMeters();
          const segLen =
            ms.lockedVisualSamples.length >= 2
              ? ms.lockedSpanMeters / (ms.lockedVisualSamples.length - 1)
              : 0;
          const clearance = Math.max(1.2, computePathClearanceMeters(camHeight, segLen));
          const elevMeters = ms.pointB.visualSample
            ? resolveLodClimbElevMeters(ms.pointB.visualSample, camHeight)
            : ms.pointB.elevMeters;
          return getExaggeratedSurfacePosition(
            ms.pointB.latDeg,
            ms.pointB.lonDeg,
            elevMeters,
            clearance
          );
        },
        false
      ),
      point: {
        pixelSize: 7,
        color: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    ms.previewLineEntity = viewer.entities.add({
      id: '__measure-preview-line',
      show: false,
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          if (ms.previewVisualSamples.length >= 2) {
            return buildVisualClimbingPositions(ms.previewVisualSamples, ms.previewSpanMeters);
          }
          return [];
        }, false),
        width: 3,
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#22D3EE'),
          dashLength: 14,
        }),
      },
    });
    ms.lockedLineEntity = viewer.entities.add({
      id: '__measure-locked-line',
      show: false,
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          if (ms.lockedVisualSamples.length >= 2) {
            return buildVisualClimbingPositions(ms.lockedVisualSamples, ms.lockedSpanMeters);
          }
          return [];
        }, false),
        width: 3.5,
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.25,
          color: Cesium.Color.fromCssColorString('#22D3EE'),
        }),
      },
    });

    // Optimal Survival Route Pathfinder Entities
    const rs = routeStateRef.current;
    rs.startEntity = viewer.entities.add({
      id: '__route-start',
      show: false,
      position: new Cesium.CallbackProperty(
        () =>
          rs.start
            ? getExaggeratedSurfacePosition(
                rs.start.latDeg,
                rs.start.lonDeg,
                rs.start.elevMeters,
                getAdaptiveMarkerOffset(180, 0.8)
              )
            : Cesium.Cartesian3.fromDegrees(0, 0, 0, marsEllipsoid),
        false
      ),
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#10B981'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: 'START',
        font: '700 11px "Chakra Petch", sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#6EE7B7'),
        outlineColor: Cesium.Color.fromCssColorString('#05070B'),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -12),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    rs.destEntity = viewer.entities.add({
      id: '__route-dest',
      show: false,
      position: new Cesium.CallbackProperty(
        () =>
          rs.destination
            ? getExaggeratedSurfacePosition(
                rs.destination.latDeg,
                rs.destination.lonDeg,
                rs.destination.elevMeters,
                getAdaptiveMarkerOffset(180, 0.8)
              )
            : Cesium.Cartesian3.fromDegrees(0, 0, 0, marsEllipsoid),
        false
      ),
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#22D3EE'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: 'DEST',
        font: '700 11px "Chakra Petch", sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#67E8F9'),
        outlineColor: Cesium.Color.fromCssColorString('#05070B'),
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -12),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    rs.directLineEntity = viewer.entities.add({
      id: '__route-direct-line',
      show: false,
      polyline: {
        positions: [],
        width: 2,
        arcType: Cesium.ArcType.GEODESIC,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#94A3B8').withAlpha(0.8),
          dashLength: 16,
        }),
      },
    });
    rs.optimalLineEntity = viewer.entities.add({
      id: '__route-optimal-line',
      show: false,
      polyline: {
        positions: [],
        width: 4,
        arcType: Cesium.ArcType.GEODESIC,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.35,
          color: Cesium.Color.fromCssColorString('#10B981').withAlpha(0.95),
        }),
      },
    });

    createSurfacePositionFnRef.current = createSurfacePositionProperty;

    // Site Habitability Rectangular Selection Entities (terrain-climbing perimeter + 20x20 draped fill mesh)
    const sr = siteRectStateRef.current;
    const siteRectColor = Cesium.Color.fromCssColorString('#F59E0B');

    const buildSiteRectRingSamples = (bounds: SiteBounds) => {
      const stepsPerEdge = 48;
      const dLat = bounds.northLat - bounds.southLat;
      const dLon = getPositiveLonSpanDeg(bounds.westLon, bounds.eastLon);
      const samples: Array<{
        latDeg: number;
        lonDeg: number;
        elev0: number;
        elev4: number;
        elev11: number;
      }> = [];

      for (let i = 0; i < stepsPerEdge; i++) {
        samples.push(
          sampleClimbingElevations(bounds.southLat + (dLat * i) / stepsPerEdge, bounds.westLon)
        );
      }
      for (let i = 0; i < stepsPerEdge; i++) {
        samples.push(
          sampleClimbingElevations(
            bounds.northLat,
            wrapLongitudeDeg(bounds.westLon + (dLon * i) / stepsPerEdge)
          )
        );
      }
      for (let i = 0; i < stepsPerEdge; i++) {
        samples.push(
          sampleClimbingElevations(bounds.northLat - (dLat * i) / stepsPerEdge, bounds.eastLon)
        );
      }
      for (let i = 0; i <= stepsPerEdge; i++) {
        samples.push(
          sampleClimbingElevations(
            bounds.southLat,
            wrapLongitudeDeg(bounds.eastLon - (dLon * i) / stepsPerEdge)
          )
        );
      }
      return samples;
    };

    const removeSiteFillPrimitive = () => {
      if (sr.fillPrimitive && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(sr.fillPrimitive);
      }
      sr.fillPrimitive = null;
    };

    const rebuildSiteFillPrimitive = (bounds: SiteBounds, detailLevel: number) => {
      removeSiteFillPrimitive();
      if (viewer.isDestroyed()) return;

      const dLat = bounds.northLat - bounds.southLat;
      const dLon = getPositiveLonSpanDeg(bounds.westLon, bounds.eastLon);
      if (dLat < 1e-7 || dLon < 1e-7) {
        sr.builtDetailLevel = detailLevel;
        return;
      }

      const { widthKm, heightKm } = computeRectangleDimensionsKm(bounds);
      const maxSpanMeters = Math.max(widthKm, heightKm) * 1000;
      const camHeight = getCameraHeightMeters();
      const gridCols = 28;
      const gridRows = 28;
      const stride = gridCols + 1;
      const cellSegMeters = maxSpanMeters / gridCols;
      const cellChordSag =
        (cellSegMeters * cellSegMeters) / (8 * MARS_CONSTANTS.EQUATORIAL_RADIUS);
      const fillClearance = Math.max(
        0.7,
        Math.min(
          2500,
          cellChordSag * 1.25 + Math.max(camHeight * 0.00065, cellSegMeters * 0.025)
        )
      );
      const exag = viewer.scene.verticalExaggeration;

      const positions = new Float64Array(stride * (gridRows + 1) * 3);
      let pIdx = 0;
      for (let r = 0; r <= gridRows; r++) {
        const lat = bounds.southLat + (dLat * r) / gridRows;
        for (let c = 0; c <= gridCols; c++) {
          const lon = wrapLongitudeDeg(bounds.westLon + (dLon * c) / gridCols);
          const sample = sampleClimbingElevations(lat, lon);
          const climbElev = resolveLodClimbElevMeters(sample, camHeight);
          const cart = Cesium.Cartesian3.fromDegrees(
            lon,
            lat,
            climbElev * exag + fillClearance,
            marsEllipsoid
          );
          positions[pIdx++] = cart.x;
          positions[pIdx++] = cart.y;
          positions[pIdx++] = cart.z;
        }
      }

      const indices = new Uint16Array(gridRows * gridCols * 6);
      let idx = 0;
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          const i00 = r * stride + c;
          const i10 = i00 + 1;
          const i01 = i00 + stride;
          const i11 = i01 + 1;
          indices[idx++] = i00;
          indices[idx++] = i10;
          indices[idx++] = i11;
          indices[idx++] = i00;
          indices[idx++] = i11;
          indices[idx++] = i01;
        }
      }

      const geometry = new Cesium.Geometry({
        attributes: {
          position: new Cesium.GeometryAttribute({
            componentDatatype: Cesium.ComponentDatatype.DOUBLE,
            componentsPerAttribute: 3,
            values: positions,
          }),
        },
        indices,
        primitiveType: Cesium.PrimitiveType.TRIANGLES,
        boundingSphere: Cesium.BoundingSphere.fromVertices(positions),
      });

      const instance = new Cesium.GeometryInstance({
        geometry,
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(siteRectColor.withAlpha(0.20)),
        },
      });

      const primitive = new Cesium.Primitive({
        geometryInstances: instance,
        appearance: new Cesium.PerInstanceColorAppearance({
          flat: true,
          translucent: true,
          closed: false,
        }),
        asynchronous: false,
      });

      viewer.scene.primitives.add(primitive);
      sr.fillPrimitive = primitive;
      sr.builtDetailLevel = detailLevel;
    };

    const updateSiteRectGeometry = (bounds: SiteBounds) => {
      if (!sr.rectEntity) return;
      const { widthKm, heightKm } = computeRectangleDimensionsKm(bounds);
      sr.bounds = bounds;
      sr.ringSamples = buildSiteRectRingSamples(bounds);
      sr.ringSpanMeters = Math.max(widthKm, heightKm) * 1000;
      rebuildSiteFillPrimitive(bounds, getCameraDetailLevel());
      sr.rectEntity.show = true;
    };

    sr.cornerAEntity = viewer.entities.add({
      id: '__site-rect-corner-a',
      show: false,
      position: new Cesium.CallbackProperty(
        () => {
          if (!sr.cornerA) return Cesium.Cartesian3.fromDegrees(0, 0, 0, marsEllipsoid);
          const camHeight = getCameraHeightMeters();
          const segLen = sr.ringSpanMeters / 48;
          const clearance = Math.max(1.2, computePathClearanceMeters(camHeight, segLen) * 1.15);
          const elevMeters = sr.cornerA.visualSample
            ? resolveLodClimbElevMeters(sr.cornerA.visualSample, camHeight)
            : sr.cornerA.elevMeters;
          return getExaggeratedSurfacePosition(
            sr.cornerA.latDeg,
            sr.cornerA.lonDeg,
            elevMeters,
            clearance
          );
        },
        false
      ),
      point: {
        pixelSize: 8,
        color: siteRectColor,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    sr.cornerBEntity = viewer.entities.add({
      id: '__site-rect-corner-b',
      show: false,
      position: new Cesium.CallbackProperty(
        () => {
          if (!sr.cornerB) return Cesium.Cartesian3.fromDegrees(0, 0, 0, marsEllipsoid);
          const camHeight = getCameraHeightMeters();
          const segLen = sr.ringSpanMeters / 48;
          const clearance = Math.max(1.2, computePathClearanceMeters(camHeight, segLen) * 1.15);
          const elevMeters = sr.cornerB.visualSample
            ? resolveLodClimbElevMeters(sr.cornerB.visualSample, camHeight)
            : sr.cornerB.elevMeters;
          return getExaggeratedSurfacePosition(
            sr.cornerB.latDeg,
            sr.cornerB.lonDeg,
            elevMeters,
            clearance
          );
        },
        false
      ),
      point: {
        pixelSize: 8,
        color: siteRectColor,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    sr.rectEntity = viewer.entities.add({
      id: '__site-rect-area',
      show: false,
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          if (sr.ringSamples.length < 2) return [];
          return buildVisualClimbingPositions(sr.ringSamples, sr.ringSpanMeters * 4, 1.15);
        }, false),
        arcType: Cesium.ArcType.NONE,
        width: 2.75,
        material: siteRectColor.withAlpha(0.95),
      },
    });

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(65.0, 12.0, DEFAULT_CAMERA_HEIGHT_METERS, marsEllipsoid),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
    });

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const computeTerrainGeodesicArc = (
      cartoA: any,
      elevA: number,
      cartoB: any,
      elevB: number,
      segments: number,
      detailLevel: number
    ) => {
      const geodesic = new Cesium.EllipsoidGeodesic(cartoA, cartoB, marsEllipsoid);
      const totalHoriz = geodesic.surfaceDistance;
      const samples: Array<{ latDeg: number; lonDeg: number; elevMeters: number }> = [];
      let surfaceDistanceMeters = 0;

      for (let i = 0; i <= segments; i++) {
        const frac = i / segments;
        const c =
          i === 0
            ? cartoA
            : i === segments
              ? cartoB
              : geodesic.interpolateUsingFraction(frac);
        const latDeg = Cesium.Math.toDegrees(c.latitude);
        const lonDeg = Cesium.Math.toDegrees(c.longitude);
        const elevMeters =
          i === 0
            ? elevA
            : i === segments
              ? elevB
              : getMarsElevation(latDeg, lonDeg, detailLevel);
        samples.push({ latDeg, lonDeg, elevMeters });

        if (i > 0) {
          const dHoriz = totalHoriz / segments;
          const dElev = elevMeters - samples[i - 1].elevMeters;
          surfaceDistanceMeters += Math.hypot(dHoriz, dElev);
        }
      }
      return { samples, surfaceDistanceMeters };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buildVisualClimbingArc = (cartoA: any, cartoB: any, segments: number) => {
      const geodesic = new Cesium.EllipsoidGeodesic(cartoA, cartoB, marsEllipsoid);
      const spanMeters = geodesic.surfaceDistance;
      const samples: Array<{
        latDeg: number;
        lonDeg: number;
        elev0: number;
        elev4: number;
        elev11: number;
      }> = [];
      for (let i = 0; i <= segments; i++) {
        const frac = i / segments;
        const c =
          i === 0
            ? cartoA
            : i === segments
              ? cartoB
              : geodesic.interpolateUsingFraction(frac);
        samples.push(
          sampleClimbingElevations(
            Cesium.Math.toDegrees(c.latitude),
            Cesium.Math.toDegrees(c.longitude)
          )
        );
      }
      return { samples, spanMeters };
    };

    const pickMarsSurfacePoint = (screenPos: unknown) => {
      const ray = viewer.camera.getPickRay(screenPos);
      const terrainCartesian = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined;
      const pickedCartesian =
        terrainCartesian ?? viewer.camera.pickEllipsoid(screenPos, marsEllipsoid);
      if (!pickedCartesian) return null;
      const pickedCartographic = marsEllipsoid.cartesianToCartographic(pickedCartesian);
      if (!pickedCartographic) return null;
      const carto = Cesium.Cartographic.fromRadians(
        pickedCartographic.longitude,
        pickedCartographic.latitude,
        0
      );
      const latDeg = Cesium.Math.toDegrees(carto.latitude);
      const lonDeg = Cesium.Math.toDegrees(carto.longitude);
      const elevMeters = getMarsElevation(latDeg, lonDeg, getCameraDetailLevel());
      const cartesian = getExaggeratedSurfacePosition(
        latDeg,
        lonDeg,
        elevMeters,
        getAdaptiveMarkerOffset(40, 0.4)
      );
      return { cartesian, carto, latDeg, lonDeg, elevMeters };
    };

    // Real-time cursor coordinates + live measure preview. The globe picking work is throttled
    // to ~15/s so dragging the camera does not trigger a React state update every mouse event.
    let lastCursorMoveAt = 0;
    handler.setInputAction((movement: { endPosition: { x: number; y: number } }) => {
      lastCursorPositionRef.current = movement.endPosition;

      const now = performance.now();
      const inLiveMeasure = measureModeRef.current && ms.pointA && !ms.pointB;
      const inLiveSiteRect = siteAnalysisModeRef.current && sr.cornerA && !sr.cornerB;
      if (!inLiveMeasure && now - lastCursorMoveAt < CURSOR_PICK_THROTTLE_MS) return;
      lastCursorMoveAt = now;

      const pt = pickMarsSurfacePoint(movement.endPosition);
      if (!pt) {
        onCursorTelemetryChangeRef.current(null);
        if (measureModeRef.current && ms.pointA && !ms.pointB) {
          ms.hoverCartesian = null;
          ms.previewVisualSamples = [];
          ms.previewSpanMeters = 0;
          onMeasureLivePreviewChangeRef.current(null);
        }
        if (inLiveSiteRect) {
          onSiteRectLivePreviewChangeRef.current(null);
        }
        return;
      }

      onCursorTelemetryChangeRef.current({
        latDeg: pt.latDeg,
        lonDeg: pt.lonDeg,
        elevationMeters: pt.elevMeters,
      });

      if (measureModeRef.current && ms.pointA && !ms.pointB) {
        ms.hoverCartesian = pt.cartesian;
        const arc = computeTerrainGeodesicArc(
          ms.pointA.carto,
          ms.pointA.elevMeters,
          pt.carto,
          pt.elevMeters,
          20,
          getCameraDetailLevel()
        );
        const visualArc = buildVisualClimbingArc(ms.pointA.carto, pt.carto, 80);
        ms.previewVisualSamples = visualArc.samples;
        ms.previewSpanMeters = visualArc.spanMeters;
        onMeasureLivePreviewChangeRef.current({
          distanceMeters: arc.surfaceDistanceMeters,
          x: movement.endPosition.x,
          y: movement.endPosition.y,
        });
      }

      if (siteAnalysisModeRef.current && sr.cornerA && !sr.cornerB) {
        const previewBounds = normalizeSiteRectangle(
          sr.cornerA.latDeg,
          sr.cornerA.lonDeg,
          pt.latDeg,
          pt.lonDeg
        );
        updateSiteRectGeometry(previewBounds);
        onSiteRectLivePreviewChangeRef.current(computeRectangleDimensionsKm(previewBounds));
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // Ensure pressing/tapping anywhere on the Cesium canvas blurs the search input
    handler.setInputAction(() => {
      const searchInput = document.getElementById('searchInput');
      if (searchInput && document.activeElement === searchInput) {
        searchInput.blur();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    const resolvePickedTarget = (entityId: string) => {
      if (
        entityId.startsWith('__measure-') ||
        entityId.startsWith('__route-') ||
        entityId.startsWith('__site-rect') ||
        entityId.startsWith('__mars-region-')
      ) return undefined;
      const normalizedId = entityId.replace(/-(spacecraft|rover)$/, '');
      const found =
        MARS_TARGETS.find((t) => t.id === normalizedId) ??
        customPinsRef.current.find((t) => t.id === normalizedId);
      if (!found) return undefined;
      if (found.category === 'satellite' && !showSatellitesRef.current) return undefined;
      if (found.category === 'rover' && !showRoversRef.current) return undefined;
      return found;
    };

    const createTerrainRingSamples = (
      centerLatDeg: number,
      centerLonDeg: number,
      radiusKm: number,
      steps = 40
    ) => {
      const angRad = (radiusKm * 1000) / MARS_CONSTANTS.EQUATORIAL_RADIUS;
      const lat0 = (centerLatDeg * Math.PI) / 180;
      const lon0 = (centerLonDeg * Math.PI) / 180;
      const pts: Array<{ latDeg: number; lonDeg: number; elevationMeters: number }> = [];
      for (let i = 0; i <= steps; i++) {
        const brng = (i / steps) * Math.PI * 2;
        const sinLat =
          Math.sin(lat0) * Math.cos(angRad) +
          Math.cos(lat0) * Math.sin(angRad) * Math.cos(brng);
        const lat = Math.asin(Math.max(-1, Math.min(1, sinLat)));
        const lon =
          lon0 +
          Math.atan2(
            Math.sin(brng) * Math.sin(angRad) * Math.cos(lat0),
            Math.cos(angRad) - Math.sin(lat0) * Math.sin(lat)
          );
        const latD = (lat * 180) / Math.PI;
        const lonD = wrapLongitudeDeg((lon * 180) / Math.PI);
        pts.push({
          latDeg: latD,
          lonDeg: lonD,
          elevationMeters: getMarsElevation(latD, lonD, 4),
        });
      }
      return pts;
    };
    const getTerrainPositions = (
      samples: Array<{ latDeg: number; lonDeg: number; elevationMeters: number }>,
      offsetMeters: number
    ) =>
      samples.map((sample) =>
        getExaggeratedSurfacePosition(
          sample.latDeg,
          sample.lonDeg,
          sample.elevationMeters,
          offsetMeters
        )
      );

    const renderSurvivalRouteOnGlobe = (result: SurvivalRouteResult) => {
      rs.result = result;
      for (const ring of rs.pulseRingEntities) {
        viewer.entities.remove(ring);
      }
      rs.pulseRingEntities = [];

      const spanMeters = result.directDistanceKm * 1000;
      const routeDetailLevel = spanMeters < 5000 ? 11 : spanMeters < 80_000 ? 8 : 4;
      const directOffset = Math.max(0.4, Math.min(60, spanMeters * 0.012));
      const optimalOffset = Math.max(0.6, Math.min(80, spanMeters * 0.015));

      if (rs.directLineEntity) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const poly = rs.directLineEntity.polyline as any;
        if (poly) {
          const samples = result.directArcPoints.map((pt) => ({
            latDeg: pt.latDeg,
            lonDeg: pt.lonDeg,
            elevationMeters: getMarsElevation(pt.latDeg, pt.lonDeg, routeDetailLevel),
          }));
          poly.positions = new Cesium.CallbackProperty(
            () => getTerrainPositions(samples, directOffset),
            false
          );
        }
        rs.directLineEntity.show = true;
      }

      if (rs.optimalLineEntity) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const poly = rs.optimalLineEntity.polyline as any;
        if (poly) {
          const samples = result.waypoints.map((waypoint) => ({
            latDeg: waypoint.latDeg,
            lonDeg: waypoint.lonDeg,
            elevationMeters: getMarsElevation(waypoint.latDeg, waypoint.lonDeg, routeDetailLevel),
          }));
          poly.positions = new Cesium.CallbackProperty(
            () => getTerrainPositions(samples, optimalOffset),
            false
          );
        }
        rs.optimalLineEntity.show = true;
      }

      // Pulsing highlight rings around encountered Rovers (orange) & Satellite Relay corridors (cyan)
      const maxRingDistKm = Math.max(25, result.directDistanceKm * 0.75);
      const roverRingRadiusKm = Math.min(120, Math.max(0.4, result.directDistanceKm * 0.15));
      const satRingRadiusKm = Math.min(85, Math.max(0.4, result.directDistanceKm * 0.12));

      result.roverEncounters.forEach((enc, idx) => {
        if (result.directDistanceKm < 25 && enc.closestKm > maxRingDistKm) return;
        const ringSamples = createTerrainRingSamples(
          enc.target.latitude,
          enc.target.longitude,
          roverRingRadiusKm
        );
        const baseColor = Cesium.Color.fromCssColorString('#FF6B35');
        const ringEntity = viewer.entities.add({
          id: `__route-pulse-rover-${idx}`,
          polyline: {
            positions: new Cesium.CallbackProperty(
              () => getTerrainPositions(ringSamples, optimalOffset),
              false
            ),
            width: 3,
            arcType: Cesium.ArcType.GEODESIC,
            material: new Cesium.ColorMaterialProperty(
              new Cesium.CallbackProperty(
                () =>
                  baseColor.withAlpha(
                    0.32 + 0.63 * (0.5 + 0.5 * Math.sin(performance.now() * 0.0055 + idx))
                  ),
                false
              )
            ),
          },
        });
        rs.pulseRingEntities.push(ringEntity);
      });

      result.orbiterEncounters.forEach((sat, idx) => {
        if (result.directDistanceKm < 25 && sat.closestKm > maxRingDistKm) return;
        const ringSamples = createTerrainRingSamples(
          sat.crossLatDeg,
          sat.crossLonDeg,
          satRingRadiusKm
        );
        const baseColor = Cesium.Color.fromCssColorString('#22D3EE');
        const ringEntity = viewer.entities.add({
          id: `__route-pulse-sat-${idx}`,
          polyline: {
            positions: new Cesium.CallbackProperty(
              () => getTerrainPositions(ringSamples, optimalOffset),
              false
            ),
            width: 2.5,
            arcType: Cesium.ArcType.GEODESIC,
            material: new Cesium.ColorMaterialProperty(
              new Cesium.CallbackProperty(
                () =>
                  baseColor.withAlpha(
                    0.28 + 0.58 * (0.5 + 0.5 * Math.sin(performance.now() * 0.0045 + idx + 1.4))
                  ),
                false
              )
            ),
          },
        });
        rs.pulseRingEntities.push(ringEntity);
      });
    };

    handler.setInputAction((click: { position: { x: number; y: number } }) => {
      const searchInput = document.getElementById('searchInput');
      if (searchInput && document.activeElement === searchInput) {
        searchInput.blur();
      }

      // Drop Temporary Pin Mode Click Handling
      if (dropPinModeRef.current) {
        const pt = pickMarsSurfacePoint(click.position);
        if (!pt) return;
        onCursorTelemetryChangeRef.current({
          latDeg: pt.latDeg,
          lonDeg: pt.lonDeg,
          elevationMeters: pt.elevMeters,
        });
        onDropPinPointRef.current({
          latDeg: pt.latDeg,
          lonDeg: pt.lonDeg,
          elevMeters: pt.elevMeters,
        });
        return;
      }

      // Site Habitability Rectangular Area Selection Click Handling
      if (siteAnalysisModeRef.current) {
        const pt = pickMarsSurfacePoint(click.position);
        if (!pt) return;
        onCursorTelemetryChangeRef.current({
          latDeg: pt.latDeg,
          lonDeg: pt.lonDeg,
          elevationMeters: pt.elevMeters,
        });

        if (!sr.cornerA || sr.cornerB) {
          sr.cornerA = {
            latDeg: pt.latDeg,
            lonDeg: pt.lonDeg,
            elevMeters: pt.elevMeters,
            visualSample: sampleClimbingElevations(pt.latDeg, pt.lonDeg),
          };
          sr.cornerB = null;
          sr.bounds = null;
          sr.ringSamples = [];
          sr.ringSpanMeters = 0;
          sr.builtDetailLevel = null;
          removeSiteFillPrimitive();
          if (sr.cornerAEntity) sr.cornerAEntity.show = true;
          if (sr.cornerBEntity) sr.cornerBEntity.show = false;
          if (sr.rectEntity) sr.rectEntity.show = false;
          onSiteRectHasCornerAChangeRef.current(true);
          onSiteRectLivePreviewChangeRef.current(null);
        } else {
          sr.cornerB = {
            latDeg: pt.latDeg,
            lonDeg: pt.lonDeg,
            elevMeters: pt.elevMeters,
            visualSample: sampleClimbingElevations(pt.latDeg, pt.lonDeg),
          };
          if (sr.cornerBEntity) sr.cornerBEntity.show = true;
          const finalBounds = normalizeSiteRectangle(
            sr.cornerA.latDeg,
            sr.cornerA.lonDeg,
            pt.latDeg,
            pt.lonDeg
          );
          updateSiteRectGeometry(finalBounds);
          onSiteRectLivePreviewChangeRef.current(null);
          onSiteRectCompleteRef.current(finalBounds);
        }
        return;
      }

      // Optimal Survival Route Pathfinder Click Handling (Globe surface OR existing pins)
      if (routeModeRef.current) {
        let pickedEndpoint: RouteEndpoint | null = null;
        const pickedObj = viewer.scene.pick(click.position);
        if (pickedObj?.id) {
          const matchedPin = resolvePickedTarget(pickedObj.id.id);
          if (matchedPin && matchedPin.category !== 'satellite') {
            pickedEndpoint = {
              latDeg: matchedPin.latitude,
              lonDeg: matchedPin.longitude,
              elevMeters: getMarsElevation(
                matchedPin.latitude,
                matchedPin.longitude,
                getCameraDetailLevel()
              ),
              label: matchedPin.shortName,
            };
          }
        }

        if (!pickedEndpoint) {
          const surfacePt = pickMarsSurfacePoint(click.position);
          if (!surfacePt) return;
          pickedEndpoint = {
            latDeg: surfacePt.latDeg,
            lonDeg: surfacePt.lonDeg,
            elevMeters: surfacePt.elevMeters,
          };
        }

        onCursorTelemetryChangeRef.current({
          latDeg: pickedEndpoint.latDeg,
          lonDeg: pickedEndpoint.lonDeg,
          elevationMeters: pickedEndpoint.elevMeters,
        });

        if (!rs.start || rs.hasResult) {
          // 1st click or fresh Start after a completed route
          for (const ring of rs.pulseRingEntities) {
            viewer.entities.remove(ring);
          }
          rs.pulseRingEntities = [];
          rs.start = pickedEndpoint;
          rs.destination = null;
          rs.result = null;
          rs.hasResult = false;
          if (rs.startEntity) {
            rs.startEntity.show = true;
          }
          if (rs.destEntity) rs.destEntity.show = false;
          if (rs.optimalLineEntity) rs.optimalLineEntity.show = false;
          if (rs.directLineEntity) rs.directLineEntity.show = false;
          onRouteStartChangeRef.current(pickedEndpoint);
          onRouteResultChangeRef.current(null);
        } else {
          // 2nd click: set Destination and run A* multi-objective survival solver
          rs.destination = pickedEndpoint;
          if (rs.destEntity) {
            rs.destEntity.show = true;
          }
          const result = computeOptimalSurvivalRoute(
            rs.start,
            pickedEndpoint,
            loadedTemperatureLsRef.current ?? 0
          );
          rs.hasResult = true;
          renderSurvivalRouteOnGlobe(result);
          onRouteResultChangeRef.current(result);
        }
        return;
      }

      // Measure Mode Click Handling (Point A -> Point B -> 3rd click starts fresh)
      if (measureModeRef.current) {
        const pt = pickMarsSurfacePoint(click.position);
        if (!pt) return;

        onCursorTelemetryChangeRef.current({
          latDeg: pt.latDeg,
          lonDeg: pt.lonDeg,
          elevationMeters: pt.elevMeters,
        });

        if (!ms.pointA || ms.pointB) {
          // 1st click or 3rd click: place fresh Point A
          ms.pointA = {
            ...pt,
            visualSample: sampleClimbingElevations(pt.latDeg, pt.lonDeg),
          };
          ms.pointB = null;
          ms.hoverCartesian = pt.cartesian;
          ms.previewVisualSamples = [];
          ms.previewSpanMeters = 0;
          ms.lockedVisualSamples = [];
          ms.lockedSpanMeters = 0;
          if (ms.pointAEntity) {
            ms.pointAEntity.show = true;
          }
          if (ms.pointBEntity) ms.pointBEntity.show = false;
          if (ms.lockedLineEntity) ms.lockedLineEntity.show = false;
          if (ms.previewLineEntity) ms.previewLineEntity.show = true;
          onMeasureHasPointAChangeRef.current(true);
          onMeasureResultChangeRef.current(null);
          onMeasureLivePreviewChangeRef.current({
            distanceMeters: 0,
            x: click.position.x,
            y: click.position.y,
          });
        } else {
          // 2nd click: place Point B & lock terrain-climbing 3D geodesic line (without altering true surfaceDistanceMeters)
          ms.pointB = {
            ...pt,
            visualSample: sampleClimbingElevations(pt.latDeg, pt.lonDeg),
          };
          ms.hoverCartesian = null;
          const arc = computeTerrainGeodesicArc(
            ms.pointA.carto,
            ms.pointA.elevMeters,
            pt.carto,
            pt.elevMeters,
            48,
            getCameraDetailLevel()
          );
          const lockedVisualSegments = Math.max(
            96,
            Math.min(220, Math.ceil(arc.surfaceDistanceMeters / 6000))
          );
          const visualArc = buildVisualClimbingArc(
            ms.pointA.carto,
            pt.carto,
            lockedVisualSegments
          );
          ms.previewVisualSamples = [];
          ms.previewSpanMeters = 0;
          ms.lockedVisualSamples = visualArc.samples;
          ms.lockedSpanMeters = visualArc.spanMeters;
          if (ms.pointBEntity) {
            ms.pointBEntity.show = true;
          }
          if (ms.previewLineEntity) ms.previewLineEntity.show = false;
          if (ms.lockedLineEntity) {
            ms.lockedLineEntity.show = true;
          }

          onMeasureLivePreviewChangeRef.current(null);
          onMeasureResultChangeRef.current({
            pointA: {
              latDeg: ms.pointA.latDeg,
              lonDeg: ms.pointA.lonDeg,
              elevMeters: ms.pointA.elevMeters,
            },
            pointB: {
              latDeg: pt.latDeg,
              lonDeg: pt.lonDeg,
              elevMeters: pt.elevMeters,
            },
            surfaceDistanceMeters: arc.surfaceDistanceMeters,
            elevationDeltaMeters: pt.elevMeters - ms.pointA.elevMeters,
          });
        }
        return;
      }

      const tappedPt = pickMarsSurfacePoint(click.position);
      onCursorTelemetryChangeRef.current(
        tappedPt
          ? {
              latDeg: tappedPt.latDeg,
              lonDeg: tappedPt.lonDeg,
              elevationMeters: tappedPt.elevMeters,
            }
          : null
      );

      const picked = viewer.scene.pick(click.position);
      if (picked?.id) {
        if (picked.id.id.startsWith('__mars-region-')) return;
        const matched = resolvePickedTarget(picked.id.id);
        if (matched) {
          onSelectTargetRef.current(
            matched.id === selectedTargetIdRef.current ? null : matched
          );
          return;
        }
      }
      onSelectTargetRef.current(null);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((doubleClick: { position: unknown }) => {
      if (
        measureModeRef.current ||
        routeModeRef.current ||
        dropPinModeRef.current ||
        siteAnalysisModeRef.current
      ) {
        return;
      }
      const picked = viewer.scene.pick(doubleClick.position);
      if (picked?.id) {
        const matched = resolvePickedTarget(picked.id.id);
        if (matched) {
          onSelectTargetRef.current(matched);
          zoomToTargetInternal(matched);
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    // Scratch vectors for zero-allocation camera-relative Google Earth lighting
    const scratchSubCamNormal = new Cesium.Cartesian3();
    const scratchCamDir = new Cesium.Cartesian3();
    const scratchCamUp = new Cesium.Cartesian3();
    const scratchCamRight = new Cesium.Cartesian3();
    const scratchLightDir = new Cesium.Cartesian3();
    const scratchAtmosphereCameraNormal = new Cesium.Cartesian3();
    const marsSunDirection = Cesium.Cartesian3.normalize(
      new Cesium.Cartesian3(-0.66, -0.42, -0.623),
      new Cesium.Cartesian3()
    );

    // SunLight has no mutable direction vector; use DirectionalLight so the
    // preUpdate callback can hold the terminator at a constant camera-relative angle.
    viewer.scene.light = new Cesium.DirectionalLight({ direction: marsSunDirection });

    const updateCameraDaylight = () => {
      if (viewer.isDestroyed()) return;

      if (!sunShadowEnabledRef.current || mapStyleRef.current !== 'optical') {
        return;
      }

      const sceneLight = viewer.scene.light as { direction?: unknown } | undefined;
      if (!sceneLight?.direction) return;

      const camPos = viewer.camera.positionWC;
      const camDir = viewer.camera.directionWC;
      const camUpRaw = (viewer.camera as any).upWC ?? (viewer.camera as any).up;
      if (
        !camPos ||
        !camDir ||
        !camUpRaw ||
        Cesium.Cartesian3.magnitudeSquared(camPos) <= 1e-8 ||
        Cesium.Cartesian3.magnitudeSquared(camDir) <= 1e-8 ||
        Cesium.Cartesian3.magnitudeSquared(camUpRaw) <= 1e-8
      ) {
        return;
      }

      Cesium.Cartesian3.normalize(camPos, scratchSubCamNormal);
      Cesium.Cartesian3.normalize(camDir, scratchCamDir);
      Cesium.Cartesian3.normalize(camUpRaw, scratchCamUp);
      Cesium.Cartesian3.cross(scratchCamDir, scratchCamUp, scratchCamRight);
      if (Cesium.Cartesian3.magnitudeSquared(scratchCamRight) > 1e-8) {
        Cesium.Cartesian3.normalize(scratchCamRight, scratchCamRight);
      } else {
        scratchCamRight.x = 0;
        scratchCamRight.y = 0;
        scratchCamRight.z = 0;
      }

      // Match eye-space lightDirEC = (+0.66, +0.42, +0.623) so the shadow origin is pitch black
      // along the dark crescent and fades smoothly into the sunlit Martian hemisphere.
      scratchLightDir.x =
        0.623 * scratchCamDir.x - 0.66 * scratchCamRight.x - 0.42 * scratchCamUp.x;
      scratchLightDir.y =
        0.623 * scratchCamDir.y - 0.66 * scratchCamRight.y - 0.42 * scratchCamUp.y;
      scratchLightDir.z =
        0.623 * scratchCamDir.z - 0.66 * scratchCamRight.z - 0.42 * scratchCamUp.z;

      if (Cesium.Cartesian3.magnitudeSquared(scratchLightDir) > 1e-8) {
        Cesium.Cartesian3.normalize(scratchLightDir, scratchLightDir);
        Cesium.Cartesian3.clone(scratchLightDir, sceneLight.direction);
      }
    };

    updateCameraDaylight();

    // preUpdate runs right before UniformState updates frame lighting
    const removePreUpdate = viewer.scene.preUpdate.addEventListener(() => {
      updateCameraDaylight();
    });

    // preRender: Horizon-Occlusion & Satellite/Rover LOD
    const removePreRender = viewer.scene.preRender.addEventListener(() => {
      if (viewer.isDestroyed()) return;

      const occluder = new Cesium.EllipsoidalOccluder(marsEllipsoid, viewer.camera.positionWC);

      for (const target of MARS_TARGETS) {
        const pin = pinMap.get(target.id);
        if (!pin) continue;

        if (target.category === 'satellite') {
          const spacecraftEntity = spacecraftMap.get(target.id);
          if (!showSatellitesRef.current) {
            pin.show = false;
            if (spacecraftEntity) spacecraftEntity.show = false;
            continue;
          }
          const satPosition = pin.position?.getValue
            ? pin.position.getValue(viewer.clock.currentTime)
            : undefined;
          if (satPosition) {
            const isFront = occluder.isPointVisible(satPosition);
            const distMeters = Cesium.Cartesian3.distance(viewer.camera.positionWC, satPosition);
            const isCloseUp = distMeters <= 120000;

            pin.show = isFront;

            if (spacecraftEntity) {
              spacecraftEntity.show = isFront && isCloseUp;
            }

            if (satCloseState.get(target.id) !== isCloseUp) {
              satCloseState.set(target.id, isCloseUp);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const badgeBillboard = pin.billboard as any;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const badgeLabel = pin.label as any;
              if (badgeBillboard) {
                badgeBillboard.show = !isCloseUp;
              }
              if (badgeLabel) {
                badgeLabel.pixelOffset = isCloseUp ? closeLabelOffset : farLabelOffset;
                badgeLabel.scale = isCloseUp ? 0.85 : 1.0;
              }
            }
          }
        } else if (target.category === 'rover') {
          const roverSpriteEntity = roverMap.get(target.id);
          if (!showRoversRef.current) {
            pin.show = false;
            if (roverSpriteEntity) roverSpriteEntity.show = false;
            continue;
          }
          const roverPositionProperty = roverPositions.get(target.id) as any;
          const roverPosition = roverPositionProperty?.getValue(viewer.clock.currentTime);
          if (roverPosition) {
            const isFront = occluder.isPointVisible(roverPosition);
            const distMeters = Cesium.Cartesian3.distance(viewer.camera.positionWC, roverPosition);
            const isCloseUp = distMeters <= 35000;
            const isPrimaryOrSelected =
              PRIMARY_GLOBAL_ROVER_IDS.has(target.id) || selectedTargetIdRef.current === target.id;

            pin.show =
              isFront && (isPrimaryOrSelected || distMeters <= SURFACE_SECONDARY_PIN_MAX_DIST_METERS);

            if (roverSpriteEntity) {
              roverSpriteEntity.show = isFront && isCloseUp;
            }

            if (roverCloseState.get(target.id) !== isCloseUp) {
              roverCloseState.set(target.id, isCloseUp);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const badgeBillboard = pin.billboard as any;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const badgeLabel = pin.label as any;
              if (badgeBillboard) {
                badgeBillboard.show = !isCloseUp;
              }
              if (badgeLabel) {
                badgeLabel.verticalOrigin = isCloseUp
                  ? Cesium.VerticalOrigin.TOP
                  : Cesium.VerticalOrigin.BOTTOM;
                badgeLabel.pixelOffset = isCloseUp ? roverCloseLabelOffset : farLabelOffset;
                badgeLabel.scale = isCloseUp ? 0.9 : 1.0;
              }
            }
          }
        } else {
          const surfacePositionProperty = surfaceHorizonPoints.get(target.id) as any;
          const surfacePoint = surfacePositionProperty?.getValue(viewer.clock.currentTime);
          if (surfacePoint) {
            const isFront = occluder.isPointVisible(surfacePoint);
            if (!isFront) {
              pin.show = false;
            } else {
              const isPrimaryOrSelected =
                PRIMARY_GLOBAL_LANDMARK_IDS.has(target.id) ||
                selectedTargetIdRef.current === target.id;
              if (isPrimaryOrSelected) {
                pin.show = true;
              } else {
                const distMeters = Cesium.Cartesian3.distance(
                  viewer.camera.positionWC,
                  surfacePoint
                );
                pin.show = distMeters <= SURFACE_SECONDARY_PIN_MAX_DIST_METERS;
              }
            }
          }
        }
      }

      for (const entry of customPinEntitiesRef.current.values()) {
        const pos = entry.horizonPos?.getValue
          ? entry.horizonPos.getValue(viewer.clock.currentTime)
          : undefined;
        entry.entity.show = pos ? occluder.isPointVisible(pos) : false;
      }
    });

    // postRender: Progressive MRO CTX fade, atmospheric limb scale, compass heading, camera scale, and cursor telemetry
    let lastHeading = 0;
    let lastHeadingAt = 0;
    let lastCameraTelemetryAt = 0;

    let lastCursorPickAt = 0;
    let hasCursorCameraBaseline = false;
    let lastGroundScaleAt = 0;
    let sampledMetersPerPixel = 0;
    const lastCursorCameraPosition = new Cesium.Cartesian3();
    const lastCursorCameraDirection = new Cesium.Cartesian3();

    // Adaptive quality: sample real frame rate and drop FXAA if we cannot hold 60 FPS.
    let fpsWindowStart = performance.now();
    let fpsFrameCount = 0;
    let fxaaDisabled = false;

    const removePostRender = viewer.scene.postRender.addEventListener(() => {
      if (viewer.isDestroyed()) return;

      const now = performance.now();

      // Frame-rate sampler: FXAA is a full-screen pass, so shed it when the budget is missed.
      fpsFrameCount += 1;
      if (now - fpsWindowStart >= FPS_SAMPLE_WINDOW_MS) {
        const measuredFps = (fpsFrameCount * 1000) / (now - fpsWindowStart);
        if (measuredFps < FXAA_DISABLE_FPS_THRESHOLD && !fxaaDisabled) {
          fxaaDisabled = true;
          const fxaaStage = viewer.scene.postProcessStages?.fxaa;
          if (fxaaStage) fxaaStage.enabled = false;
        }
        fpsWindowStart = now;
        fpsFrameCount = 0;
      }

      const camCarto = marsEllipsoid.cartesianToCartographic(viewer.camera.positionWC);
      const camHeight = camCarto ? camCarto.height : DEFAULT_CAMERA_HEIGHT_METERS;
      const atmosphereOverlay = amberHazeOverlayRef.current;
      if (atmosphereOverlay) {
        const altitudeProgress = Cesium.Math.clamp((15000 - camHeight) / 12500, 0.0, 1.0);
        const altitudeFade = altitudeProgress * altitudeProgress * (3.0 - 2.0 * altitudeProgress);
        Cesium.Cartesian3.normalize(viewer.camera.positionWC, scratchAtmosphereCameraNormal);
        const daylightDot = Cesium.Cartesian3.dot(scratchAtmosphereCameraNormal, marsSunDirection);
        const daylightFade = Cesium.Math.clamp((daylightDot + 0.04) / 0.16, 0.0, 1.0);
        const overlayOpacity = altitudeFade * daylightFade;
        if (Math.abs(Number(atmosphereOverlay.style.opacity) - overlayOpacity) > 0.002) {
          atmosphereOverlay.style.opacity = overlayOpacity.toFixed(3);
        }
      }
      const ctxOpacity = getCtxFadeAlpha(camHeight);
      // Restrict the warm iron-oxide grade to low-altitude optical views.
      const t = Cesium.Math.clamp((10000 - camHeight) / 9000, 0.0, 1.0);
      if (mapStyleRef.current === 'optical' || mapStyleRef.current === 'radiation') {
        applyOpticalColorForAltitude(
          vikingLayerRef.current,
          t,
          mapStyleRef.current === 'optical'
        );
        applyCtxColorForAltitude(ctxLayerRef.current, camHeight);
      }
      if (ctxLayerRef.current) {
        ctxLayerRef.current.alpha = ctxOpacity;
        ctxLayerRef.current.show = mapStyleRef.current === 'optical' && ctxOpacity > 0.003;
      }

      const cloudShell = cloudShellPrimitiveRef.current;
      if (cloudShell) {
        const cloudOpacity = getCloudFadeAlpha(camHeight) * cloudModeBlendRef.current;
        const showClouds = cloudOpacity > 0.003;
        cloudShell.show = showClouds;
        if (showClouds) {
          const uniforms = cloudShell.appearance?.material?.uniforms;
          if (uniforms) {
            uniforms.u_opacity = cloudOpacity;
            uniforms.u_shadowEnabled =
              sunShadowEnabledRef.current && mapStyleRef.current === 'optical' ? 1.0 : 0.0;
          }
        }
      }

      // Butterscotch-amber sky and ground atmosphere fade in from 150 km
      // and reach full strength by 20 km, independently of the low-altitude surface color grade.
      const atmosphereProgress = Cesium.Math.clamp((150000 - camHeight) / 130000, 0.0, 1.0);
      const atmT = atmosphereProgress * atmosphereProgress * (3.0 - 2.0 * atmosphereProgress);
      const atmVisible = atmT > 0.002;
      const targetHueShift = Cesium.Math.lerp(0.0, -0.55, atmT);
      const targetSaturationShift = Cesium.Math.lerp(0.0, 0.05, atmT);
      const targetBrightnessShift = Cesium.Math.lerp(-1.0, -0.45, atmT);
      const targetSkyLightIntensity = 100.0 * atmT;
      const targetGlobeLightIntensity = 50.0 * atmT;
      const skyAtmosphere = viewer.scene.skyAtmosphere;
      if (skyAtmosphere) {
        if (skyAtmosphere.show !== atmVisible) {
          skyAtmosphere.show = atmVisible;
        }
        if (
          Math.abs(skyAtmosphere.hueShift - targetHueShift) > 0.001 ||
          Math.abs(skyAtmosphere.saturationShift - targetSaturationShift) > 0.001 ||
          Math.abs(skyAtmosphere.brightnessShift - targetBrightnessShift) > 0.001 ||
          Math.abs((skyAtmosphere.atmosphereLightIntensity ?? 0) - targetSkyLightIntensity) > 0.05
        ) {
          skyAtmosphere.hueShift = targetHueShift;
          skyAtmosphere.saturationShift = targetSaturationShift;
          skyAtmosphere.brightnessShift = targetBrightnessShift;
          skyAtmosphere.atmosphereLightIntensity = targetSkyLightIntensity;
        }
      }
      if (viewer.scene.globe.showGroundAtmosphere !== atmVisible) {
        viewer.scene.globe.showGroundAtmosphere = atmVisible;
      }
      if (
        Math.abs((viewer.scene.globe.atmosphereHueShift ?? 0.0) - targetHueShift) > 0.001 ||
        Math.abs((viewer.scene.globe.atmosphereSaturationShift ?? 0.0) - targetSaturationShift) > 0.001 ||
        Math.abs((viewer.scene.globe.atmosphereBrightnessShift ?? -1.0) - targetBrightnessShift) > 0.001 ||
        Math.abs(viewer.scene.globe.atmosphereLightIntensity - targetGlobeLightIntensity) > 0.05
      ) {
        viewer.scene.globe.atmosphereHueShift = targetHueShift;
        viewer.scene.globe.atmosphereSaturationShift = targetSaturationShift;
        viewer.scene.globe.atmosphereBrightnessShift = targetBrightnessShift;
        viewer.scene.globe.atmosphereLightIntensity = targetGlobeLightIntensity;
      }
      if (viewer.scene.fog) {
        const targetFogDensity = 0.0000032 * t;
        if (
          viewer.scene.fog.enabled !== atmVisible ||
          Math.abs((viewer.scene.fog.density ?? 0) - targetFogDensity) > 0.0000001
        ) {
          viewer.scene.fog.enabled = atmVisible;
          viewer.scene.fog.density = targetFogDensity;
        }
      }

      // Throttle the compass heading React update to ~10/s instead of every rendered frame.
      const currentHeading = viewer.camera.heading;
      if (
        Math.abs(currentHeading - lastHeading) > 0.003 &&
        now - lastHeadingAt >= HEADING_THROTTLE_MS
      ) {
        lastHeading = currentHeading;
        lastHeadingAt = now;
        onHeadingChangeRef.current(currentHeading);
      }

      if (now - lastCameraTelemetryAt >= 150) {
        lastCameraTelemetryAt = now;
        const cameraPosition = viewer.camera.positionWC;
        const cameraDirection = viewer.camera.directionWC;
        const cameraMoved =
          !hasCursorCameraBaseline ||
          Cesium.Cartesian3.distance(lastCursorCameraPosition, cameraPosition) > 1 ||
          Cesium.Cartesian3.distance(lastCursorCameraDirection, cameraDirection) > 0.0001;
        Cesium.Cartesian3.clone(cameraPosition, lastCursorCameraPosition);
        Cesium.Cartesian3.clone(cameraDirection, lastCursorCameraDirection);
        hasCursorCameraBaseline = true;

        const cameraCarto = marsEllipsoid.cartesianToCartographic(viewer.camera.positionWC);
        if (cameraCarto) {
          const altitudeAboveEllipsoid = Math.max(0, cameraCarto.height);

          const frustum = (viewer.camera as any).frustum;
          const verticalFov = frustum?.fovy ?? frustum?.fov ?? Cesium.Math.toRadians(60);
          const altitudeScaleFallback =
            (2 * altitudeAboveEllipsoid * Math.tan(verticalFov / 2)) /
            Math.max(1, viewer.scene.canvas.clientHeight);

          if (cameraMoved && now - lastGroundScaleAt >= 300) {
            lastGroundScaleAt = now;
            const canvasWidth = viewer.scene.canvas.clientWidth;
            const canvasHeight = viewer.scene.canvas.clientHeight;
            const centerX = canvasWidth / 2;
            const centerY = canvasHeight / 2;
            const leftX = Math.max(0, centerX - 100);
            const rightX = Math.min(canvasWidth, centerX + 100);
            const pickGroundPoint = (x: number) => {
              const windowPosition = new Cesium.Cartesian2(x, centerY);
              const ray = viewer.camera.getPickRay(windowPosition);
              const point = ray
                ? viewer.scene.globe.pick(ray, viewer.scene) ??
                  viewer.camera.pickEllipsoid(windowPosition, marsEllipsoid)
                : viewer.camera.pickEllipsoid(windowPosition, marsEllipsoid);
              const surface = point && marsEllipsoid.cartesianToCartographic(point);
              return surface
                ? Cesium.Cartographic.fromRadians(surface.longitude, surface.latitude, 0)
                : undefined;
            };
            const leftSurface = pickGroundPoint(leftX);
            const rightSurface = pickGroundPoint(rightX);
            if (leftSurface && rightSurface && rightX > leftX) {
              const geodesic = new Cesium.EllipsoidGeodesic(
                leftSurface,
                rightSurface,
                marsEllipsoid
              );
              sampledMetersPerPixel = geodesic.surfaceDistance / (rightX - leftX);
            } else {
              sampledMetersPerPixel = 0;
            }
          }
          const metersPerPixel = sampledMetersPerPixel || altitudeScaleFallback;

          const tiltDeg = Math.max(
            0,
            Math.min(80, 90 + Cesium.Math.toDegrees(viewer.camera.pitch))
          );
          onCameraTelemetryChangeRef.current({
            altitudeAboveEllipsoidMeters: altitudeAboveEllipsoid,
            metersPerPixel,
            tiltDeg,
          });
        }

        const cursorPosition = lastCursorPositionRef.current;
        if (cursorPosition && cameraMoved && now - lastCursorPickAt >= 250) {
          lastCursorPickAt = now;
          const cursorPoint = pickMarsSurfacePoint(cursorPosition);
          onCursorTelemetryChangeRef.current(
            cursorPoint
              ? {
                  latDeg: cursorPoint.latDeg,
                  lonDeg: cursorPoint.lonDeg,
                  elevationMeters: cursorPoint.elevMeters,
                }
              : null
          );
        }

        const currentDetail = getCameraDetailLevel();
        if (sr.bounds && sr.builtDetailLevel !== currentDetail) {
          rebuildSiteFillPrimitive(sr.bounds, currentDetail);
        }
      }
    });

    const canvas = viewer.scene.canvas;
    const handlePointerLeave = () => {
      lastCursorPositionRef.current = null;
      onCursorTelemetryChangeRef.current(null);
    };
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL context lost. Attempting recovery...');
    };
    const handleContextRestored = () => {
      setWebglError(null);
    };
    const handleContainerWheel = (e: WheelEvent) => {
      cancelCameraOrientationAnimation();
      // Prevent browser tab zoom when pinching on a laptop trackpad (ctrlKey + wheel)
      if (e.ctrlKey && e.cancelable) {
        e.preventDefault();
      }
    };
    container.addEventListener('wheel', handleContainerWheel, { passive: false });
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);
    canvas.addEventListener('pointerleave', handlePointerLeave);

    let rafId = 0;
    let lastFrameTime = performance.now();
    let lastUiSyncTime = 0;

    const tickOrbit = (now: number) => {
      const dtSec = Math.min(0.1, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      if (telemetryModeRef.current === 'simulation100x') {
        simBoostMsRef.current += dtSec * 99 * 1000;
      }

      // Only recompute live orbiter telemetry while satellites are actually rendered; the
      // simulation boost still advances above so the clock stays continuous when re-shown.
      if (showSatellitesRef.current && now - lastUiSyncTime > 250) {
        lastUiSyncTime = now;
        const effectiveMs = getEffectiveEpochMs();
        const satUpdates: Record<string, LiveSatellitePosition> = {};
        for (const target of MARS_TARGETS) {
          if (target.category === 'satellite' && target.orbit) {
            const liveElem = liveOrbiterElementsRef.current[target.id];
            const pos = computeSatelliteCartesian(target, effectiveMs, liveElem);
            satUpdates[target.id] = {
              latDeg: pos.latDeg,
              lonDeg: pos.lonDeg,
              altKm: pos.altKm,
              velocityKmS: pos.velocityKmS,
              source: liveElem?.source ?? 'utc-keplerian',
            };
          }
        }
        onLiveSatellitesUpdateRef.current(satUpdates);
      }

      rafId = requestAnimationFrame(tickOrbit);
    };
    rafId = requestAnimationFrame(tickOrbit);

    // Keep the loading image up for at least 10s; if the globe is slower, wait for it.
    const LOADING_MIN_MS = 10_000;
    const readyAt = performance.now();
    const reveal = () => {
      setIsReady(true);
      onGlobeReady?.(true);
    };
    const elapsed = readyAt - (loadingStartedAtRef.current ?? readyAt);
    if (elapsed >= LOADING_MIN_MS) {
      reveal();
    } else {
      window.setTimeout(reveal, LOADING_MIN_MS - elapsed);
    }

    return () => {
      stopContinuousZoomInternal();
      cancelAnimationFrame(rafId);
      if (cameraAnimationFrameRef.current !== null) {
        cancelAnimationFrame(cameraAnimationFrameRef.current);
        cameraAnimationFrameRef.current = null;
      }
      removePreUpdate();
      removePreRender();
      removePostRender();
      removeRenderError?.();
      if (layerTransitionFrameRef.current !== null) {
        window.cancelAnimationFrame(layerTransitionFrameRef.current);
        layerTransitionFrameRef.current = null;
      }
      container.removeEventListener('wheel', handleContainerWheel);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      handler.destroy();
      unbindVikingErr();
      unbindCtxErr();
      unbindShadeErr();
      removeSiteFillPrimitive();
      if (cloudShellPrimitiveRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(cloudShellPrimitiveRef.current);
      }
      cloudShellPrimitiveRef.current = null;
      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
      rebuildGridRef.current = null;
      onCameraTelemetryChangeRef.current(null);
    };
  }, []);

  // Switch between Optical, Temperature (over grayscale relief), Radiation (over darkened Viking), and Grayscale Elevation.
  // Keep every imagery layer resident during the short cross-fade so Cesium never pops a texture in or out.
  useEffect(() => {
    if (!isReady) return;
    const opticalLayer = vikingLayerRef.current;
    const ctxLayer = ctxLayerRef.current;
    const reliefShadeLayer = reliefShadeLayerRef.current;
    const temperatureLayer = temperatureLayerRef.current;
    const radiationLayer = radiationLayerRef.current;
    const elevationLayer = elevationLayerRef.current;

    const layers: Array<{ layer: CesiumImageryLayer | null; targetAlpha: number }> = [];
    if (opticalLayer) {
      const isOpticalBase = mapStyle === 'optical' || mapStyle === 'radiation';
      // Non-optical modes get fixed grading; optical altitude blend runs in the render loop
      if (mapStyle === 'optical') {
        applyOpticalColorForAltitude(opticalLayer, DEFAULT_CAMERA_HEIGHT_METERS, true);
      } else {
        opticalLayer.hue = 0.0;
        opticalLayer.contrast = 1.25;
        opticalLayer.brightness = 0.3;
        opticalLayer.saturation = 0.15;
        opticalLayer.gamma = 0.9;
      }
      layers.push({ layer: opticalLayer, targetAlpha: isOpticalBase ? 1.0 : 0.0 });
    }
    if (ctxLayer) {
      const viewer = viewerRef.current;
      const marsEllipsoid = marsEllipsoidRef.current;
      let camHeight = DEFAULT_CAMERA_HEIGHT_METERS;
      if (viewer && !viewer.isDestroyed() && marsEllipsoid) {
        const carto = marsEllipsoid.cartesianToCartographic(viewer.camera.position);
        if (carto) camHeight = carto.height;
      }
      const ctxOpacity = getCtxFadeAlpha(camHeight);
      layers.push({ layer: ctxLayer, targetAlpha: mapStyle === 'optical' ? ctxOpacity : 0.0 });
    }

    if (reliefShadeLayer) {
      // Crisp 200m grayscale terrain relief serves as underlying shading for Temperature & Elevation
      layers.push({
        layer: reliefShadeLayer,
        targetAlpha: mapStyle === 'temperature' || mapStyle === 'elevation' ? 1.0 : 0.0,
      });
    }

    if (temperatureLayer) {
      layers.push({ layer: temperatureLayer, targetAlpha: mapStyle === 'temperature' ? 0.85 : 0.0 });
    }

    if (radiationLayer) {
      layers.push({ layer: radiationLayer, targetAlpha: mapStyle === 'radiation' ? 0.88 : 0.0 });
    }

    if (elevationLayer) {
      layers.push({ layer: elevationLayer, targetAlpha: mapStyle === 'elevation' ? 0.72 : 0.0 });
    }

    if (layerTransitionFrameRef.current !== null) {
      window.cancelAnimationFrame(layerTransitionFrameRef.current);
    }
    const starts = layers.map(({ layer }) => layer?.alpha ?? 0);
    const cloudModeStart = cloudModeBlendRef.current;
    const cloudModeTarget = mapStyle === 'optical' ? 1 : 0;
    const startedAt = performance.now();
    const durationMs = 420;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = progress * progress * (3 - 2 * progress);
      layers.forEach(({ layer, targetAlpha }, index) => {
        if (!layer) return;
        layer.show = true;
        layer.alpha = starts[index] + (targetAlpha - starts[index]) * eased;
      });
      cloudModeBlendRef.current = cloudModeStart + (cloudModeTarget - cloudModeStart) * eased;
      if (progress < 1) {
        layerTransitionFrameRef.current = window.requestAnimationFrame(animate);
      } else {
        layers.forEach(({ layer, targetAlpha }) => {
          if (!layer) return;
          layer.alpha = targetAlpha;
          layer.show = targetAlpha > 0.003;
        });
        cloudModeBlendRef.current = cloudModeTarget;
        layerTransitionFrameRef.current = null;
      }
    };
    layerTransitionFrameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (layerTransitionFrameRef.current !== null) {
        window.cancelAnimationFrame(layerTransitionFrameRef.current);
        layerTransitionFrameRef.current = null;
      }
    };
  }, [mapStyle, isReady]);

  useEffect(() => {
    if (telemetryMode === 'realtime') {
      simBoostMsRef.current = 0;
    }
  }, [telemetryMode]);

  useEffect(() => {
    if (!isReady) return;
    const viewer = viewerRef.current;
    const previousLayer = temperatureLayerRef.current;
    const marsTilingScheme = marsTilingSchemeRef.current;
    if (!viewer || viewer.isDestroyed() || !previousLayer || !marsTilingScheme) return;
    if (loadedTemperatureLsRef.current === temperatureLs) return;

    const Cesium = window.Cesium;
    const provider = createMarsProceduralImageryProvider({
      Cesium,
      tilingScheme: marsTilingScheme,
      mode: 'temperature',
      solarLongitudeLs: temperatureLs,
      maximumLevel: 13,
    });
    const nextLayer = viewer.imageryLayers.addImageryProvider(provider);
    nextLayer.magnificationFilter = Cesium.TextureMagnificationFilter.LINEAR;
    nextLayer.minificationFilter = Cesium.TextureMinificationFilter.LINEAR;
    nextLayer.dayAlpha = 1.0;
    nextLayer.nightAlpha =
      sunShadowEnabledRef.current && mapStyleRef.current === 'optical' ? 0.0 : 1.0;
    nextLayer.show = mapStyleRef.current === 'temperature';
    nextLayer.alpha = 0.85;
    nextLayer.contrast = 1.12;
    nextLayer.brightness = 1;
    (viewer.imageryLayers as any).remove(previousLayer, true);
    temperatureLayerRef.current = nextLayer;
    loadedTemperatureLsRef.current = temperatureLs;
  }, [temperatureLs, isReady]);

  useEffect(() => {
    if (!isReady) return;
    gridEnabledRef.current = gridEnabled;
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    rebuildGridRef.current?.(gridEnabled, viewer.scene.verticalExaggeration);
  }, [gridEnabled, isReady]);

  useEffect(() => {
    if (!isReady) return;
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    try {
      // The camera-relative DirectionalLight is installed once during Viewer setup.
      // Keep its direction stable through per-frame camera updates; do not replace it here.
      const globe = viewer.scene.globe;
      const imageryLayers = viewer.imageryLayers;
      if (!globe || !imageryLayers || typeof imageryLayers.get !== 'function') {
        throw new Error('Cesium globe or imagery layer collection is unavailable.');
      }

      const effectiveShadow = sunShadowEnabled && mapStyle === 'optical';
      globe.enableLighting = effectiveShadow;
      globe.dynamicAtmosphereLighting = effectiveShadow;
      globe.dynamicAtmosphereLightingFromSun = false;
      globe.nightFadeInDistance = 1e7;
      globe.nightFadeOutDistance = 5e7;

      // Apply the shadow toggle to every surface style; style switches must not
      // restore night-side imagery and wash out the terminator.
      for (let index = 0; index < imageryLayers.length; index += 1) {
        const layer = imageryLayers.get(index);
        if (!layer) continue;
        layer.dayAlpha = 1.0;
        layer.nightAlpha = effectiveShadow ? 0.0 : 1.0;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[MarsGlobe] Failed to synchronize Sun lighting:', error);
      setWebglError(`Mars lighting failed to initialize: ${message}`);
    }
  }, [sunShadowEnabled, mapStyle, isReady]);

  useEffect(() => {
    if (!isReady) return;
    for (const target of MARS_TARGETS) {
      if (target.category === 'satellite') continue;
      const pin = pinEntitiesRef.current.get(target.id);
      const label = pin?.label as any;
      if (label) {
        const coords = target.category === 'rover' ? getRoverCoords(target) : target;
        label.text = getTargetPinLabel(
          target,
          weatherEnabled,
          temperatureLs,
          coords.latitude,
          coords.longitude
        );
      }
    }
  }, [weatherEnabled, temperatureLs, liveRovers, isReady]);

  useEffect(() => {
    if (!measureMode && isReady) {
      clearMeasurementInternal();
    }
  }, [measureMode, isReady]);

  // Sync temporary session pins to Cesium entities and keep labels/selection highlights fresh
  useEffect(() => {
    if (!isReady) return;
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    const createSurfacePosition = createSurfacePositionFnRef.current;
    if (!viewer || viewer.isDestroyed() || !Cesium || !createSurfacePosition) return;

    const currentIds = new Set(customPins.map((p) => p.id));
    for (const [id, entry] of customPinEntitiesRef.current.entries()) {
      if (!currentIds.has(id)) {
        viewer.entities.remove(entry.entity);
        customPinEntitiesRef.current.delete(id);
      }
    }

    const customColorHex = '#38BDF8';
    for (const pinTarget of customPins) {
      let entry = customPinEntitiesRef.current.get(pinTarget.id);
      if (!entry) {
        const horizonPos = createSurfacePosition(
          pinTarget.latitude,
          pinTarget.longitude,
          pinTarget.elevationMeters,
          180
        );
        const entity = viewer.entities.add({
          id: pinTarget.id,
          name: pinTarget.name,
          position: horizonPos,
          billboard: {
            image: createGlowPinDataUri(customColorHex, 'landmark', pinTarget.id === selectedTargetId),
            scale: pinTarget.id === selectedTargetId ? 0.62 : 0.54,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            eyeOffset: new Cesium.Cartesian3(0.0, 0.0, -5000.0),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: getTargetPinLabel(
              pinTarget,
              weatherEnabled,
              temperatureLs,
              pinTarget.latitude,
              pinTarget.longitude
            ),
            font: '600 12px "Chakra Petch", sans-serif',
            fillColor: Cesium.Color.fromCssColorString('#BAE6FD'),
            outlineColor: Cesium.Color.fromCssColorString('#05070B'),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -14),
            eyeOffset: new Cesium.Cartesian3(0.0, 0.0, -5000.0),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        entry = { entity, horizonPos };
        customPinEntitiesRef.current.set(pinTarget.id, entry);
      } else {
        const isSelected = pinTarget.id === selectedTargetId;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const billboard = entry.entity.billboard as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const label = entry.entity.label as any;
        if (billboard) {
          billboard.image = createGlowPinDataUri(customColorHex, 'landmark', isSelected);
          billboard.scale = isSelected ? 0.62 : 0.54;
        }
        if (label) {
          label.text = getTargetPinLabel(
            pinTarget,
            weatherEnabled,
            temperatureLs,
            pinTarget.latitude,
            pinTarget.longitude
          );
        }
      }
    }
  }, [customPins, selectedTargetId, weatherEnabled, temperatureLs, isReady]);

  useEffect(() => {
    if (!isReady) return;
    for (const target of MARS_TARGETS) {
      const pin = pinEntitiesRef.current.get(target.id);
      if (pin) {
        const isSelected = target.id === selectedTargetId;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const billboard = pin.billboard as any;
        if (billboard) {
          billboard.image = createGlowPinDataUri(
            CATEGORY_COLORS[target.category],
            target.category,
            isSelected
          );
          billboard.scale = isSelected ? 0.58 : 0.5;
        }
      }
    }
  }, [selectedTargetId, isReady]);

  useEffect(() => {
    if (!isReady) return;
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    if (selectedRegionEntityRef.current) {
      viewer.entities.remove(selectedRegionEntityRef.current);
      selectedRegionEntityRef.current = null;
    }

    const target = MARS_TARGETS.find((item) => item.id === selectedTargetId);
    if (!target || target.category !== 'landmark') return;
    const areaInfo = getLocationAreaInfo(target);
    if (!areaInfo) return;

    const Cesium = window.Cesium;
    const marsEllipsoid = marsEllipsoidRef.current;
    if (!marsEllipsoid) return;
    const positions = Cesium.Cartesian3.fromDegreesArray(
      areaInfo.ringLonLat.flatMap(([lon, lat]) => [lon, lat]),
      marsEllipsoid
    );
    const regionColor = Cesium.Color.fromCssColorString('#22D3EE');

    if (areaInfo.isPolarCap && areaInfo.polarCenterLatDeg !== undefined) {
      const radiusMeters = areaInfo.radiusKm * 1000;
      selectedRegionEntityRef.current = viewer.entities.add({
        id: `__mars-region-${target.id}`,
        name: `${areaInfo.name} — ${areaInfo.dimensionLabel}`,
        position: Cesium.Cartesian3.fromDegrees(0, areaInfo.polarCenterLatDeg, 0, marsEllipsoid),
        ellipse: {
          semiMajorAxis: radiusMeters,
          semiMinorAxis: radiusMeters,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          material: regionColor.withAlpha(0.22),
          outline: false,
        },
        polyline: {
          positions,
          clampToGround: true,
          width: 2.5,
          material: regionColor.withAlpha(0.92),
        },
      });
      return;
    }

    selectedRegionEntityRef.current = viewer.entities.add({
      id: `__mars-region-${target.id}`,
      name: `${areaInfo.name} — ${areaInfo.dimensionLabel}`,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(positions),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        perPositionHeight: false,
        material: regionColor.withAlpha(0.22),
        outline: false,
      },
      polyline: {
        positions,
        clampToGround: true,
        width: 2.5,
        material: regionColor.withAlpha(0.92),
      },
    });
  }, [selectedTargetId, isReady]);

  // Immediately toggle satellite and rover badge/orbit visibility from left-margin controls
  useEffect(() => {
    if (!isReady) return;
    for (const target of MARS_TARGETS) {
      if (target.category === 'satellite') {
        const ring = orbitRingEntitiesRef.current.get(target.id);
        const wake = orbitWakeEntitiesRef.current.get(target.id);
        if (ring) ring.show = showSatellites;
        if (wake) wake.show = showSatellites;
        if (!showSatellites) {
          const pin = pinEntitiesRef.current.get(target.id);
          const craft = spacecraftEntitiesRef.current.get(target.id);
          if (pin) pin.show = false;
          if (craft) craft.show = false;
        }
      } else if (target.category === 'rover' && !showRovers) {
        const pin = pinEntitiesRef.current.get(target.id);
        const rover = roverEntitiesRef.current.get(target.id);
        if (pin) pin.show = false;
        if (rover) rover.show = false;
      }
    }
  }, [showSatellites, showRovers, isReady]);

  return (
    <div className="relative w-full h-full bg-black">
      <div
        id="cesiumContainer"
        ref={containerRef}
        style={{
          touchAction: 'none',
          cursor:
            measureMode || routeMode || dropPinMode || siteAnalysisMode ? 'crosshair' : 'grab',
        }}
        className="w-full h-full"
        aria-label="Interactive 3D Mars Globe"
      />
      <div
        ref={amberHazeOverlayRef}
        aria-hidden="true"
        className="absolute inset-0 z-[5] pointer-events-none"
        style={{
          opacity: 0,
          mixBlendMode: 'screen',
          background:
            'linear-gradient(to bottom, rgba(217, 138, 43, 0) 35%, rgba(224, 145, 48, 0.32) 55%, rgba(195, 110, 32, 0.22) 75%, rgba(0, 0, 0, 0) 100%)',
        }}
      />

      {!isReady && !webglError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-[100]">
          <div className="relative w-full h-full max-w-full max-h-full flex items-center justify-center overflow-hidden">
            <img
              src="data:image/webp;base64,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"
              alt="Mars"
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
            <div className="relative z-10 flex flex-col items-center justify-center gap-4">
              <p className="font-display text-lg sm:text-xl font-semibold tracking-wide text-white drop-shadow-sm">
                ILoveMars
              </p>
              <div className="w-12 h-12 rounded-full border-[3px] border-white/35 border-t-white animate-spin" />
            </div>
          </div>
        </div>
      )}

      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/95 p-6 z-40">
          <div className="max-w-md rounded-2xl border border-rose-500/30 bg-[#0B0F17] p-6 text-center">
            <h2 className="font-display text-base font-semibold text-rose-400">
              3D Globe Unavailable
            </h2>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">{webglError}</p>
          </div>
        </div>
      )}
    </div>
  );
});
