import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  CATEGORY_COLORS,
  MARS_CONSTANTS,
  MARS_TARGETS,
  MarsTarget,
  TelemetryMode,
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
  SitePolygonVertex,
  computePolygonMetricsKm,
  unwrapPolygonRing,
} from '../utils/marsWaterModel';
import { getGlobalMarsCloudCanvas } from '../utils/marsClouds';
import {
  loadMolaMegdrRaster,
  sampleElevationAt,
} from '../utils/molaMegdr';
import { createMarsProceduralImageryProvider } from '../utils/marsTiledProviders';
import { CameraTelemetry, CursorTelemetry } from './CursorTelemetryPill';
import { DroppedPinCandidate } from './DropPinOverlay';
import { MapStyleMode } from './MapStyleBar';
import { LiveMeasurePreview, MeasureResult } from './MeasureToolOverlay';
import { LiveSiteDrawPreview } from './SiteAnalysisOverlay';

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
  onSiteDrawingChange: (isDrawing: boolean) => void;
  onSiteDrawLivePreviewChange: (preview: LiveSiteDrawPreview | null) => void;
  onSitePolygonComplete: (vertices: SitePolygonVertex[]) => void;
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

const MARS_TERRAIN_VERTICAL_EXAGGERATION = 1.0;

// Astronomical starfield: CesiumJS's built-in Tycho-2 star catalog cubemap (derived from the
// Hipparcos / Tycho-2 catalogues, NASA/Goddard SVS). Faces are resolved against the same Cesium
// CDN release that index.html loads so the skybox never requests a missing local asset.
const CESIUM_CDN_RELEASE_BASE =
  'https://cesium.com/downloads/cesiumjs/releases/1.124/Build/Cesium/';
const TYCHO_STARFIELD_SKYBOX_BASE = `${CESIUM_CDN_RELEASE_BASE}Assets/Textures/SkyBox/tycho2t3_80_`;

const MIN_CAMERA_HEIGHT_METERS = 10;
// Closer global framing to match the default Mars overview shown in the app reference.
const DEFAULT_CAMERA_HEIGHT_METERS = 20_000_000;
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

const CTX_MAX_ALPHA = 0.34;
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

const ROCK_DETAIL_MAX_ALPHA = 0.86;
const ROCK_DETAIL_FADE_START_METERS = 26_000;
const ROCK_DETAIL_FULL_ALPHA_METERS = 2_200;

function getRockDetailFadeAlpha(clearanceMeters: number): number {
  const progress = Math.max(
    0,
    Math.min(
      1,
      (ROCK_DETAIL_FADE_START_METERS - clearanceMeters) /
        (ROCK_DETAIL_FADE_START_METERS - ROCK_DETAIL_FULL_ALPHA_METERS)
    )
  );
  const smooth = progress * progress * (3 - 2 * progress);
  return ROCK_DETAIL_MAX_ALPHA * smooth;
}

// Clouds: full at high altitude, progressive fade as the camera zooms in.
const CLOUDS_MAX_ALPHA = 0.48;
const CLOUDS_FADE_START_METERS = 3_500_000; // begin fading below ~3500 km
const CLOUDS_FADE_END_METERS = 250_000; // fully gone near surface
const CLOUD_SHELL_ALTITUDE_METERS = 58_000;
const ATMOSPHERE_SHELL_ALTITUDE_METERS = 310_000;
const ATMOSPHERE_FULL_VISIBLE_METERS = 100_000;
const ATMOSPHERE_FADE_OUT_METERS = 200_000;

function getCloudFadeAlpha(cameraHeightMeters: number): number {
  if (cameraHeightMeters >= CLOUDS_FADE_START_METERS) return CLOUDS_MAX_ALPHA;
  if (cameraHeightMeters <= CLOUDS_FADE_END_METERS) return 0;
  const progress =
    (cameraHeightMeters - CLOUDS_FADE_END_METERS) /
    (CLOUDS_FADE_START_METERS - CLOUDS_FADE_END_METERS);
  const smooth = progress * progress * (3 - 2 * progress);
  return CLOUDS_MAX_ALPHA * smooth;
}

// Optical color: above 500 km = sandy / butterscotch orbital view;
// descending from 500 km to surface progressively deepens reddish iron-oxide surface tint.
const COLOR_BLEND_FAR_METERS = 12_000_000;
const COLOR_BLEND_NEAR_METERS = 400_000;
const SURFACE_RED_TINT_START_METERS = 500_000;
const SURFACE_RED_TINT_FULL_METERS = 1_500;
const SURFACE_RED_TINT_MAX_ALPHA = 0.10;

const OPTICAL_COLOR_FAR = {
  hue: 0.0,
  contrast: 1.04,
  brightness: 1.0,
  saturation: 1.02,
  gamma: 0.98,
};
const OPTICAL_COLOR_NEAR = {
  hue: -0.02,
  contrast: 1.16,
  brightness: 1.0,
  saturation: 1.18,
  gamma: 0.86,
};
const CTX_COLOR_FAR = {
  hue: -0.04,
  contrast: 1.2,
  brightness: 0.96,
  saturation: 1.35,
  gamma: 0.85,
};
const CTX_COLOR_NEAR = {
  hue: -0.04,
  contrast: 1.28,
  brightness: 0.98,
  saturation: 1.2,
  gamma: 0.92,
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

function getSurfaceRedTintProgress(clearanceMeters: number): number {
  if (clearanceMeters >= SURFACE_RED_TINT_START_METERS) return 0;
  if (clearanceMeters <= SURFACE_RED_TINT_FULL_METERS) return 1;
  const progress =
    (SURFACE_RED_TINT_START_METERS - clearanceMeters) /
    (SURFACE_RED_TINT_START_METERS - SURFACE_RED_TINT_FULL_METERS);
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
  // Smoothly intensify reddish iron-oxide warmth as the camera descends below 500 km.
  layer.hue = lerp(OPTICAL_COLOR_FAR.hue, OPTICAL_COLOR_NEAR.hue, t);
  layer.saturation = lerp(OPTICAL_COLOR_FAR.saturation, OPTICAL_COLOR_NEAR.saturation, t);
  layer.contrast = lerp(OPTICAL_COLOR_FAR.contrast, OPTICAL_COLOR_NEAR.contrast, t);
  layer.brightness = 1.0;
  layer.gamma = lerp(OPTICAL_COLOR_FAR.gamma, OPTICAL_COLOR_NEAR.gamma, t);
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

interface TriangulatedLatLonMesh {
  vertices: Array<{ latDeg: number; lonDeg: number }>;
  triangles: Array<[number, number, number]>;
}

function triangulateFreehandMarsPolygon(rawVertices: SitePolygonVertex[]): TriangulatedLatLonMesh | null {
  const unwrapped = unwrapPolygonRing(rawVertices);
  if (unwrapped.length < 3) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const v of unwrapped) {
    if (v.latDeg < minLat) minLat = v.latDeg;
    if (v.latDeg > maxLat) maxLat = v.latDeg;
    if (v.lonDeg < minLon) minLon = v.lonDeg;
    if (v.lonDeg > maxLon) maxLon = v.lonDeg;
  }
  const diag = Math.hypot(maxLon - minLon, maxLat - minLat);
  if (diag < 1e-6) return null;

  // Deduplicate close vertices so ear-clipping remains numerically robust
  const minVertSep = diag * 0.008;
  const cleaned: Array<{ latDeg: number; lonDeg: number }> = [];
  for (const v of unwrapped) {
    const prev = cleaned[cleaned.length - 1];
    if (!prev || Math.hypot(v.lonDeg - prev.lonDeg, v.latDeg - prev.latDeg) >= minVertSep) {
      cleaned.push({ latDeg: v.latDeg, lonDeg: v.lonDeg });
    }
  }
  if (
    cleaned.length > 3 &&
    Math.hypot(
      cleaned[0].lonDeg - cleaned[cleaned.length - 1].lonDeg,
      cleaned[0].latDeg - cleaned[cleaned.length - 1].latDeg
    ) < minVertSep
  ) {
    cleaned.pop();
  }
  if (cleaned.length < 3) return null;

  // Ensure counter-clockwise orientation
  let signedArea2 = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const a = cleaned[i];
    const b = cleaned[(i + 1) % cleaned.length];
    signedArea2 += a.lonDeg * b.latDeg - b.lonDeg * a.latDeg;
  }
  if (Math.abs(signedArea2) < 1e-12) return null;
  if (signedArea2 < 0) cleaned.reverse();

  const cross2 = (
    a: { lonDeg: number; latDeg: number },
    b: { lonDeg: number; latDeg: number },
    c: { lonDeg: number; latDeg: number }
  ) => (b.lonDeg - a.lonDeg) * (c.latDeg - a.latDeg) - (b.latDeg - a.latDeg) * (c.lonDeg - a.lonDeg);

  const pointInTri = (
    p: { lonDeg: number; latDeg: number },
    a: { lonDeg: number; latDeg: number },
    b: { lonDeg: number; latDeg: number },
    c: { lonDeg: number; latDeg: number }
  ) => {
    const c1 = cross2(a, b, p);
    const c2 = cross2(b, c, p);
    const c3 = cross2(c, a, p);
    return c1 >= -1e-11 && c2 >= -1e-11 && c3 >= -1e-11;
  };

  const remaining = cleaned.map((_, idx) => idx);
  const baseTriangles: Array<[number, number, number]> = [];
  let guard = 0;
  const maxIterations = cleaned.length * cleaned.length + 16;

  while (remaining.length > 3 && guard < maxIterations) {
    guard++;
    let earClipped = false;
    for (let i = 0; i < remaining.length; i++) {
      const iPrev = remaining[(i - 1 + remaining.length) % remaining.length];
      const iCurr = remaining[i];
      const iNext = remaining[(i + 1) % remaining.length];
      const a = cleaned[iPrev];
      const b = cleaned[iCurr];
      const c = cleaned[iNext];
      if (cross2(a, b, c) <= 1e-12) continue;

      let containsOther = false;
      for (let k = 0; k < remaining.length; k++) {
        const idxTest = remaining[k];
        if (idxTest === iPrev || idxTest === iCurr || idxTest === iNext) continue;
        if (pointInTri(cleaned[idxTest], a, b, c)) {
          containsOther = true;
          break;
        }
      }
      if (containsOther) continue;

      baseTriangles.push([iPrev, iCurr, iNext]);
      remaining.splice(i, 1);
      earClipped = true;
      break;
    }
    if (!earClipped) break;
  }

  if (remaining.length === 3) {
    baseTriangles.push([remaining[0], remaining[1], remaining[2]]);
  } else if (remaining.length > 3) {
    // Graceful centroid fan fallback for self-intersecting user scribbles
    let cLat = 0;
    let cLon = 0;
    for (const idx of remaining) {
      cLat += cleaned[idx].latDeg;
      cLon += cleaned[idx].lonDeg;
    }
    const centerIdx = cleaned.length;
    cleaned.push({ latDeg: cLat / remaining.length, lonDeg: cLon / remaining.length });
    for (let i = 0; i < remaining.length; i++) {
      baseTriangles.push([centerIdx, remaining[i], remaining[(i + 1) % remaining.length]]);
    }
  }

  if (baseTriangles.length === 0) return null;

  // Subdivide triangles on Mars surface so large/concave shapes hug terrain & globe curvature cleanly
  const outVertices = cleaned.slice();
  const midpointCache = new Map<string, number>();
  const getMidpoint = (i0: number, i1: number): number => {
    const key = i0 < i1 ? `${i0}:${i1}` : `${i1}:${i0}`;
    const existing = midpointCache.get(key);
    if (existing !== undefined) return existing;
    const v0 = outVertices[i0];
    const v1 = outVertices[i1];
    const nextIdx = outVertices.length;
    outVertices.push({
      latDeg: (v0.latDeg + v1.latDeg) * 0.5,
      lonDeg: (v0.lonDeg + v1.lonDeg) * 0.5,
    });
    midpointCache.set(key, nextIdx);
    return nextIdx;
  };

  let tris = baseTriangles;
  const maxEdgeLen = Math.max(diag * 0.11, 1e-4);
  for (let pass = 0; pass < 3 && tris.length < 900; pass++) {
    const nextTris: Array<[number, number, number]> = [];
    let didSplit = false;
    for (const [i0, i1, i2] of tris) {
      const v0 = outVertices[i0];
      const v1 = outVertices[i1];
      const v2 = outVertices[i2];
      const d01 = Math.hypot(v1.lonDeg - v0.lonDeg, v1.latDeg - v0.latDeg);
      const d12 = Math.hypot(v2.lonDeg - v1.lonDeg, v2.latDeg - v1.latDeg);
      const d20 = Math.hypot(v0.lonDeg - v2.lonDeg, v0.latDeg - v2.latDeg);
      if (Math.max(d01, d12, d20) > maxEdgeLen && nextTris.length + tris.length < 1150) {
        const m01 = getMidpoint(i0, i1);
        const m12 = getMidpoint(i1, i2);
        const m20 = getMidpoint(i2, i0);
        nextTris.push([i0, m01, m20], [m01, i1, m12], [m20, m12, i2], [m01, m12, m20]);
        didSplit = true;
      } else {
        nextTris.push([i0, i1, i2]);
      }
    }
    tris = nextTris;
    if (!didSplit) break;
  }

  return { vertices: outVertices, triangles: tris };
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
    onSiteDrawingChange,
    onSiteDrawLivePreviewChange,
    onSitePolygonComplete,
    onGlobeReady,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marsEllipsoidRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marsTilingSchemeRef = useRef<any>(null);

  const vikingLayerRef = useRef<CesiumImageryLayer | null>(null);
  const ctxLayerRef = useRef<CesiumImageryLayer | null>(null);
  const redTintLayerRef = useRef<CesiumImageryLayer | null>(null);
  const rockDetailLayerRef = useRef<CesiumImageryLayer | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cloudShellPrimitiveRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const horizonAtmospherePrimitiveRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const horizonSoftenerStageRef = useRef<any>(null);
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
  const selectedRegionSamplesRef = useRef<unknown[]>([]);
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
    directSamples: Array<{ latDeg: number; lonDeg: number; elevationMeters: number }>;
    optimalSamples: Array<{ latDeg: number; lonDeg: number; elevationMeters: number }>;
    pulseRings: Array<{
      entity: CesiumEntity;
      samples: Array<{ latDeg: number; lonDeg: number; elevationMeters: number }>;
    }>;
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
    directSamples: [],
    optimalSamples: [],
    pulseRings: [],
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

  // Pencil Freehand Site Habitability Selection refs
  const sitePolyStateRef = useRef<{
    isDrawing: boolean;
    vertices: Array<{ latDeg: number; lonDeg: number; elevMeters: number }>;
    lastScreenPos: { x: number; y: number } | null;
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
    fillDepthFailPrimitive: unknown | null;
    fillSampleCartesians: unknown[];
    startDotEntity: CesiumEntity | null;
    outlineEntity: CesiumEntity | null;
  }>({
    isDrawing: false,
    vertices: [],
    lastScreenPos: null,
    ringSamples: [],
    ringSpanMeters: 0,
    builtDetailLevel: null,
    fillPrimitive: null,
    fillDepthFailPrimitive: null,
    fillSampleCartesians: [],
    startDotEntity: null,
    outlineEntity: null,
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
  const onSiteDrawingChangeRef = useRef(onSiteDrawingChange);
  const onSiteDrawLivePreviewChangeRef = useRef(onSiteDrawLivePreviewChange);
  const onSitePolygonCompleteRef = useRef(onSitePolygonComplete);

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
  onSiteDrawingChangeRef.current = onSiteDrawingChange;
  onSiteDrawLivePreviewChangeRef.current = onSiteDrawLivePreviewChange;
  onSitePolygonCompleteRef.current = onSitePolygonComplete;

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
      elevationMeters: sampleElevationAt(target.longitude, target.latitude),
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

    const clampedAlt = Math.max(MIN_CAMERA_HEIGHT_METERS, alt);
    const lookAheadMeters = clampedAlt / Math.tan(Cesium.Math.toRadians(65));
    const metersPerDegLat = (Math.PI * MARS_CONSTANTS.EQUATORIAL_RADIUS) / 180;
    const latOffset = lookAheadMeters / metersPerDegLat;
    const cameraLat = Math.max(-88.5, lat - latOffset);
    const terrainHeight =
      sampleElevationAt(lon, cameraLat) * viewer.scene.verticalExaggeration;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        lon,
        cameraLat,
        terrainHeight + clampedAlt,
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
      ? Math.max(350, Math.min(2_200_000, Math.round(areaInfo.radiusKm * 1800)))
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
      sampleElevationAt(longitude, latitude) * viewer.scene.verticalExaggeration;
    const target = Cesium.Cartesian3.fromDegrees(
      longitude,
      latitude,
      terrainHeight,
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
        const Cesium = window.Cesium;
        let terrainElev = 0;
        let raySlantDist: number | null = null;
        if (carto && Cesium) {
          terrainElev =
            sampleElevationAt(
              Cesium.Math.toDegrees(carto.longitude),
              Cesium.Math.toDegrees(carto.latitude)
            ) * viewer.scene.verticalExaggeration;
          if (direction > 0 && carto.height < 45_000) {
            const c = viewer.scene.canvas;
            const ray = viewer.camera.getPickRay(
              new Cesium.Cartesian2(c.clientWidth * 0.5, c.clientHeight * 0.5)
            );
            const hit = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined;
            if (hit) {
              raySlantDist = Cesium.Cartesian3.distance(viewer.camera.positionWC, hit);
            }
          }
        }
        const rawHeight = carto ? carto.height : 10000;
        const clearanceM = Math.max(MIN_CAMERA_HEIGHT_METERS, rawHeight - terrainElev);
        const speedFactorPerSec = 0.85 * CAMERA_INPUT_SENSITIVITY_MULTIPLIER * ZOOM_SPEED_MULTIPLIER;
        const rawDelta = Math.max(
          0.9 * ZOOM_SPEED_MULTIPLIER,
          clearanceM * speedFactorPerSec * dtSec
        );

        if (direction > 0) {
          const verticalMargin = Math.max(0, clearanceM - MIN_CAMERA_HEIGHT_METERS);
          const forwardMargin =
            raySlantDist !== null
              ? Math.min(verticalMargin, Math.max(0, raySlantDist - MIN_CAMERA_HEIGHT_METERS))
              : verticalMargin;
          const moveStep = Math.min(forwardMargin, rawDelta);
          if (moveStep > 0) viewer.camera.moveForward(moveStep);
        } else {
          const moveStep = Math.min(
            Math.max(0, MAX_CAMERA_HEIGHT_METERS - Math.max(0, rawHeight)),
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
    const Cesium = window.Cesium;
    if (!viewer || viewer.isDestroyed() || !marsEllipsoid || !Cesium || deltaY === 0) return;

    cancelCameraOrientationAnimation();
    viewer.trackedEntity = undefined;
    viewer.camera.cancelFlight();

    const carto = marsEllipsoid.cartesianToCartographic(viewer.camera.positionWC);
    const terrainElev = carto
      ? sampleElevationAt(
          Cesium.Math.toDegrees(carto.longitude),
          Cesium.Math.toDegrees(carto.latitude)
        ) * viewer.scene.verticalExaggeration
      : 0;
    const rawHeight = carto ? carto.height : 10000;
    const clearanceM = Math.max(MIN_CAMERA_HEIGHT_METERS, rawHeight - terrainElev);
    let raySlantDist: number | null = null;
    if (deltaY < 0 && rawHeight < 45_000) {
      const c = viewer.scene.canvas;
      const ray = viewer.camera.getPickRay(
        new Cesium.Cartesian2(c.clientWidth * 0.5, c.clientHeight * 0.5)
      );
      const hit = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined;
      if (hit) {
        raySlantDist = Cesium.Cartesian3.distance(viewer.camera.positionWC, hit);
      }
    }
    const step = Math.max(
      0.75 * ZOOM_SPEED_MULTIPLIER,
      clearanceM * 0.06 * CAMERA_INPUT_SENSITIVITY_MULTIPLIER * ZOOM_SPEED_MULTIPLIER
    );
    if (deltaY < 0) {
      const verticalMargin = Math.max(0, clearanceM - MIN_CAMERA_HEIGHT_METERS);
      const forwardMargin =
        raySlantDist !== null
          ? Math.min(verticalMargin, Math.max(0, raySlantDist - MIN_CAMERA_HEIGHT_METERS))
          : verticalMargin;
      const moveStep = Math.min(forwardMargin, step);
      if (moveStep > 0) viewer.camera.moveForward(moveStep);
    } else {
      const moveStep = Math.min(
        Math.max(0, MAX_CAMERA_HEIGHT_METERS - Math.max(0, rawHeight)),
        step
      );
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
    rs.directSamples = [];
    rs.optimalSamples = [];
    rs.pulseRings = [];
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
    const sr = sitePolyStateRef.current;
    sr.isDrawing = false;
    sr.vertices = [];
    sr.lastScreenPos = null;
    sr.ringSamples = [];
    sr.ringSpanMeters = 0;
    sr.builtDetailLevel = null;
    sr.fillSampleCartesians = [];
    if (sr.fillPrimitive && viewer && !viewer.isDestroyed()) {
      viewer.scene.primitives.remove(sr.fillPrimitive);
    }
    if (sr.fillDepthFailPrimitive && viewer && !viewer.isDestroyed()) {
      viewer.scene.primitives.remove(sr.fillDepthFailPrimitive);
    }
    sr.fillPrimitive = null;
    sr.fillDepthFailPrimitive = null;
    if (sr.startDotEntity) sr.startDotEntity.show = false;
    if (sr.outlineEntity) sr.outlineEntity.show = false;
    onSiteDrawingChangeRef.current(false);
    onSiteDrawLivePreviewChangeRef.current(null);
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

    let molaRasterSettled = false;
    let molaRasterFailed = false;
    const molaRasterPromise = loadMolaMegdrRaster()
      .then((raster) => {
        molaRasterSettled = true;
        return raster;
      })
      .catch((error: unknown) => {
        molaRasterSettled = true;
        molaRasterFailed = true;
        setWebglError(
          error instanceof Error
            ? `NASA MOLA elevation data failed to load: ${error.message}`
            : 'NASA MOLA elevation data failed to load.'
        );
      });

    const MOLA_TILE_SIZE = 65;
    const MOLA_MAX_LEVEL = 12;
    const MOLA_SKIRT_HEIGHT_METERS = 900;
    const molaErrorEvent = new Cesium.Event();
    const molaCredit = new Cesium.Credit('NASA PDS · Mars Global Surveyor MOLA MEGDR');
    let pendingTerrainTiles = 0;
    let settledTerrainTiles = 0;

    const marsTerrainProvider = {
      tilingScheme: marsTilingScheme,
      ready: true,
      readyPromise: Promise.resolve(true),
      errorEvent: molaErrorEvent,
      credit: molaCredit,
      hasWaterMask: false,
      hasVertexNormals: false,
      availability: undefined,
      skirtHeight: MOLA_SKIRT_HEIGHT_METERS,
      getTileDataAvailable(_x: number, _y: number, level: number) {
        return level <= MOLA_MAX_LEVEL;
      },
      loadTileDataAvailability() {
        return undefined;
      },
      getLevelMaximumGeometricError(level: number) {
        return Cesium.TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
          marsEllipsoid,
          MOLA_TILE_SIZE,
          marsTilingScheme.getNumberOfXTilesAtLevel(level)
        );
      },
      requestTileGeometry(x: number, y: number, level: number) {
        if (level > MOLA_MAX_LEVEL || molaRasterFailed) return undefined;
        pendingTerrainTiles += 1;
        return (async () => {
          try {
            await molaRasterPromise;
            if (molaRasterFailed) return undefined;
            const rectangle = marsTilingScheme.tileXYToRectangle(x, y, level);
            const heights = new Float32Array(MOLA_TILE_SIZE * MOLA_TILE_SIZE);
            for (let row = 0; row < MOLA_TILE_SIZE; row += 1) {
              const latitude = Cesium.Math.toDegrees(
                rectangle.north -
                  (row / (MOLA_TILE_SIZE - 1)) * (rectangle.north - rectangle.south)
              );
              const rowOffset = row * MOLA_TILE_SIZE;
              for (let col = 0; col < MOLA_TILE_SIZE; col += 1) {
                const longitude = Cesium.Math.toDegrees(
                  rectangle.west +
                    (col / (MOLA_TILE_SIZE - 1)) * (rectangle.east - rectangle.west)
                );
                heights[rowOffset + col] = sampleElevationAt(longitude, latitude);
              }
            }

            const terrainData = new Cesium.HeightmapTerrainData({
              buffer: heights,
              width: MOLA_TILE_SIZE,
              height: MOLA_TILE_SIZE,
              childTileMask: level < MOLA_MAX_LEVEL ? 15 : 0,
              structure: {
                elementMultiplier: 1,
                lowestEncodedHeight: -10_000,
                highestEncodedHeight: 25_000,
              },
            });
            const createMesh = terrainData.createMesh.bind(terrainData);
            terrainData.createMesh = (options: Record<string, unknown>) =>
              createMesh({ ...options, skirtHeight: MOLA_SKIRT_HEIGHT_METERS });
            return terrainData;
          } finally {
            pendingTerrainTiles = Math.max(0, pendingTerrainTiles - 1);
            settledTerrainTiles += 1;
          }
        })();
      },
    };

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
    const marsSun = new Cesium.Sun();
    marsSun.show = true;
    viewer.scene.sun = marsSun;
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
    controller.minimumZoomDistance = MIN_CAMERA_HEIGHT_METERS;
    controller.maximumZoomDistance = MAX_CAMERA_HEIGHT_METERS;
    controller.enableZoom = true;
    controller.enableRotate = !siteAnalysisModeRef.current;
    controller.enableTilt = true;
    controller.enableTranslate = !siteAnalysisModeRef.current;
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

    // Equal R/G scattering coefficients avoid red-over-green optical extinction inversion,
    // while hueShift (-0.088) and saturationShift (0.24) produce a deep warm amber-orange Martian sky at 2x scale.
    const marsRayleighCoeff = new Cesium.Cartesian3(0.85e-5, 0.85e-5, 0.0);
    const marsMieCoeff = new Cesium.Cartesian3(1.55e-5, 1.55e-5, 0.0);

    viewer.scene.backgroundColor = new Cesium.Color(0.0, 0.0, 0.0, 1.0);
    viewer.scene.highDynamicRange = false;
    const marsSkyAtmosphere = new Cesium.SkyAtmosphere(marsEllipsoid);
    marsSkyAtmosphere.show = false;
    marsSkyAtmosphere.hueShift = -0.045;
    marsSkyAtmosphere.saturationShift = 0.08;
    marsSkyAtmosphere.brightnessShift = 0.14;
    marsSkyAtmosphere.atmosphereRayleighScaleHeight = 22_200;
    marsSkyAtmosphere.atmosphereMieScaleHeight = 11_600;
    marsSkyAtmosphere.atmosphereRayleighCoefficient = marsRayleighCoeff;
    marsSkyAtmosphere.atmosphereMieCoefficient = marsMieCoeff;
    marsSkyAtmosphere.atmosphereMieAnisotropy = 0.72;
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
      viewer.scene.fog.minimumBrightness = 0.34;
      viewer.scene.fog.screenSpaceErrorFactor = 2.0;
    }
    // Keep globe lighting active at every supported camera altitude; do not fade the night-side shadow with zoom.
    viewer.scene.globe.lightingFadeOutDistance = 1_000_000_000;
    viewer.scene.globe.lightingFadeInDistance = 1_000_000_000;
    viewer.scene.globe.atmosphereLightIntensity = 0.0;
    viewer.scene.globe.atmosphereHueShift = -0.045;
    viewer.scene.globe.atmosphereSaturationShift = 0.08;
    viewer.scene.globe.atmosphereBrightnessShift = 0.14;
    viewer.scene.globe.atmosphereRayleighScaleHeight = 22_200;
    viewer.scene.globe.atmosphereMieScaleHeight = 11_600;
    viewer.scene.globe.atmosphereRayleighCoefficient = marsRayleighCoeff;
    viewer.scene.globe.atmosphereMieCoefficient = marsMieCoeff;
    viewer.scene.globe.atmosphereMieAnisotropy = 0.72;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    (viewer.scene.globe as any).lambertDiffuseMultiplier = 0.85;
    (viewer.scene.globe as any).showWaterEffect = false;

    viewer.scene.moon = undefined;

    // Keep the Tycho-2 starfield, but rotate the background 180 degrees around
    // its north/south axis without rotating Mars or changing the camera.
    const starfieldFaceUrls = {
      positiveX: `${TYCHO_STARFIELD_SKYBOX_BASE}px.jpg`,
      negativeX: `${TYCHO_STARFIELD_SKYBOX_BASE}mx.jpg`,
      positiveY: `${TYCHO_STARFIELD_SKYBOX_BASE}py.jpg`,
      negativeY: `${TYCHO_STARFIELD_SKYBOX_BASE}my.jpg`,
      positiveZ: `${TYCHO_STARFIELD_SKYBOX_BASE}pz.jpg`,
      negativeZ: `${TYCHO_STARFIELD_SKYBOX_BASE}mz.jpg`,
    };
    const starfieldSkyBox = new Cesium.SkyBox({ sources: starfieldFaceUrls });
    starfieldSkyBox.show = true;
    viewer.scene.skyBox = starfieldSkyBox;

    // A 180-degree rotation around the celestial Z axis swaps opposite X/Y
    // faces; each cube face is also turned 180 degrees to preserve edge alignment.
    const loadRotatedStarfieldFace = (url: string): Promise<HTMLCanvasElement> =>
      new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d');
          if (!context) {
            reject(new Error('Could not prepare a rotated starfield face.'));
            return;
          }
          context.translate(canvas.width, canvas.height);
          context.rotate(Math.PI);
          context.drawImage(image, 0, 0);
          resolve(canvas);
        };
        image.onerror = () => reject(new Error(`Could not load starfield face: ${url}`));
        image.src = url;
      });

    let starfieldSettled = false;
    void Promise.all([
      loadRotatedStarfieldFace(starfieldFaceUrls.negativeX),
      loadRotatedStarfieldFace(starfieldFaceUrls.positiveX),
      loadRotatedStarfieldFace(starfieldFaceUrls.negativeY),
      loadRotatedStarfieldFace(starfieldFaceUrls.positiveY),
      loadRotatedStarfieldFace(starfieldFaceUrls.positiveZ),
      loadRotatedStarfieldFace(starfieldFaceUrls.negativeZ),
    ])
      .then(([positiveX, negativeX, positiveY, negativeY, positiveZ, negativeZ]) => {
        if (viewer.isDestroyed()) return;
        const rotatedStarfieldSkyBox = new Cesium.SkyBox({
          sources: {
            positiveX,
            negativeX,
            positiveY,
            negativeY,
            positiveZ,
            negativeZ,
          } as any,
        });
        rotatedStarfieldSkyBox.show = viewer.scene.skyBox?.show ?? true;
        viewer.scene.skyBox = rotatedStarfieldSkyBox;
      })
      .catch((error) => {
        // Retain the original starfield if the rotated cube faces cannot be prepared.
        console.warn('[MarsGlobe] Could not rotate starfield background:', error);
      })
      .finally(() => {
        starfieldSettled = true;
      });

    const removeRenderError = viewer.scene.renderError?.addEventListener(
      (_scene: unknown, error: unknown) => {
        const message = error instanceof Error ? error.message : String(error ?? 'Unknown WebGL render error');
        console.error('[MarsGlobe] Cesium render error:', message);
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
    let pendingOpticalImages = 0;
    let completedOpticalImages = 0;
    let settledOpticalImages = 0;
    const vikingProviderWithRequest = vikingProvider as {
      requestImage?: (
        col: number,
        row: number,
        level: number,
        request?: unknown
      ) => Promise<unknown> | undefined;
    };
    const rawVikingRequestImage = vikingProviderWithRequest.requestImage?.bind(vikingProvider);
    if (rawVikingRequestImage) {
      vikingProviderWithRequest.requestImage = (
        col: number,
        row: number,
        level: number,
        request?: unknown
      ) => {
        const promise = rawVikingRequestImage(col, row, level, request);
        if (promise && typeof promise.then === 'function') {
          pendingOpticalImages += 1;
          return promise.then(
            (img: unknown) => {
              pendingOpticalImages = Math.max(0, pendingOpticalImages - 1);
              settledOpticalImages += 1;
              if (img) completedOpticalImages += 1;
              return img;
            },
            (err: unknown) => {
              pendingOpticalImages = Math.max(0, pendingOpticalImages - 1);
              settledOpticalImages += 1;
              throw err;
            }
          );
        }
        return promise;
      };
    }
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

    // 2. Caltech Murray Lab Global CTX Mosaic V01 (5m/px at level 12, aligned with MDEM200M)
    const ctxProvider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX1/MapServer/tile/{z}/{y}/{x}',
      tilingScheme: marsTilingScheme,
      tileWidth: 512,
      tileHeight: 512,
      minimumLevel: 4,
      maximumLevel: 12,
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

    // 2a-tint. Progressive ferric-oxide red surface glaze below 500 km (tints grayscale CTX1 too)
    const redTintCanvas = document.createElement('canvas');
    redTintCanvas.width = 8;
    redTintCanvas.height = 8;
    const redTintCtx = redTintCanvas.getContext('2d');
    if (redTintCtx) {
      redTintCtx.fillStyle = '#b83416';
      redTintCtx.fillRect(0, 0, 8, 8);
    }
    const redTintProvider = new Cesium.SingleTileImageryProvider({
      url: redTintCanvas.toDataURL('image/png'),
      tileWidth: 8,
      tileHeight: 8,
      ellipsoid: marsEllipsoid,
    });
    const redTintLayer = viewer.imageryLayers.addImageryProvider(redTintProvider);
    redTintLayer.show = false;
    redTintLayer.alpha = 0.0;
    redTintLayerRef.current = redTintLayer;

    // 2a. Site-Geology Micro-Rock & Regolith Imagery (rendered levels 11..18 below 26 km;
    //     minimumLevel stays 0 so Cesium never enumerates millions of skeletons for ancestor tiles)
    const rockDetailProvider = createMarsProceduralImageryProvider({
      Cesium,
      tilingScheme: marsTilingScheme,
      mode: 'rock-detail',
      minimumLevel: 0,
      minRenderLevel: 11,
      maximumLevel: 18,
    });
    const rockDetailLayer = viewer.imageryLayers.addImageryProvider(rockDetailProvider);
    configureLayerFiltering(rockDetailLayer);
    rockDetailLayer.show = false;
    rockDetailLayer.alpha = 0.0;
    rockDetailLayerRef.current = rockDetailLayer;

    // 2b. 3D Horizon-Emerging Martian Sky Dome Shell:
    //     mimics the attached Mars horizon photo (warm creamy sandy-peach horizon emerging
    //     with increasing intensity below 100 km, rising to dusky rose / muted amber overhead).
    const horizonAtmosphereMaterial = new Cesium.Material({
      fabric: {
        type: 'MarsHorizonAtmosphereShell',
        uniforms: {
          u_localUpEC: new Cesium.Cartesian3(0.0, 0.0, 1.0),
          u_horizonCos: 0.0,
          u_camAltitudeKm: 20000.0,
          u_opacity: 0.0,
          u_shadowEnabled: initialShadowEnabled ? 1.0 : 0.0,
          u_opticalBoost: 1.0,
          u_localDayScale: 1.0,
        },
        source: `
          uniform vec3 u_localUpEC;
          uniform float u_horizonCos;
          uniform float u_camAltitudeKm;
          uniform float u_opacity;
          uniform float u_shadowEnabled;
          uniform float u_opticalBoost;
          uniform float u_localDayScale;

          czm_material czm_getMaterial(czm_materialInput materialInput)
          {
            czm_material material = czm_getDefaultMaterial(materialInput);
            vec3 rayDirEC = normalize(-materialInput.positionToEyeEC);
            vec3 upEC = normalize(u_localUpEC);

            float cosZenith = clamp(dot(rayDirEC, upEC), -1.0, 1.0);
            float rayAngle = asin(cosZenith);
            float horizonAngle = asin(clamp(u_horizonCos, -1.0, 1.0));
            float elevAboveHorizon = rayAngle - horizonAngle;

            // Below 100 km replace space/stars completely with the dusky rose & muted amber sky;
            // smoothly fade into orbital space between 100 km and 138 km.
            float nearSurfaceSkyT = 1.0 - smoothstep(100.0, 138.0, u_camAltitudeKm);
            // Increases continuously in intensity as the camera moves closer to the surface below 100 km
            float altFrac = 1.0 - clamp(u_camAltitudeKm / 100.0, 0.0, 1.0);
            float below100Intensity = altFrac <= 0.0 ? 0.0 : pow(max(altFrac, 1e-4), 0.70);

            // Suspended dust layer thickens & emerges more strongly from horizon when descending below 100 km
            float orbitalScale = mix(0.18, 0.095, clamp(u_camAltitudeKm / 180.0, 0.0, 1.0));
            float scaleAngle = mix(orbitalScale, 0.36, below100Intensity);
            float belowFade = mix(smoothstep(-0.28, 0.0, elevAboveHorizon), 1.0, nearSurfaceSkyT);
            float opticalDepth = exp(-max(elevAboveHorizon, 0.0) / scaleAngle) * belowFade;

            // Directional Mie forward scattering & day-night illumination:
            // - In orbit (> 100 km), shade along the limb radial relative to the camera sun vector.
            // - Below 100 km, illuminate the local sky dome using the surface solar elevation (u_localDayScale)
            //   so Optical mode shows the full luminous horizon atmosphere in every look direction.
            vec3 sunDirEC = normalize(vec3(0.66, 0.42, 0.623));
            float sunAlign = clamp(dot(rayDirEC, sunDirEC), 0.0, 1.0);
            float mieForward = pow(max(sunAlign, 1e-4), 3.0) * 0.14;
            vec3 orbitalLimbDirEC = normalize(vec3(rayDirEC.x, rayDirEC.y, 0.18));
            float orbitalNdotL = dot(orbitalLimbDirEC, sunDirEC);
            float orbitalDayMask = mix(1.0, 0.24 + 0.76 * smoothstep(-0.34, 0.34, orbitalNdotL), u_shadowEnabled);
            float dayMask = mix(orbitalDayMask, u_localDayScale, nearSurfaceSkyT);

            // Palette matching the attached Mars surface photo:
            // luminous pale creamy-sand horizon -> warm sandy-peach -> muted amber -> dusky rose/amber zenith
            vec3 horizonTone = mix(vec3(0.91, 0.84, 0.75), vec3(0.95, 0.89, 0.80), u_opticalBoost);
            vec3 lowerSkyTone = mix(vec3(0.84, 0.72, 0.61), vec3(0.89, 0.77, 0.65), u_opticalBoost);
            vec3 midSkyTone = mix(vec3(0.71, 0.55, 0.45), vec3(0.76, 0.59, 0.48), u_opticalBoost);
            vec3 zenithTone = mix(vec3(0.50, 0.35, 0.33), vec3(0.56, 0.39, 0.36), u_opticalBoost);

            vec3 skyColor = mix(zenithTone, midSkyTone, smoothstep(0.03, 0.34, opticalDepth));
            skyColor = mix(skyColor, lowerSkyTone, smoothstep(0.34, 0.72, opticalDepth));
            skyColor = mix(skyColor, horizonTone, smoothstep(0.72, 0.98, opticalDepth));
            skyColor += vec3(0.12, 0.09, 0.06) * mieForward * (0.25 + 0.75 * opticalDepth);

            // Horizon-emerging radiance boost below 100 km without clipping to flat white
            float horizonEmergence = exp(-max(elevAboveHorizon, 0.0) / mix(0.06, 0.17, below100Intensity)) * belowFade;
            skyColor = mix(skyColor, horizonTone, horizonEmergence * below100Intensity * 0.48);
            skyColor = min(skyColor, vec3(0.97, 0.92, 0.84));

            float lowAltBoost = mix(1.0, 0.76, clamp(u_camAltitudeKm / 145.0, 0.0, 1.0));
            float horizonAlpha = pow(max(opticalDepth, 1e-4), 0.62) * lowAltBoost * (1.55 + 0.65 * below100Intensity);
            float skyAlpha = clamp(max(horizonAlpha, nearSurfaceSkyT), 0.0, 1.0);

            float orbitalGain = mix(0.76 + 0.18 * opticalDepth, 0.82 + 0.20 * opticalDepth, u_opticalBoost);
            float surfaceGain = orbitalGain + below100Intensity * (0.02 + 0.04 * horizonEmergence);

            material.diffuse = vec3(0.0);
            material.emission = clamp(skyColor * surfaceGain * dayMask, vec3(0.0), vec3(0.99));
            material.alpha = clamp(max(skyAlpha * dayMask, nearSurfaceSkyT) * u_opacity, 0.0, 1.0);
            return material;
          }
        `,
      },
      translucent: true,
    });
    const horizonAtmospherePrimitive = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.EllipsoidGeometry({
          radii: new Cesium.Cartesian3(
            MARS_CONSTANTS.EQUATORIAL_RADIUS + ATMOSPHERE_SHELL_ALTITUDE_METERS,
            MARS_CONSTANTS.EQUATORIAL_RADIUS + ATMOSPHERE_SHELL_ALTITUDE_METERS,
            MARS_CONSTANTS.POLAR_RADIUS + ATMOSPHERE_SHELL_ALTITUDE_METERS
          ),
          vertexFormat: Cesium.MaterialAppearance.MaterialSupport.ALL.vertexFormat,
          stackPartitions: 128,
          slicePartitions: 256,
        }),
      }),
      appearance: new Cesium.MaterialAppearance({
        material: horizonAtmosphereMaterial,
        materialSupport: Cesium.MaterialAppearance.MaterialSupport.ALL,
        flat: true,
        translucent: true,
        closed: false,
        renderState: {
          cull: {
            enabled: true,
            face: Cesium.CullFace.FRONT,
          },
          depthTest: {
            enabled: true,
          },
          depthMask: false,
        },
      }),
      asynchronous: false,
      show: false,
    });
    viewer.scene.primitives.add(horizonAtmospherePrimitive);
    horizonAtmospherePrimitiveRef.current = horizonAtmospherePrimitive;

    // 2b-horizon. Distance-based aerial perspective fading toward the horizon (< 100 km clearance, Optical only),
    // plus 5x3 morphological silhouette edge anti-aliasing across all modes so the horizon curve stays smooth.
    if (Cesium.PostProcessStage && viewer.scene.postProcessStages?.add) {
      const horizonDistanceFadeStage = new Cesium.PostProcessStage({
        name: 'ares_horizon_distance_fade',
        fragmentShader: `
          uniform sampler2D colorTexture;
          uniform sampler2D depthTexture;
          uniform float u_fadeIntensity;
          uniform float u_horizonDistM;
          uniform vec3 u_midFadeColor;
          uniform vec3 u_farFadeColor;
          in vec2 v_textureCoordinates;

          void main(void) {
            vec4 baseColor = texture(colorTexture, v_textureCoordinates);
            float rawDepth = texture(depthTexture, v_textureCoordinates).r;
            vec2 texel = 1.0 / max(czm_viewport.zw, vec2(1.0));
            vec2 uvUp = clamp(v_textureCoordinates + vec2(0.0, texel.y), vec2(0.0), vec2(1.0));
            vec2 uvDn = clamp(v_textureCoordinates - vec2(0.0, texel.y), vec2(0.0), vec2(1.0));
            vec2 uvLt = clamp(v_textureCoordinates - vec2(texel.x, 0.0), vec2(0.0), vec2(1.0));
            vec2 uvRt = clamp(v_textureCoordinates + vec2(texel.x, 0.0), vec2(0.0), vec2(1.0));
            float dUp = texture(depthTexture, uvUp).r;
            float dDn = texture(depthTexture, uvDn).r;
            float dLt = texture(depthTexture, uvLt).r;
            float dRt = texture(depthTexture, uvRt).r;

            bool isSky = rawDepth >= 0.999995;
            float terrainNeighbors =
              (dUp < 0.999995 ? 1.0 : 0.0) +
              (dDn < 0.999995 ? 1.0 : 0.0) +
              (dLt < 0.999995 ? 1.0 : 0.0) +
              (dRt < 0.999995 ? 1.0 : 0.0);
            float skyNeighbors =
              (dUp >= 0.999995 ? 1.0 : 0.0) +
              (dDn >= 0.999995 ? 1.0 : 0.0) +
              (dLt >= 0.999995 ? 1.0 : 0.0) +
              (dRt >= 0.999995 ? 1.0 : 0.0);
            bool isEdge = (isSky && terrainNeighbors > 0.0) || (!isSky && skyNeighbors > 0.0);

            if (!isEdge && (isSky || u_fadeIntensity <= 0.002)) {
              out_FragColor = baseColor;
              return;
            }

            vec2 uvUp2 = clamp(v_textureCoordinates + vec2(0.0, 2.0 * texel.y), vec2(0.0), vec2(1.0));
            vec2 uvDn2 = clamp(v_textureCoordinates - vec2(0.0, 2.0 * texel.y), vec2(0.0), vec2(1.0));
            float dUp2 = texture(depthTexture, uvUp2).r;
            float dDn2 = texture(depthTexture, uvDn2).r;
            bool nearEdge = isEdge ||
              (isSky && (dUp2 < 0.999995 || dDn2 < 0.999995)) ||
              (!isSky && (dUp2 >= 0.999995 || dDn2 >= 0.999995));

            vec3 terrainRgb = baseColor.rgb;
            if (!isSky && u_fadeIntensity > 0.002) {
              vec4 posEC = czm_windowToEyeCoordinates(gl_FragCoord.xy, rawDepth);
              float distM = length(posEC.xyz / max(abs(posEC.w), 1e-7));
              float distRatio = distM / max(2400.0, u_horizonDistM);
              float dNorm = clamp((distRatio - 0.18) / 0.82, 0.0, 1.35);

              // Keep foreground & midground crisp; gently fade distant terrain toward the horizon sky
              float fadeCurve = dNorm <= 0.0 ? 0.0 : (1.0 - exp(-pow(max(dNorm * 1.45, 1e-4), 1.65)));
              float distanceFade = fadeCurve * u_fadeIntensity;
              float edgeBoost = skyNeighbors > 0.0 ? clamp(0.16 + 0.28 * u_fadeIntensity, 0.0, 0.56) : 0.0;
              float fadeAmount = clamp(max(distanceFade, edgeBoost), 0.0, 0.62);

              vec3 horizonColor = mix(u_midFadeColor, u_farFadeColor, smoothstep(0.25, 0.95, dNorm));
              terrainRgb = mix(baseColor.rgb, horizonColor, fadeAmount);
            }

            if (!nearEdge) {
              out_FragColor = vec4(terrainRgb, baseColor.a);
              return;
            }

            // 5x3 morphological silhouette coverage filter to remove staircasing along curved/tilted horizons
            float skyWeightSum = 0.0;
            float totalWeight = 0.0;
            for (int dy = -1; dy <= 1; dy++) {
              float wy = dy == 0 ? 2.0 : 1.0;
              for (int dx = -2; dx <= 2; dx++) {
                int ax = dx < 0 ? -dx : dx;
                float wx = ax == 0 ? 3.0 : (ax == 1 ? 2.0 : 1.0);
                float w = wx * wy;
                vec2 sampleUv = clamp(
                  v_textureCoordinates + vec2(float(dx), float(dy)) * texel,
                  vec2(0.0),
                  vec2(1.0)
                );
                float sd = texture(depthTexture, sampleUv).r;
                skyWeightSum += (sd >= 0.999995 ? 1.0 : 0.0) * w;
                totalWeight += w;
              }
            }
            float localSkyFrac = skyWeightSum / max(totalWeight, 1.0);

            if (isSky) {
              if (terrainNeighbors <= 0.0) {
                vec3 adjTerrain = dDn2 < 0.999995
                  ? texture(colorTexture, uvDn2).rgb
                  : (dUp2 < 0.999995 ? texture(colorTexture, uvUp2).rgb : baseColor.rgb);
                if (u_fadeIntensity > 0.002) {
                  adjTerrain = mix(adjTerrain, u_farFadeColor, clamp(0.20 + 0.30 * u_fadeIntensity, 0.0, 0.56));
                }
                float tFrac = clamp((1.0 - localSkyFrac) * 0.42, 0.0, 0.30);
                out_FragColor = vec4(mix(baseColor.rgb, adjTerrain, tFrac), baseColor.a);
              } else {
                vec3 edgeSum = vec3(0.0);
                if (dUp < 0.999995) edgeSum += texture(colorTexture, uvUp).rgb;
                if (dDn < 0.999995) edgeSum += texture(colorTexture, uvDn).rgb;
                if (dLt < 0.999995) edgeSum += texture(colorTexture, uvLt).rgb;
                if (dRt < 0.999995) edgeSum += texture(colorTexture, uvRt).rgb;
                vec3 neighborTerrain = edgeSum / terrainNeighbors;
                if (u_fadeIntensity > 0.002) {
                  neighborTerrain = mix(neighborTerrain, u_farFadeColor, clamp(0.22 + 0.32 * u_fadeIntensity, 0.0, 0.58));
                }
                float blendT = clamp((1.0 - localSkyFrac) * 0.95, 0.0, 0.52);
                out_FragColor = vec4(mix(baseColor.rgb, neighborTerrain, blendT), baseColor.a);
              }
              return;
            }

            if (skyNeighbors <= 0.0) {
              vec3 adjSky = dUp2 >= 0.999995
                ? texture(colorTexture, uvUp2).rgb
                : (dDn2 >= 0.999995 ? texture(colorTexture, uvDn2).rgb : terrainRgb);
              float sFrac = clamp(localSkyFrac * 0.38, 0.0, 0.28);
              out_FragColor = vec4(mix(terrainRgb, adjSky, sFrac), baseColor.a);
            } else {
              vec3 skySum = vec3(0.0);
              if (dUp >= 0.999995) skySum += texture(colorTexture, uvUp).rgb;
              if (dDn >= 0.999995) skySum += texture(colorTexture, uvDn).rgb;
              if (dLt >= 0.999995) skySum += texture(colorTexture, uvLt).rgb;
              if (dRt >= 0.999995) skySum += texture(colorTexture, uvRt).rgb;
              vec3 neighborSky = skySum / skyNeighbors;
              float blendS = clamp(localSkyFrac * 0.95, 0.0, 0.56);
              out_FragColor = vec4(mix(terrainRgb, neighborSky, blendS), baseColor.a);
            }
          }
        `,
        uniforms: {
          u_fadeIntensity: 0.0,
          u_horizonDistM: 120000.0,
          u_midFadeColor: new Cesium.Cartesian3(0.88, 0.77, 0.66),
          u_farFadeColor: new Cesium.Cartesian3(0.95, 0.89, 0.80),
        },
      });
      if (horizonDistanceFadeStage) {
        horizonDistanceFadeStage.enabled = true;
        viewer.scene.postProcessStages.add(horizonDistanceFadeStage);
        horizonSoftenerStageRef.current = horizonDistanceFadeStage;
      }
    }

    // 2c. Global Translucent Limb/Horizon Martian Cloud Shell (full at altitude, fades on zoom-in;
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
          stackPartitions: 144,
          slicePartitions: 256,
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
    reliefShadeLayer.alpha = 0.0;
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
    temperatureLayer.alpha = 0.0;
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
    radiationLayer.alpha = 0.0;
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
    elevationLayer.alpha = 0.0;
    elevationLayer.saturation = 0.0;
    elevationLayer.contrast = 1.5;
    elevationLayer.gamma = 0.9;
    elevationLayerRef.current = elevationLayer;

    // Plot Interactive Glowing Pins, Close-Up Spacecraft & Rover Sprites, and Geodesic Measure Entities
    const pinMap = new Map<string, CesiumEntity>();
    const pinMeta = new Map<
      string,
      { category: MarsTarget['category']; isPrimary: boolean; fallbackText: string }
    >();
    const spacecraftMap = new Map<string, CesiumEntity>();
    const roverMap = new Map<string, CesiumEntity>();
    const roverPositions = new Map<string, unknown>();
    const satCloseState = new Map<string, boolean>();
    const roverCloseState = new Map<string, boolean>();
    const surfaceHorizonPoints = new Map<string, unknown>();
    const pinEyeOffset = new Cesium.Cartesian3(0.0, 0.0, -10000.0);
    const zeroEyeOffset = new Cesium.Cartesian3(0.0, 0.0, 0.0);
    const farLabelOffset = new Cesium.Cartesian2(0, -6);
    const closeLabelOffset = new Cesium.Cartesian2(0, 78);
    const roverCloseLabelOffset = new Cesium.Cartesian2(0, 48);
    const getExaggeratedSurfacePosition = (
      latitude: number,
      longitude: number,
      elevationMeters = sampleElevationAt(longitude, latitude),
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
      _elevationMeters = sampleElevationAt(longitude, latitude),
      offsetMeters = 80
    ) =>
      new Cesium.CallbackProperty(
        () => getExaggeratedSurfacePosition(
          latitude,
          longitude,
          sampleElevationAt(longitude, latitude),
          offsetMeters
        ),
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
          sampleElevationAt(longitude, latitude) * exaggeration + offsetMeters,
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
      const targetElevation = sampleElevationAt(target.longitude, target.latitude);
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
            font: isPrimaryLabel
              ? '700 15px "Chakra Petch", sans-serif'
              : '600 12px "Chakra Petch", sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#05070B'),
            outlineWidth: isPrimaryLabel ? 3.5 : 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: farLabelOffset,
            eyeOffset: pinEyeOffset,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: labelDistanceDisplayCondition,
          },
        });
        pinMap.set(target.id, satPin);
        pinMeta.set(target.id, {
          category: target.category,
          isPrimary: isPrimaryLabel,
          fallbackText: target.shortName,
        });

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
            font: isPrimaryLabel
              ? '700 15px "Chakra Petch", sans-serif'
              : '600 12px "Chakra Petch", sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#05070B'),
            outlineWidth: isPrimaryLabel ? 3.5 : 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: farLabelOffset,
            eyeOffset: pinEyeOffset,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: labelDistanceDisplayCondition,
          },
        });
        pinMap.set(target.id, roverPin);
        pinMeta.set(target.id, {
          category: target.category,
          isPrimary: isPrimaryLabel,
          fallbackText: target.shortName,
        });

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
            font: isPrimaryLabel
              ? '700 15px "Chakra Petch", sans-serif'
              : '600 12px "Chakra Petch", sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#05070B'),
            outlineWidth: isPrimaryLabel ? 3.5 : 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: farLabelOffset,
            eyeOffset: pinEyeOffset,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: labelDistanceDisplayCondition,
          },
        });
        pinMap.set(target.id, surfacePin);
        pinMeta.set(target.id, {
          category: target.category,
          isPrimary: isPrimaryLabel,
          fallbackText: target.shortName,
        });
      }
    }

    pinEntitiesRef.current = pinMap;
    spacecraftEntitiesRef.current = spacecraftMap;
    roverEntitiesRef.current = roverMap;

    // Adaptive marker & polyline vertical clearance so <1 km points hug the surface without floating
    const getCameraHeightMeters = () => {
      const carto = marsEllipsoid.cartesianToCartographic(viewer.camera.positionWC);
      if (!carto) return DEFAULT_CAMERA_HEIGHT_METERS;
      if (carto.height > 150_000) return Math.max(0, carto.height);
      const groundElev = sampleElevationAt(Cesium.Math.toDegrees(carto.longitude), Cesium.Math.toDegrees(carto.latitude));
      return Math.max(0, carto.height - groundElev);
    };
    const getCameraDetailLevel = () => {
      const h = getCameraHeightMeters();
      if (h < 180) return 18;
      if (h < 700) return 17;
      if (h < 2_500) return 16;
      if (h < 9_000) return 14;
      if (h < 35_000) return 11;
      if (h < 120_000) return 8;
      if (h < 350_000) return 6;
      return 4;
    };
    const getAdaptiveMarkerOffset = (maxOffset = 40, minOffset = 0.4) =>
      Math.max(minOffset, Math.min(maxOffset, getCameraHeightMeters() * 0.00045));

    // Visual terrain-climbing helpers (keep real point-to-point distance math strictly untouched)
    const sampleClimbingElevations = (latDeg: number, lonDeg: number) => ({
      latDeg,
      lonDeg,
      elev0: sampleElevationAt(lonDeg, latDeg),
      elev4: sampleElevationAt(lonDeg, latDeg),
      elev11: sampleElevationAt(lonDeg, latDeg),
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
        Math.min(160, chordSag * 1.15 + Math.max(camHeight * 0.0005, segLenMeters * 0.012))
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
        depthFailMaterial: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#22D3EE').withAlpha(0.75),
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
        depthFailMaterial: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.25,
          color: Cesium.Color.fromCssColorString('#22D3EE').withAlpha(0.82),
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
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#94A3B8').withAlpha(0.8),
          dashLength: 16,
        }),
        depthFailMaterial: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString('#94A3B8').withAlpha(0.72),
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
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.35,
          color: Cesium.Color.fromCssColorString('#10B981').withAlpha(0.95),
        }),
        depthFailMaterial: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.35,
          color: Cesium.Color.fromCssColorString('#10B981').withAlpha(0.85),
        }),
      },
    });

    createSurfacePositionFnRef.current = createSurfacePositionProperty;

    // Pencil Freehand Site Habitability Selection Entities (terrain-climbing perimeter + draped triangulated mesh)
    const sr = sitePolyStateRef.current;
    const sitePolyColor = Cesium.Color.fromCssColorString('#F59E0B');

    const appendSegmentRingSamples = (
      targetSamples: Array<{
        latDeg: number;
        lonDeg: number;
        elev0: number;
        elev4: number;
        elev11: number;
      }>,
      fromLat: number,
      fromLon: number,
      toLat: number,
      toLon: number,
      steps: number,
      skipFirst: boolean
    ) => {
      let dLon = toLon - fromLon;
      if (dLon > 180) dLon -= 360;
      if (dLon < -180) dLon += 360;
      const start = skipFirst ? 1 : 0;
      for (let i = start; i <= steps; i++) {
        const t = i / steps;
        const lat = fromLat + (toLat - fromLat) * t;
        const lon = wrapLongitudeDeg(fromLon + dLon * t);
        targetSamples.push(sampleClimbingElevations(lat, lon));
      }
    };

    const buildSitePolygonRingSamples = (vertices: SitePolygonVertex[], closeLoop = true) => {
      if (vertices.length === 0) return [];
      if (vertices.length === 1) {
        return [sampleClimbingElevations(vertices[0].latDeg, vertices[0].lonDeg)];
      }
      const samples: Array<{
        latDeg: number;
        lonDeg: number;
        elev0: number;
        elev4: number;
        elev11: number;
      }> = [];
      const edgeCount = closeLoop ? vertices.length : vertices.length - 1;
      const totalStepsBudget = 144;
      const stepsPerEdge = Math.max(1, Math.min(18, Math.round(totalStepsBudget / Math.max(1, edgeCount))));

      for (let i = 0; i < edgeCount; i++) {
        const a = vertices[i];
        const b = vertices[(i + 1) % vertices.length];
        appendSegmentRingSamples(
          samples,
          a.latDeg,
          a.lonDeg,
          b.latDeg,
          b.lonDeg,
          stepsPerEdge,
          i > 0
        );
      }
      return samples;
    };

    const removeSiteFillPrimitive = () => {
      if (sr.fillPrimitive && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(sr.fillPrimitive);
      }
      if (sr.fillDepthFailPrimitive && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(sr.fillDepthFailPrimitive);
      }
      sr.fillPrimitive = null;
      sr.fillDepthFailPrimitive = null;
      sr.fillSampleCartesians = [];
    };

    const rebuildSitePolygonFillPrimitive = (vertices: SitePolygonVertex[], detailLevel: number) => {
      removeSiteFillPrimitive();
      if (viewer.isDestroyed() || vertices.length < 3) {
        sr.builtDetailLevel = detailLevel;
        return;
      }

      const mesh = triangulateFreehandMarsPolygon(vertices);
      if (!mesh || mesh.triangles.length === 0) {
        sr.builtDetailLevel = detailLevel;
        return;
      }

      const metrics = computePolygonMetricsKm(vertices);
      const maxSpanMeters = Math.max(100, metrics.perimeterKm * 250);
      const camHeight = getCameraHeightMeters();
      const approxCellMeters = maxSpanMeters / 18;
      const cellChordSag =
        (approxCellMeters * approxCellMeters) / (8 * MARS_CONSTANTS.EQUATORIAL_RADIUS);
      const fillClearance = Math.max(
        0.7,
        Math.min(
          120,
          cellChordSag * 1.15 + Math.max(camHeight * 0.00045, approxCellMeters * 0.015)
        )
      );
      const exag = viewer.scene.verticalExaggeration;

      const positions = new Float64Array(mesh.vertices.length * 3);
      const sampleCartesians: unknown[] = [];
      const sampleStride = Math.max(1, Math.floor(mesh.vertices.length / 16));
      let sumLat = 0;
      let sumLon = 0;
      for (let i = 0; i < mesh.vertices.length; i++) {
        const v = mesh.vertices[i];
        const lon = wrapLongitudeDeg(v.lonDeg);
        sumLat += v.latDeg;
        sumLon += lon;
        const sample = sampleClimbingElevations(v.latDeg, lon);
        const climbElev = resolveLodClimbElevMeters(sample, camHeight);
        const cart = Cesium.Cartesian3.fromDegrees(
          lon,
          v.latDeg,
          climbElev * exag + fillClearance,
          marsEllipsoid
        );
        positions[i * 3] = cart.x;
        positions[i * 3 + 1] = cart.y;
        positions[i * 3 + 2] = cart.z;
        if (i % sampleStride === 0) {
          sampleCartesians.push(cart);
        }
      }
      if (mesh.vertices.length > 0) {
        const cLat = sumLat / mesh.vertices.length;
        const cLon = wrapLongitudeDeg(sumLon / mesh.vertices.length);
        sampleCartesians.push(
          getExaggeratedSurfacePosition(cLat, cLon, sampleElevationAt(cLon, cLat), fillClearance)
        );
      }
      sr.fillSampleCartesians = sampleCartesians;

      const indices = new Uint16Array(mesh.triangles.length * 3);
      for (let i = 0; i < mesh.triangles.length; i++) {
        const tri = mesh.triangles[i];
        indices[i * 3] = tri[0];
        indices[i * 3 + 1] = tri[1];
        indices[i * 3 + 2] = tri[2];
      }

      const buildMeshGeometry = () =>
        new Cesium.Geometry({
          attributes: {
            position: new Cesium.GeometryAttribute({
              componentDatatype: Cesium.ComponentDatatype.DOUBLE,
              componentsPerAttribute: 3,
              values: positions.slice(),
            }),
          },
          indices: indices.slice(),
          primitiveType: Cesium.PrimitiveType.TRIANGLES,
          boundingSphere: Cesium.BoundingSphere.fromVertices(positions),
        });

      const primaryPrimitive = new Cesium.Primitive({
        geometryInstances: new Cesium.GeometryInstance({
          geometry: buildMeshGeometry(),
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(sitePolyColor.withAlpha(0.16)),
          },
        }),
        appearance: new Cesium.PerInstanceColorAppearance({
          flat: true,
          translucent: true,
          closed: false,
          renderState: {
            depthTest: { enabled: true },
            depthMask: false,
            cull: { enabled: false },
          },
        }),
        asynchronous: false,
      });

      const depthFailPrimitive = new Cesium.Primitive({
        geometryInstances: new Cesium.GeometryInstance({
          geometry: buildMeshGeometry(),
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(sitePolyColor.withAlpha(0.14)),
          },
        }),
        appearance: new Cesium.PerInstanceColorAppearance({
          flat: true,
          translucent: true,
          closed: false,
          renderState: {
            depthTest: { enabled: false },
            depthMask: false,
            cull: { enabled: false },
          },
        }),
        asynchronous: false,
      });

      viewer.scene.primitives.add(depthFailPrimitive);
      viewer.scene.primitives.add(primaryPrimitive);
      sr.fillDepthFailPrimitive = depthFailPrimitive;
      sr.fillPrimitive = primaryPrimitive;
      sr.builtDetailLevel = detailLevel;
    };

    sr.startDotEntity = viewer.entities.add({
      id: '__site-poly-start',
      show: false,
      position: new Cesium.CallbackProperty(() => {
        const first = sr.vertices[0];
        if (!first) return Cesium.Cartesian3.fromDegrees(0, 0, 0, marsEllipsoid);
        const camHeight = getCameraHeightMeters();
        const clearance = Math.max(1.2, computePathClearanceMeters(camHeight, 250) * 1.15);
        return getExaggeratedSurfacePosition(first.latDeg, first.lonDeg, first.elevMeters, clearance);
      }, false),
      point: {
        pixelSize: 8,
        color: sitePolyColor,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    sr.outlineEntity = viewer.entities.add({
      id: '__site-poly-outline',
      show: false,
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          if (sr.ringSamples.length < 2) return [];
          return buildVisualClimbingPositions(
            sr.ringSamples,
            Math.max(sr.ringSpanMeters, 100),
            1.15
          );
        }, false),
        arcType: Cesium.ArcType.NONE,
        width: 2.75,
        material: sitePolyColor.withAlpha(0.95),
        depthFailMaterial: sitePolyColor.withAlpha(0.85),
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
              : sampleElevationAt(lonDeg, latDeg);
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
      const elevMeters = sampleElevationAt(lonDeg, latDeg);
      const cartesian = getExaggeratedSurfacePosition(
        latDeg,
        lonDeg,
        elevMeters,
        getAdaptiveMarkerOffset(40, 0.4)
      );
      return { cartesian, carto, latDeg, lonDeg, elevMeters };
    };

    const finalizePencilStroke = () => {
      if (!sr.isDrawing) return;
      sr.isDrawing = false;
      sr.lastScreenPos = null;
      if (sr.startDotEntity) sr.startDotEntity.show = false;
      onSiteDrawingChangeRef.current(false);
      onSiteDrawLivePreviewChangeRef.current(null);

      const metrics = computePolygonMetricsKm(sr.vertices);
      if (sr.vertices.length < 3 || (metrics.areaKm2 < 0.0001 && metrics.perimeterKm < 0.05)) {
        clearSiteSelectionInternal();
        return;
      }

      const closedVerts = sr.vertices.map(({ latDeg, lonDeg }) => ({ latDeg, lonDeg }));
      sr.ringSamples = buildSitePolygonRingSamples(closedVerts, true);
      sr.ringSpanMeters = Math.max(100, metrics.perimeterKm * 1000);
      rebuildSitePolygonFillPrimitive(closedVerts, getCameraDetailLevel());
      if (sr.outlineEntity) sr.outlineEntity.show = true;
      onSitePolygonCompleteRef.current(closedVerts);
    };

    window.addEventListener('pointerup', finalizePencilStroke);
    window.addEventListener('pointercancel', finalizePencilStroke);

    // Real-time cursor coordinates + live measure preview + Pencil freehand surface drawing.
    let lastCursorMoveAt = 0;
    handler.setInputAction((movement: { endPosition: { x: number; y: number } }) => {
      lastCursorPositionRef.current = movement.endPosition;

      if (siteAnalysisModeRef.current && sr.isDrawing) {
        const lastPos = sr.lastScreenPos;
        if (lastPos) {
          const dx = movement.endPosition.x - lastPos.x;
          const dy = movement.endPosition.y - lastPos.y;
          const minStep = sr.vertices.length > 180 ? 14 : 5;
          if (Math.hypot(dx, dy) < minStep) return;
        }
        if (sr.vertices.length >= 240) return;

        const pt = pickMarsSurfacePoint(movement.endPosition);
        if (!pt) return;
        onCursorTelemetryChangeRef.current({
          latDeg: pt.latDeg,
          lonDeg: pt.lonDeg,
          elevationMeters: pt.elevMeters,
        });

        const prev = sr.vertices[sr.vertices.length - 1];
        sr.vertices.push({ latDeg: pt.latDeg, lonDeg: pt.lonDeg, elevMeters: pt.elevMeters });
        sr.lastScreenPos = { x: movement.endPosition.x, y: movement.endPosition.y };
        if (prev) {
          appendSegmentRingSamples(
            sr.ringSamples,
            prev.latDeg,
            prev.lonDeg,
            pt.latDeg,
            pt.lonDeg,
            4,
            true
          );
        } else {
          sr.ringSamples.push(sampleClimbingElevations(pt.latDeg, pt.lonDeg));
        }

        const metrics = computePolygonMetricsKm(sr.vertices);
        sr.ringSpanMeters = Math.max(100, metrics.perimeterKm * 1000);
        if (sr.outlineEntity) sr.outlineEntity.show = sr.ringSamples.length >= 2;
        onSiteDrawLivePreviewChangeRef.current(
          sr.vertices.length >= 3
            ? {
                pointCount: sr.vertices.length,
                perimeterKm: metrics.perimeterKm,
                areaKm2: metrics.areaKm2,
              }
            : {
                pointCount: sr.vertices.length,
                perimeterKm: 0,
                areaKm2: 0,
              }
        );
        return;
      }

      const now = performance.now();
      const inLiveMeasure = measureModeRef.current && ms.pointA && !ms.pointB;
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
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // Ensure pressing/tapping anywhere on the Cesium canvas blurs the search input,
    // and start freehand Pencil drawing when Pencil Site Analysis is active.
    handler.setInputAction((press: { position: { x: number; y: number } }) => {
      const searchInput = document.getElementById('searchInput');
      if (searchInput && document.activeElement === searchInput) {
        searchInput.blur();
      }

      if (siteAnalysisModeRef.current) {
        const pt = pickMarsSurfacePoint(press.position);
        if (!pt) return;
        onCursorTelemetryChangeRef.current({
          latDeg: pt.latDeg,
          lonDeg: pt.lonDeg,
          elevationMeters: pt.elevMeters,
        });

        removeSiteFillPrimitive();
        sr.isDrawing = true;
        sr.vertices = [{ latDeg: pt.latDeg, lonDeg: pt.lonDeg, elevMeters: pt.elevMeters }];
        sr.lastScreenPos = { x: press.position.x, y: press.position.y };
        sr.ringSamples = [sampleClimbingElevations(pt.latDeg, pt.lonDeg)];
        sr.ringSpanMeters = 0;
        sr.builtDetailLevel = null;
        if (sr.startDotEntity) sr.startDotEntity.show = true;
        if (sr.outlineEntity) sr.outlineEntity.show = false;
        onSiteDrawingChangeRef.current(true);
        onSiteDrawLivePreviewChangeRef.current({
          pointCount: 1,
          perimeterKm: 0,
          areaKm2: 0,
        });
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction(() => {
      finalizePencilStroke();
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    const resolvePickedTarget = (entityId: string) => {
      if (
        entityId.startsWith('__measure-') ||
        entityId.startsWith('__route-') ||
        entityId.startsWith('__site-poly') ||
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
          elevationMeters: sampleElevationAt(lonD, latD),
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

    const densifyPathClimbSamples = (
      pts: Array<{ latDeg: number; lonDeg: number }>,
      totalBudget = 160
    ) => {
      if (pts.length === 0) return [];
      if (pts.length === 1) return [sampleClimbingElevations(pts[0].latDeg, pts[0].lonDeg)];
      const samples: Array<{
        latDeg: number;
        lonDeg: number;
        elev0: number;
        elev4: number;
        elev11: number;
      }> = [];
      const segs = pts.length - 1;
      const stepsPerSeg = Math.max(1, Math.min(16, Math.round(totalBudget / Math.max(1, segs))));
      for (let i = 0; i < segs; i++) {
        appendSegmentRingSamples(
          samples,
          pts[i].latDeg,
          pts[i].lonDeg,
          pts[i + 1].latDeg,
          pts[i + 1].lonDeg,
          stepsPerSeg,
          i > 0
        );
      }
      return samples;
    };

    const renderSurvivalRouteOnGlobe = (result: SurvivalRouteResult) => {
      rs.result = result;
      for (const ring of rs.pulseRingEntities) {
        viewer.entities.remove(ring);
      }
      rs.pulseRingEntities = [];
      rs.pulseRings = [];
      rs.directSamples = [];
      rs.optimalSamples = [];

      const spanMeters = Math.max(100, result.directDistanceKm * 1000);
      const optimalSpanMeters = Math.max(100, result.optimalDistanceKm * 1000);

      if (rs.directLineEntity) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const poly = rs.directLineEntity.polyline as any;
        if (poly) {
          const samples = result.directArcPoints.map((pt) => ({
            latDeg: pt.latDeg,
            lonDeg: pt.lonDeg,
            elevationMeters: sampleElevationAt(pt.lonDeg, pt.latDeg),
          }));
          const climbSamples = densifyPathClimbSamples(result.directArcPoints, 120);
          rs.directSamples = samples;
          poly.positions = new Cesium.CallbackProperty(
            () => buildVisualClimbingPositions(climbSamples, spanMeters, 1.0),
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
            elevationMeters: sampleElevationAt(waypoint.lonDeg, waypoint.latDeg),
          }));
          const climbSamples = densifyPathClimbSamples(result.waypoints, 180);
          rs.optimalSamples = samples;
          poly.positions = new Cesium.CallbackProperty(
            () => buildVisualClimbingPositions(climbSamples, optimalSpanMeters, 1.15),
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
        const ringClimbSamples = ringSamples.map((s) => sampleClimbingElevations(s.latDeg, s.lonDeg));
        const ringPerimeterM = Math.max(100, 2 * Math.PI * roverRingRadiusKm * 1000);
        const baseColor = Cesium.Color.fromCssColorString('#FF6B35');
        const ringEntity = viewer.entities.add({
          id: `__route-pulse-rover-${idx}`,
          polyline: {
            positions: new Cesium.CallbackProperty(
              () => buildVisualClimbingPositions(ringClimbSamples, ringPerimeterM, 1.15),
              false
            ),
            width: 3,
            arcType: Cesium.ArcType.NONE,
            material: new Cesium.ColorMaterialProperty(
              new Cesium.CallbackProperty(
                () =>
                  baseColor.withAlpha(
                    0.32 + 0.63 * (0.5 + 0.5 * Math.sin(performance.now() * 0.0055 + idx))
                  ),
                false
              )
            ),
            depthFailMaterial: new Cesium.ColorMaterialProperty(
              new Cesium.CallbackProperty(
                () =>
                  baseColor.withAlpha(
                    0.26 + 0.50 * (0.5 + 0.5 * Math.sin(performance.now() * 0.0055 + idx))
                  ),
                false
              )
            ),
          },
        });
        rs.pulseRingEntities.push(ringEntity);
        rs.pulseRings.push({ entity: ringEntity, samples: ringSamples });
      });

      result.orbiterEncounters.forEach((sat, idx) => {
        if (result.directDistanceKm < 25 && sat.closestKm > maxRingDistKm) return;
        const ringSamples = createTerrainRingSamples(
          sat.crossLatDeg,
          sat.crossLonDeg,
          satRingRadiusKm
        );
        const ringClimbSamples = ringSamples.map((s) => sampleClimbingElevations(s.latDeg, s.lonDeg));
        const ringPerimeterM = Math.max(100, 2 * Math.PI * satRingRadiusKm * 1000);
        const baseColor = Cesium.Color.fromCssColorString('#22D3EE');
        const ringEntity = viewer.entities.add({
          id: `__route-pulse-sat-${idx}`,
          polyline: {
            positions: new Cesium.CallbackProperty(
              () => buildVisualClimbingPositions(ringClimbSamples, ringPerimeterM, 1.15),
              false
            ),
            width: 2.5,
            arcType: Cesium.ArcType.NONE,
            material: new Cesium.ColorMaterialProperty(
              new Cesium.CallbackProperty(
                () =>
                  baseColor.withAlpha(
                    0.28 + 0.58 * (0.5 + 0.5 * Math.sin(performance.now() * 0.0045 + idx + 1.4))
                  ),
                false
              )
            ),
            depthFailMaterial: new Cesium.ColorMaterialProperty(
              new Cesium.CallbackProperty(
                () =>
                  baseColor.withAlpha(
                    0.24 + 0.46 * (0.5 + 0.5 * Math.sin(performance.now() * 0.0045 + idx + 1.4))
                  ),
                false
              )
            ),
          },
        });
        rs.pulseRingEntities.push(ringEntity);
        rs.pulseRings.push({ entity: ringEntity, samples: ringSamples });
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

      // Pencil Freehand Site Analysis handles drawing on pointer down/move/up
      if (siteAnalysisModeRef.current) {
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
              elevMeters: sampleElevationAt(matchedPin.longitude, matchedPin.latitude),
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

    const scratchLocalUpWC = new Cesium.Cartesian3();
    const scratchLocalUpEC = new Cesium.Cartesian3();

    // preUpdate runs right before UniformState updates frame lighting & enforces strict 10 m terrain clearance
    const scratchCenterScreen = new Cesium.Cartesian2();
    const scratchSlantBackVec = new Cesium.Cartesian3();
    const removePreUpdate = viewer.scene.preUpdate.addEventListener(() => {
      const camCarto = marsEllipsoid.cartesianToCartographic(viewer.camera.positionWC);
      if (camCarto && camCarto.height < 40_000) {
        const latDeg = Cesium.Math.toDegrees(camCarto.latitude);
        const lonDeg = Cesium.Math.toDegrees(camCarto.longitude);
        const exag = viewer.scene.verticalExaggeration;
        const minSurfaceHeight = sampleElevationAt(lonDeg, latDeg) * exag + MIN_CAMERA_HEIGHT_METERS;
        if (camCarto.height < minSurfaceHeight) {
          viewer.camera.position = Cesium.Cartesian3.fromRadians(
            camCarto.longitude,
            camCarto.latitude,
            minSurfaceHeight,
            marsEllipsoid
          );
        }

        // Prevent tilted cameras from leaning closer than 10 m along view ray against slopes/cliffs
        const canvasEl = viewer.scene.canvas;
        scratchCenterScreen.x = canvasEl.clientWidth * 0.5;
        scratchCenterScreen.y = canvasEl.clientHeight * 0.5;
        const centerRay = viewer.camera.getPickRay(scratchCenterScreen);
        const centerHit = centerRay ? viewer.scene.globe.pick(centerRay, viewer.scene) : undefined;
        if (centerHit) {
          const slantDist = Cesium.Cartesian3.distance(viewer.camera.positionWC, centerHit);
          if (slantDist < MIN_CAMERA_HEIGHT_METERS) {
            const pushBack = MIN_CAMERA_HEIGHT_METERS - slantDist;
            Cesium.Cartesian3.multiplyByScalar(
              viewer.camera.directionWC,
              -pushBack,
              scratchSlantBackVec
            );
            viewer.camera.position = Cesium.Cartesian3.add(
              viewer.camera.positionWC,
              scratchSlantBackVec,
              new Cesium.Cartesian3()
            );
          }
        }
      }
      updateCameraDaylight();
    });

    // preRender: Horizon/Terrain Occlusion, Satellite/Rover LOD, and Screen-Space Label Anti-Overlap
    const scratchWinPos = new Cesium.Cartesian2();
    let lastCloseTerrainOcclusion: boolean | null = null;
    const invEqR = 1 / MARS_CONSTANTS.EQUATORIAL_RADIUS;
    const invPolR = 1 / MARS_CONSTANTS.POLAR_RADIUS;
    // Hemisphere / horizon ray check that remains exact even when camera or surface points
    // are inside negative-elevation MOLA basins (e.g. Hellas -8.2 km, Valles Marineris -7 km, Gale -4.5 km).
    const isPointVisibleAcrossMars = (
      camPos: { x: number; y: number; z: number },
      ptPos: { x: number; y: number; z: number },
      camClearanceM: number
    ): boolean => {
      const cx = camPos.x * invEqR;
      const cy = camPos.y * invEqR;
      const cz = camPos.z * invPolR;
      const px = ptPos.x * invEqR;
      const py = ptPos.y * invEqR;
      const pz = ptPos.z * invPolR;

      const dx = px - cx;
      const dy = py - cy;
      const dz = pz - cz;
      const dMagSq = dx * dx + dy * dy + dz * dz;
      if (dMagSq < 1e-14) return true;

      const t = -(cx * dx + cy * dy + cz * dz) / dMagSq;
      if (t <= 0 || t >= 1) return true;

      const mx = cx + t * dx;
      const my = cy + t * dy;
      const mz = cz + t * dz;
      const midMag = Math.sqrt(mx * mx + my * my + mz * mz);
      const cMag = Math.sqrt(cx * cx + cy * cy + cz * cz);
      const pMag = Math.sqrt(px * px + py * py + pz * pz);
      const bodyMag = Math.min(1.0, cMag, pMag);
      const tolBlend = Cesium.Math.clamp((camClearanceM - 120_000) / 180_000, 0, 1);
      const tol = lerp(0.0055, 0.00018, tolBlend);
      return midMag >= bodyMag - tol;
    };
    const isSampleListVisible = (
      camPos: { x: number; y: number; z: number },
      camClearanceM: number,
      samples: Array<{ latDeg: number; lonDeg: number; elevationMeters?: number; elevMeters?: number }>
    ): boolean => {
      if (samples.length === 0) return false;
      const step = samples.length > 24 ? Math.max(1, Math.floor(samples.length / 20)) : 1;
      for (let i = 0; i < samples.length; i += step) {
        const s = samples[i];
        const elev = s.elevationMeters ?? s.elevMeters ?? sampleElevationAt(s.lonDeg, s.latDeg);
        const pos = getExaggeratedSurfacePosition(s.latDeg, s.lonDeg, elev, 20);
        if (isPointVisibleAcrossMars(camPos, pos, camClearanceM)) return true;
      }
      const last = samples[samples.length - 1];
      const lastElev = last.elevationMeters ?? last.elevMeters ?? sampleElevationAt(last.lonDeg, last.latDeg);
      return isPointVisibleAcrossMars(
        camPos,
        getExaggeratedSurfacePosition(last.latDeg, last.lonDeg, lastElev, 20),
        camClearanceM
      );
    };

    const removePreRender = viewer.scene.preRender.addEventListener(() => {
      if (viewer.isDestroyed()) return;

      const camPosWC = viewer.camera.positionWC as { x: number; y: number; z: number };
      const camClearanceM = getCameraHeightMeters();
      const closeTerrainOcclusion = camClearanceM < 200_000;

      if (lastCloseTerrainOcclusion !== closeTerrainOcclusion) {
        lastCloseTerrainOcclusion = closeTerrainOcclusion;
        const nextDepthDist = closeTerrainOcclusion ? 0 : Number.POSITIVE_INFINITY;
        const nextEyeOffset = closeTerrainOcclusion ? zeroEyeOffset : pinEyeOffset;

        for (const target of MARS_TARGETS) {
          if (target.category === 'satellite') continue;
          const pin = pinMap.get(target.id);
          if (!pin) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bb = pin.billboard as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lbl = pin.label as any;
          if (bb) {
            bb.disableDepthTestDistance = nextDepthDist;
            bb.eyeOffset = nextEyeOffset;
          }
          if (lbl) {
            lbl.disableDepthTestDistance = nextDepthDist;
            lbl.eyeOffset = nextEyeOffset;
          }
        }
        for (const entry of customPinEntitiesRef.current.values()) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bb = entry.entity.billboard as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lbl = entry.entity.label as any;
          if (bb) {
            bb.disableDepthTestDistance = nextDepthDist;
            bb.eyeOffset = closeTerrainOcclusion ? zeroEyeOffset : new Cesium.Cartesian3(0, 0, -5000);
          }
          if (lbl) {
            lbl.disableDepthTestDistance = nextDepthDist;
            lbl.eyeOffset = closeTerrainOcclusion ? zeroEyeOffset : new Cesium.Cartesian3(0, 0, -5000);
          }
        }
      }

      // 1. Satellite, Rover, and Surface Landmark Pin Horizon Occlusion
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
            ? (pin.position.getValue(viewer.clock.currentTime) as { x: number; y: number; z: number } | undefined)
            : undefined;
          if (satPosition) {
            const isFront = isPointVisibleAcrossMars(camPosWC, satPosition, camClearanceM);
            const distMeters = Cesium.Cartesian3.distance(camPosWC, satPosition);
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
            const isFront = isPointVisibleAcrossMars(camPosWC, roverPosition, camClearanceM);
            const distMeters = Cesium.Cartesian3.distance(camPosWC, roverPosition);
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
            const isFront = isPointVisibleAcrossMars(camPosWC, surfacePoint, camClearanceM);
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
                  camPosWC,
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
        entry.entity.show = pos ? isPointVisibleAcrossMars(camPosWC, pos, camClearanceM) : false;
      }

      // 2. Horizon-occlude ALL paths, routes, pulse rings, measurement lines, Pencil shapes & landmark outlines
      if (ms.pointAEntity) {
        ms.pointAEntity.show = ms.pointA
          ? isPointVisibleAcrossMars(
              camPosWC,
              getExaggeratedSurfacePosition(ms.pointA.latDeg, ms.pointA.lonDeg, ms.pointA.elevMeters, 20),
              camClearanceM
            )
          : false;
      }
      if (ms.pointBEntity) {
        ms.pointBEntity.show = ms.pointB
          ? isPointVisibleAcrossMars(
              camPosWC,
              getExaggeratedSurfacePosition(ms.pointB.latDeg, ms.pointB.lonDeg, ms.pointB.elevMeters, 20),
              camClearanceM
            )
          : false;
      }
      if (ms.previewLineEntity) {
        ms.previewLineEntity.show =
          ms.previewVisualSamples.length >= 2 &&
          isSampleListVisible(camPosWC, camClearanceM, ms.previewVisualSamples);
      }
      if (ms.lockedLineEntity) {
        ms.lockedLineEntity.show =
          ms.lockedVisualSamples.length >= 2 &&
          isSampleListVisible(camPosWC, camClearanceM, ms.lockedVisualSamples);
      }

      if (rs.startEntity) {
        rs.startEntity.show = rs.start
          ? isPointVisibleAcrossMars(
              camPosWC,
              getExaggeratedSurfacePosition(rs.start.latDeg, rs.start.lonDeg, rs.start.elevMeters, 20),
              camClearanceM
            )
          : false;
      }
      if (rs.destEntity) {
        rs.destEntity.show = rs.destination
          ? isPointVisibleAcrossMars(
              camPosWC,
              getExaggeratedSurfacePosition(
                rs.destination.latDeg,
                rs.destination.lonDeg,
                rs.destination.elevMeters,
                20
              ),
              camClearanceM
            )
          : false;
      }
      if (rs.directLineEntity) {
        rs.directLineEntity.show =
          rs.hasResult &&
          rs.directSamples.length >= 2 &&
          isSampleListVisible(camPosWC, camClearanceM, rs.directSamples);
      }
      if (rs.optimalLineEntity) {
        rs.optimalLineEntity.show =
          rs.hasResult &&
          rs.optimalSamples.length >= 2 &&
          isSampleListVisible(camPosWC, camClearanceM, rs.optimalSamples);
      }
      for (const ringEntry of rs.pulseRings) {
        ringEntry.entity.show = isSampleListVisible(camPosWC, camClearanceM, ringEntry.samples);
      }

      if (sr.startDotEntity) {
        const first = sr.vertices[0];
        sr.startDotEntity.show =
          sr.isDrawing && first
            ? isPointVisibleAcrossMars(
                camPosWC,
                getExaggeratedSurfacePosition(first.latDeg, first.lonDeg, first.elevMeters, 20),
                camClearanceM
              )
            : false;
      }
      if (sr.outlineEntity) {
        sr.outlineEntity.show =
          sr.ringSamples.length >= 2 && isSampleListVisible(camPosWC, camClearanceM, sr.ringSamples);
      }
      if (sr.fillPrimitive || sr.fillDepthFailPrimitive) {
        let fillVisible = !sr.isDrawing && sr.fillSampleCartesians.length > 0;
        if (fillVisible) {
          let anyFront = false;
          for (const cart of sr.fillSampleCartesians) {
            if (isPointVisibleAcrossMars(camPosWC, cart as { x: number; y: number; z: number }, camClearanceM)) {
              anyFront = true;
              break;
            }
          }
          fillVisible = anyFront;
        }
        if (sr.fillPrimitive) {
          (sr.fillPrimitive as { show: boolean }).show = fillVisible;
        }
        if (sr.fillDepthFailPrimitive) {
          (sr.fillDepthFailPrimitive as { show: boolean }).show = fillVisible;
        }
      }

      if (selectedRegionEntityRef.current) {
        const regionSamples = selectedRegionSamplesRef.current;
        if (regionSamples.length > 0) {
          let regionVisible = false;
          const stride = Math.max(1, Math.floor(regionSamples.length / 16));
          for (let i = 0; i < regionSamples.length; i += stride) {
            if (
              isPointVisibleAcrossMars(
                camPosWC,
                regionSamples[i] as { x: number; y: number; z: number },
                camClearanceM
              )
            ) {
              regionVisible = true;
              break;
            }
          }
          selectedRegionEntityRef.current.show = regionVisible;
        }
      }

      // 3. Screen-Space Label Anti-Overlap Pass (prevents close labels from clamping together)
      const canvasW = viewer.scene.canvas.clientWidth;
      const canvasH = viewer.scene.canvas.clientHeight;
      interface LabelCandidate {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        label: any;
        left: number;
        right: number;
        top: number;
        bottom: number;
        priority: number;
        distMeters: number;
      }
      const candidates: LabelCandidate[] = [];

      const pushLabelCandidate = (
        entity: CesiumEntity,
        priority: number,
        isPrimary: boolean,
        fallbackText: string
      ) => {
        if (!entity.show || !entity.label || !entity.position?.getValue) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lbl = entity.label as any;
        const pos = entity.position.getValue(viewer.clock.currentTime);
        if (!pos) return;
        const win = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, pos, scratchWinPos);
        if (!win || !Number.isFinite(win.x) || !Number.isFinite(win.y)) {
          lbl.show = false;
          return;
        }
        if (win.x < -120 || win.x > canvasW + 120 || win.y < -60 || win.y > canvasH + 60) {
          lbl.show = false;
          return;
        }
        const liveText =
          typeof lbl.text?.getValue === 'function'
            ? lbl.text.getValue(viewer.clock.currentTime)
            : lbl.text;
        const textStr = typeof liveText === 'string' && liveText.length > 0 ? liveText : fallbackText;
        const charW = isPrimary ? 9.2 : 7.4;
        const width = Math.max(36, textStr.length * charW + 14);
        const height = isPrimary ? 23 : 18;
        const offsetX = lbl.pixelOffset?.x ?? 0;
        const offsetY = lbl.pixelOffset?.y ?? -6;
        const anchorX = win.x + offsetX;
        const anchorY = win.y + offsetY;
        const isTopOrigin = lbl.verticalOrigin === Cesium.VerticalOrigin.TOP;
        const top = isTopOrigin ? anchorY : anchorY - height;
        const bottom = top + height;
        const distMeters = Cesium.Cartesian3.distance(viewer.camera.positionWC, pos);

        candidates.push({
          label: lbl,
          left: anchorX - width * 0.5,
          right: anchorX + width * 0.5,
          top,
          bottom,
          priority,
          distMeters,
        });
      };

      for (const target of MARS_TARGETS) {
        const pin = pinMap.get(target.id);
        if (!pin) continue;
        const meta = pinMeta.get(target.id);
        const isPrimary = meta?.isPrimary ?? false;
        const isSelected = selectedTargetIdRef.current === target.id;
        const priority = isSelected
          ? 1000
          : target.category === 'rover'
            ? isPrimary
              ? 700
              : 350
            : target.category === 'landmark'
              ? isPrimary
                ? 600
                : 200
              : isPrimary
                ? 500
                : 250;
        pushLabelCandidate(pin, priority, isPrimary, meta?.fallbackText ?? target.shortName);
      }

      for (const entry of customPinEntitiesRef.current.values()) {
        const isSelected = selectedTargetIdRef.current === entry.entity.id;
        pushLabelCandidate(
          entry.entity,
          isSelected ? 1000 : 800,
          false,
          entry.entity.name ?? 'Pin'
        );
      }

      candidates.sort((a, b) => b.priority - a.priority || a.distMeters - b.distMeters);
      const placedBoxes: Array<{ left: number; right: number; top: number; bottom: number }> = [];
      const padX = 7;
      const padY = 5;

      for (const cand of candidates) {
        let overlaps = false;
        for (let i = 0; i < placedBoxes.length; i++) {
          const box = placedBoxes[i];
          if (
            cand.left - padX < box.right &&
            cand.right + padX > box.left &&
            cand.top - padY < box.bottom &&
            cand.bottom + padY > box.top
          ) {
            overlaps = true;
            break;
          }
        }
        cand.label.show = !overlaps;
        if (!overlaps) {
          placedBoxes.push({
            left: cand.left,
            right: cand.right,
            top: cand.top,
            bottom: cand.bottom,
          });
        }
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

    // Keep the loading screen visible for at least 10s and never hide it before the globe's
    // terrain, map tile images, and skybox have loaded and rendered on screen.
    const LOADING_MIN_MS = 10_000;
    const LOADING_MAX_WAIT_MS = 60_000;
    const REQUIRED_RENDERED_FRAMES_AFTER_LOAD = 4;
    let hasRevealed = false;
    let sawTileQueueActivity = false;
    let lastTileQueueLength = -1;
    let settledRenderedFrames = 0;
    let maxWaitTimerId: number | null = null;

    const reveal = () => {
      if (hasRevealed || viewer.isDestroyed()) return;
      hasRevealed = true;
      if (maxWaitTimerId !== null) {
        window.clearTimeout(maxWaitTimerId);
        maxWaitTimerId = null;
      }
      setIsReady(true);
      onGlobeReady?.(true);
    };

    maxWaitTimerId = window.setTimeout(reveal, LOADING_MAX_WAIT_MS);

    const removeTileProgress = viewer.scene.globe.tileLoadProgressEvent.addEventListener(
      (queuedCount: number) => {
        lastTileQueueLength = queuedCount;
        if (queuedCount > 0) {
          sawTileQueueActivity = true;
          settledRenderedFrames = 0;
        }
      }
    );

    const areVisibleMapTilesRendered = (): boolean => {
      if (molaRasterFailed || !molaRasterSettled || !starfieldSettled) return false;
      if (pendingOpticalImages > 0 || pendingTerrainTiles > 0) return false;
      if (!viewer.scene.globe.tilesLoaded) return false;
      if (lastTileQueueLength > 0) return false;
      if (!sawTileQueueActivity && settledOpticalImages === 0 && settledTerrainTiles === 0) {
        return false;
      }

      const surface = (
        viewer.scene.globe as unknown as {
          _surface?: {
            _tilesToRender?: Array<{
              renderable?: boolean;
              data?: {
                imagery?: Array<{
                  loadingImagery?: {
                    state?: number;
                    imageryLayer?: { show?: boolean };
                  };
                  readyImagery?: unknown;
                }>;
              };
            }>;
          };
        }
      )._surface;

      const tilesToRender = surface?._tilesToRender;
      if (Array.isArray(tilesToRender)) {
        if (tilesToRender.length === 0) return false;
        let hasReadyOpticalTexture = false;
        for (const tile of tilesToRender) {
          if (tile.renderable === false) return false;
          const tileImageries = tile.data?.imagery;
          if (!Array.isArray(tileImageries)) continue;
          for (const ti of tileImageries) {
            const loading = ti.loadingImagery;
            if (loading && loading.imageryLayer?.show) {
              const state = loading.state;
              // ImageryState: 0=UNLOADED, 1=TRANSITIONING, 2=RECEIVED, 3=TEXTURE_LOADED, 4=READY, 5=FAILED, 6=INVALID
              if (state !== undefined && state < 4) {
                return false;
              }
            }
            if (ti.readyImagery) {
              hasReadyOpticalTexture = true;
            }
          }
        }
        if (completedOpticalImages > 0 && !hasReadyOpticalTexture) {
          return false;
        }
      }

      return true;
    };

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
      const rawCamHeight = camCarto ? camCarto.height : DEFAULT_CAMERA_HEIGHT_METERS;
      let camClearanceM = Math.max(0, rawCamHeight);
      if (camCarto && rawCamHeight < 250_000) {
        const groundElev = sampleElevationAt(Cesium.Math.toDegrees(camCarto.longitude), Cesium.Math.toDegrees(camCarto.latitude));
        camClearanceM = Math.max(0, rawCamHeight - groundElev);
      }

      // Tighten heightmap subdivision smoothly below 140 km so the planetary horizon curve & ridgelines are smooth
      const baseSSE = mobileOrTouch
        ? MOBILE_MAXIMUM_SCREEN_SPACE_ERROR
        : DESKTOP_MAXIMUM_SCREEN_SPACE_ERROR;
      const closeSse = mobileOrTouch ? 0.75 : 0.45;
      const closeSseBlend = Cesium.Math.clamp((140_000 - camClearanceM) / 115_000, 0.0, 1.0);
      const targetSSE = lerp(baseSSE, closeSse, closeSseBlend);
      if (Math.abs((viewer.scene.globe.maximumScreenSpaceError ?? baseSSE) - targetSSE) > 0.02) {
        viewer.scene.globe.maximumScreenSpaceError = targetSSE;
      }

      const ctxOpacity = getCtxFadeAlpha(camClearanceM);
      const rockOpacity = getRockDetailFadeAlpha(camClearanceM);
      // Progressively warm and deepen the surface ferric-oxide red tint as we descend from 500 km.
      const surfaceRedT = getSurfaceRedTintProgress(camClearanceM);
      const redTintOpacity = SURFACE_RED_TINT_MAX_ALPHA * surfaceRedT;
      if (mapStyleRef.current === 'optical' || mapStyleRef.current === 'radiation') {
        applyOpticalColorForAltitude(
          vikingLayerRef.current,
          surfaceRedT,
          mapStyleRef.current === 'optical'
        );
        applyCtxColorForAltitude(ctxLayerRef.current, camClearanceM);
      }
      if (ctxLayerRef.current) {
        ctxLayerRef.current.alpha = ctxOpacity;
        ctxLayerRef.current.show = mapStyleRef.current === 'optical' && ctxOpacity > 0.003;
      }
      if (redTintLayerRef.current) {
        redTintLayerRef.current.alpha = mapStyleRef.current === 'optical' ? redTintOpacity : 0.0;
        redTintLayerRef.current.show =
          mapStyleRef.current === 'optical' && redTintOpacity > 0.003;
      }
      if (rockDetailLayerRef.current) {
        rockDetailLayerRef.current.alpha = rockOpacity;
        rockDetailLayerRef.current.show = mapStyleRef.current === 'optical' && rockOpacity > 0.003;
      }

      const cloudShell = cloudShellPrimitiveRef.current;
      if (cloudShell) {
        const cloudOpacity = getCloudFadeAlpha(camClearanceM) * cloudModeBlendRef.current;
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

      // True 3D horizon-emerging Martian atmosphere (2x richer scattering, 100% by 100 km -> 0% at 200 km)
      const atmosphereProgress = Cesium.Math.clamp(
        (ATMOSPHERE_FADE_OUT_METERS - camClearanceM) /
          (ATMOSPHERE_FADE_OUT_METERS - ATMOSPHERE_FULL_VISIBLE_METERS),
        0.0,
        1.0
      );
      const atmT = atmosphereProgress * atmosphereProgress * (3.0 - 2.0 * atmosphereProgress);
      const atmVisible = atmT > 0.002;

      const isOpticalMode = mapStyleRef.current === 'optical';
      const under100Km = camClearanceM < 100_000;

      // Remove starfield & sun below 100 km and replace backdrop with dusky rose / muted amber sky
      if (viewer.scene.skyBox) {
        viewer.scene.skyBox.show = !under100Km;
      }
      if (viewer.scene.sun) {
        viewer.scene.sun.show = !under100Km;
      }

      let dayScale = 1.0;
      if (sunShadowEnabledRef.current && isOpticalMode) {
        marsEllipsoid.geodeticSurfaceNormal(viewer.camera.positionWC, scratchLocalUpWC);
        const lightDir = (viewer.scene.light as { direction?: unknown } | undefined)?.direction;
        if (lightDir) {
          const ndotl = -Cesium.Cartesian3.dot(scratchLocalUpWC, lightDir);
          const tTerm = Cesium.Math.clamp((ndotl + 0.22) / 0.56, 0.0, 1.0);
          dayScale = 0.22 + 0.78 * (tTerm * tTerm * (3.0 - 2.0 * tTerm));
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sceneBg = viewer.scene.backgroundColor as any;
      if (under100Km) {
        const bgGain = isOpticalMode ? 0.96 : 0.88;
        sceneBg.red = 0.55 * bgGain * dayScale;
        sceneBg.green = 0.39 * bgGain * dayScale;
        sceneBg.blue = 0.36 * bgGain * dayScale;
        sceneBg.alpha = 1.0;
      } else {
        sceneBg.red = 0.0;
        sceneBg.green = 0.0;
        sceneBg.blue = 0.0;
        sceneBg.alpha = 1.0;
      }

      const below100Intensity = under100Km
        ? Math.pow(1.0 - Cesium.Math.clamp(camClearanceM / 100_000, 0.0, 1.0), 0.7)
        : 0.0;

      const horizonShell = horizonAtmospherePrimitiveRef.current;
      if (horizonShell) {
        const near100Blend = 1.0 - Cesium.Math.clamp((camClearanceM - 100_000) / 38_000, 0.0, 1.0);
        const orbitalScale = isOpticalMode ? 1.0 : 0.4;
        const modeScale = lerp(orbitalScale, 1.0, near100Blend);
        const shellOpacity = atmT * modeScale;
        const showShell = shellOpacity > 0.002;
        horizonShell.show = showShell;
        if (showShell) {
          const uniforms = horizonShell.appearance?.material?.uniforms;
          if (uniforms) {
            marsEllipsoid.geodeticSurfaceNormal(viewer.camera.positionWC, scratchLocalUpWC);
            Cesium.Matrix4.multiplyByPointAsVector(
              viewer.camera.viewMatrix,
              scratchLocalUpWC,
              scratchLocalUpEC
            );
            Cesium.Cartesian3.normalize(scratchLocalUpEC, uniforms.u_localUpEC);
            const rLocal = MARS_CONSTANTS.EQUATORIAL_RADIUS;
            const rCam = rLocal + Math.max(0, camClearanceM);
            const ratio = rLocal / rCam;
            uniforms.u_horizonCos = -Math.sqrt(Math.max(0, 1 - ratio * ratio));
            uniforms.u_camAltitudeKm = camClearanceM / 1000;
            uniforms.u_opacity = shellOpacity;
            uniforms.u_shadowEnabled =
              sunShadowEnabledRef.current && isOpticalMode ? 1.0 : 0.0;
            uniforms.u_opticalBoost = isOpticalMode ? 1.0 : 0.0;
            uniforms.u_localDayScale = dayScale;
          }
        }
      }

      const targetHueShift = -0.052;
      const targetSaturationShift = 0.04;
      const targetBrightnessShift = isOpticalMode ? 0.19 : 0.05;
      // Fade Cesium's built-in per-vertex GroundAtmosphere/SkyAtmosphere out below 110 km so its
      // zero-blue scattering coefficients never paint a 1px yellow scaly rim along the horizon.
      const orbitalGroundAtmT = Cesium.Math.clamp((camClearanceM - 60_000) / 50_000, 0.0, 1.0);
      const showCesiumAtm = atmVisible && orbitalGroundAtmT > 0.01;
      const targetSkyLightIntensity = (isOpticalMode ? 58.0 : 48.0) * atmT * orbitalGroundAtmT;
      const targetGlobeLightIntensity = (isOpticalMode ? 29.0 : 24.0) * atmT * orbitalGroundAtmT;
      const skyAtmosphere = viewer.scene.skyAtmosphere;
      if (skyAtmosphere) {
        if (skyAtmosphere.show !== showCesiumAtm) {
          skyAtmosphere.show = showCesiumAtm;
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
      if (viewer.scene.globe.showGroundAtmosphere !== showCesiumAtm) {
        viewer.scene.globe.showGroundAtmosphere = showCesiumAtm;
      }
      if (
        Math.abs((viewer.scene.globe.atmosphereHueShift ?? 0.0) - targetHueShift) > 0.001 ||
        Math.abs((viewer.scene.globe.atmosphereSaturationShift ?? 0.0) - targetSaturationShift) > 0.001 ||
        Math.abs((viewer.scene.globe.atmosphereBrightnessShift ?? 0.0) - targetBrightnessShift) > 0.001 ||
        Math.abs(viewer.scene.globe.atmosphereLightIntensity - targetGlobeLightIntensity) > 0.05
      ) {
        viewer.scene.globe.atmosphereHueShift = targetHueShift;
        viewer.scene.globe.atmosphereSaturationShift = targetSaturationShift;
        viewer.scene.globe.atmosphereBrightnessShift = targetBrightnessShift;
        viewer.scene.globe.atmosphereLightIntensity = targetGlobeLightIntensity;
      }
      if (viewer.scene.fog && viewer.scene.fog.enabled) {
        viewer.scene.fog.enabled = false;
      }

      // Distance-based horizon fading (< 100 km, Optical mode only) + smooth horizon silhouette AA across modes
      const horizonFadeStage = horizonSoftenerStageRef.current;
      if (horizonFadeStage) {
        horizonFadeStage.enabled = true;
        if (isOpticalMode && under100Km && below100Intensity > 0.002) {
          horizonFadeStage.uniforms.u_fadeIntensity = below100Intensity * 0.52;
          const hSafe = Math.max(10, camClearanceM);
          horizonFadeStage.uniforms.u_horizonDistM = Math.sqrt(
            2 * MARS_CONSTANTS.EQUATORIAL_RADIUS * hSafe + hSafe * hSafe
          );
          const horizonGain = 1.02 + below100Intensity * 0.06;
          const midR = 0.89 * Math.min(1.0, horizonGain * 0.96);
          const midG = 0.77 * Math.min(1.0, horizonGain * 0.96);
          const midB = 0.65 * Math.min(1.0, horizonGain * 0.96);
          horizonFadeStage.uniforms.u_midFadeColor.x = Math.min(0.98, midR * dayScale);
          horizonFadeStage.uniforms.u_midFadeColor.y = Math.min(0.95, midG * dayScale);
          horizonFadeStage.uniforms.u_midFadeColor.z = Math.min(0.90, midB * dayScale);

          const farR = 0.95 * horizonGain;
          const farG = 0.89 * horizonGain;
          const farB = 0.80 * horizonGain;
          horizonFadeStage.uniforms.u_farFadeColor.x = Math.min(0.99, farR * dayScale);
          horizonFadeStage.uniforms.u_farFadeColor.y = Math.min(0.99, farG * dayScale);
          horizonFadeStage.uniforms.u_farFadeColor.z = Math.min(0.99, farB * dayScale);
        } else {
          horizonFadeStage.uniforms.u_fadeIntensity = 0.0;
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
        if (!sr.isDrawing && sr.vertices.length >= 3 && sr.builtDetailLevel !== currentDetail) {
          rebuildSitePolygonFillPrimitive(sr.vertices, currentDetail);
        }
      }

      if (!hasRevealed) {
        if (areVisibleMapTilesRendered()) {
          settledRenderedFrames += 1;
        } else {
          settledRenderedFrames = 0;
        }
        const elapsedMs = now - (loadingStartedAtRef.current ?? now);
        if (
          settledRenderedFrames >= REQUIRED_RENDERED_FRAMES_AFTER_LOAD &&
          elapsedMs >= LOADING_MIN_MS
        ) {
          reveal();
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

    return () => {
      stopContinuousZoomInternal();
      cancelAnimationFrame(rafId);
      if (maxWaitTimerId !== null) {
        window.clearTimeout(maxWaitTimerId);
        maxWaitTimerId = null;
      }
      if (cameraAnimationFrameRef.current !== null) {
        cancelAnimationFrame(cameraAnimationFrameRef.current);
        cameraAnimationFrameRef.current = null;
      }
      removePreUpdate();
      removePreRender();
      removePostRender();
      removeTileProgress();
      removeRenderError?.();
      if (layerTransitionFrameRef.current !== null) {
        window.cancelAnimationFrame(layerTransitionFrameRef.current);
        layerTransitionFrameRef.current = null;
      }
      window.removeEventListener('pointerup', finalizePencilStroke);
      window.removeEventListener('pointercancel', finalizePencilStroke);
      container.removeEventListener('wheel', handleContainerWheel);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      handler.destroy();
      unbindVikingErr();
      unbindCtxErr();
      unbindShadeErr();
      removeSiteFillPrimitive();
      if (horizonSoftenerStageRef.current && !viewer.isDestroyed()) {
        viewer.scene.postProcessStages?.remove?.(horizonSoftenerStageRef.current);
      }
      horizonSoftenerStageRef.current = null;
      if (cloudShellPrimitiveRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(cloudShellPrimitiveRef.current);
      }
      cloudShellPrimitiveRef.current = null;
      if (horizonAtmospherePrimitiveRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(horizonAtmospherePrimitiveRef.current);
      }
      horizonAtmospherePrimitiveRef.current = null;
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
    const redTintLayer = redTintLayerRef.current;
    const rockDetailLayer = rockDetailLayerRef.current;
    const reliefShadeLayer = reliefShadeLayerRef.current;
    const temperatureLayer = temperatureLayerRef.current;
    const radiationLayer = radiationLayerRef.current;
    const elevationLayer = elevationLayerRef.current;

    const viewer = viewerRef.current;
    const marsEllipsoid = marsEllipsoidRef.current;
    let camHeight = DEFAULT_CAMERA_HEIGHT_METERS;
    if (viewer && !viewer.isDestroyed() && marsEllipsoid) {
      const carto = marsEllipsoid.cartesianToCartographic(viewer.camera.position);
      if (carto) {
        const groundElev = sampleElevationAt((carto.longitude * 180) / Math.PI, (carto.latitude * 180) / Math.PI);
        camHeight = Math.max(0, carto.height - groundElev);
      }
    }

    const layers: Array<{ layer: CesiumImageryLayer | null; targetAlpha: number }> = [];
    if (opticalLayer) {
      const isOpticalBase = mapStyle === 'optical' || mapStyle === 'radiation';
      // Non-optical modes get fixed grading; optical altitude blend runs in the render loop
      if (mapStyle === 'optical') {
        const surfaceRedT = getSurfaceRedTintProgress(camHeight);
        applyOpticalColorForAltitude(opticalLayer, surfaceRedT, true);
      } else {
        opticalLayer.hue = 0.0;
        opticalLayer.contrast = 1.25;
        opticalLayer.brightness = 0.3;
        opticalLayer.saturation = 0.15;
        opticalLayer.gamma = 0.9;
      }
      layers.push({ layer: opticalLayer, targetAlpha: isOpticalBase ? 1.0 : 0.0 });
    }
    if (ctxLayer || redTintLayer || rockDetailLayer) {
      if (ctxLayer) {
        const ctxOpacity = getCtxFadeAlpha(camHeight);
        layers.push({ layer: ctxLayer, targetAlpha: mapStyle === 'optical' ? ctxOpacity : 0.0 });
      }
      if (redTintLayer) {
        const redOpacity = SURFACE_RED_TINT_MAX_ALPHA * getSurfaceRedTintProgress(camHeight);
        layers.push({ layer: redTintLayer, targetAlpha: mapStyle === 'optical' ? redOpacity : 0.0 });
      }
      if (rockDetailLayer) {
        const rockOpacity = getRockDetailFadeAlpha(camHeight);
        layers.push({
          layer: rockDetailLayer,
          targetAlpha: mapStyle === 'optical' ? rockOpacity : 0.0,
        });
      }
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
    const hasLayerTransition = layers.some(
      ({ targetAlpha }, index) => Math.abs(targetAlpha - starts[index]) > 0.003
    );
    const cloudModeStart = cloudModeBlendRef.current;
    const cloudModeTarget = mapStyle === 'optical' ? 1 : 0;
    if (!hasLayerTransition && Math.abs(cloudModeTarget - cloudModeStart) <= 0.003) {
      layers.forEach(({ layer, targetAlpha }) => {
        if (!layer) return;
        layer.alpha = targetAlpha;
        layer.show = targetAlpha > 0.003;
      });
      cloudModeBlendRef.current = cloudModeTarget;
      return;
    }

    const startedAt = performance.now();
    const durationMs = 420;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = progress * progress * (3 - 2 * progress);
      layers.forEach(({ layer, targetAlpha }, index) => {
        if (!layer) return;
        if (starts[index] <= 0.003 && targetAlpha <= 0.003) {
          layer.alpha = 0.0;
          layer.show = false;
          return;
        }
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

  // Lock camera globe panning/rotating while freehand Pencil Site Analysis is active
  useEffect(() => {
    if (!isReady) return;
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const controller = viewer.scene.screenSpaceCameraController;
    controller.enableRotate = !siteAnalysisMode;
    controller.enableTranslate = !siteAnalysisMode;
    if (!siteAnalysisMode && sitePolyStateRef.current.isDrawing) {
      clearSiteSelectionInternal();
    }
  }, [siteAnalysisMode, isReady]);

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
            font: '600 13px "Chakra Petch", sans-serif',
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
    selectedRegionSamplesRef.current = [];

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
    selectedRegionSamplesRef.current = positions;
    const regionOutlineColor = Cesium.Color.fromCssColorString('#FBBF24');
    const regionFillColor = Cesium.Color.fromCssColorString('#D97706');

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
          material: regionFillColor.withAlpha(0.025),
          outline: false,
        },
        polyline: {
          positions,
          clampToGround: true,
          width: 1.75,
          material: regionOutlineColor.withAlpha(0.75),
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
        material: regionFillColor.withAlpha(0.025),
        outline: false,
      },
      polyline: {
        positions,
        clampToGround: true,
        width: 1.75,
        material: regionOutlineColor.withAlpha(0.75),
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
