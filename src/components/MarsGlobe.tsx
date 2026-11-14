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
import { createMarsProceduralImageryProvider } from '../utils/marsTiledProviders';
import { CameraTelemetry, CursorTelemetry } from './CursorTelemetryPill';
import { MapStyleMode } from './MapStyleBar';
import { LiveMeasurePreview, MeasureResult } from './MeasureToolOverlay';

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
const MAX_CAMERA_HEIGHT_METERS = 32_000_000;
const CAMERA_INPUT_SENSITIVITY_MULTIPLIER = 0.6;

const CTX_MAX_ALPHA = 0.68;
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

function getLowAltitudeAtmosphereBoost(altitudeAboveSurfaceMeters: number): number {
  const t = Math.max(0, Math.min(1, (500_000 - altitudeAboveSurfaceMeters) / 500_000));
  return t * t * (3 - 2 * t);
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
  const reliefShadeLayerRef = useRef<CesiumImageryLayer | null>(null);
  const temperatureLayerRef = useRef<CesiumImageryLayer | null>(null);
  const loadedTemperatureLsRef = useRef<number | null>(null);
  const radiationLayerRef = useRef<CesiumImageryLayer | null>(null);
  const elevationLayerRef = useRef<CesiumImageryLayer | null>(null);
  const gridEntitiesRef = useRef<CesiumEntity[]>([]);
  const rebuildGridRef = useRef<((enabled: boolean, exaggeration: number) => void) | null>(null);
  const cameraAnimationFrameRef = useRef<number | null>(null);
  const lastCursorPositionRef = useRef<{ x: number; y: number } | null>(null);
  const selectedRegionEntityRef = useRef<CesiumEntity | null>(null);
  const selectedTargetIdRef = useRef<string | null>(selectedTargetId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shadowMaterialRef = useRef<any>(null);
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
    pointA: { cartesian: any; carto: any; latDeg: number; lonDeg: number; elevMeters: number } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pointB: { cartesian: any; carto: any; latDeg: number; lonDeg: number; elevMeters: number } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hoverCartesian: any | null;
    pointAEntity: CesiumEntity | null;
    pointBEntity: CesiumEntity | null;
    previewLineEntity: CesiumEntity | null;
    lockedLineEntity: CesiumEntity | null;
  }>({
    pointA: null,
    pointB: null,
    hoverCartesian: null,
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

  const mapStyleRef = useRef<MapStyleMode>(mapStyle);
  const telemetryModeRef = useRef<TelemetryMode>(telemetryMode);
  const weatherEnabledRef = useRef<boolean>(weatherEnabled);
  const measureModeRef = useRef<boolean>(measureMode);
  const routeModeRef = useRef<boolean>(routeMode);
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

  const [webglError, setWebglError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);

  mapStyleRef.current = mapStyle;
  telemetryModeRef.current = telemetryMode;
  weatherEnabledRef.current = weatherEnabled;
  measureModeRef.current = measureMode;
  routeModeRef.current = routeMode;
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
      destination: Cesium.Cartesian3.fromDegrees(65.0, 12.0, 9200000, marsEllipsoid),
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
          marsEllipsoid.cartesianToCartographic(viewer.camera.positionWC)?.height ?? 9200000
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
        const speedFactorPerSec = 0.85 * CAMERA_INPUT_SENSITIVITY_MULTIPLIER;
        const rawDelta = Math.max(20, cameraHeight * speedFactorPerSec * dtSec);

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
    const step = Math.max(15, cameraHeight * 0.06 * CAMERA_INPUT_SENSITIVITY_MULTIPLIER);
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

    viewerRef.current = viewer;

    viewer.imageryLayers.removeAll(true);

    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
      Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
    );

    const controller = viewer.scene.screenSpaceCameraController;
    controller.enableCollisionDetection = false;
    controller.minimumZoomDistance = MIN_CAMERA_HEIGHT_METERS;
    controller.maximumZoomDistance = MAX_CAMERA_HEIGHT_METERS;
    controller.enableZoom = true;
    controller.enableRotate = true;
    controller.enableTilt = true;
    controller.enableTranslate = true;
    controller.zoomFactor = 5.0 * CAMERA_INPUT_SENSITIVITY_MULTIPLIER;
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

    // Google Earth-inspired Martian limb atmosphere: thin yellowish halo visible along the sunlit edge
    // while allowing the shadowed hemisphere to blend cleanly into black space.
    viewer.scene.backgroundColor = Cesium.Color.BLACK;
    viewer.scene.highDynamicRange = false;
    const marsSkyAtmosphere = new Cesium.SkyAtmosphere(marsEllipsoid);
    marsSkyAtmosphere.show = true;
    marsSkyAtmosphere.hueShift = -0.46;
    marsSkyAtmosphere.saturationShift = 0.25;
    marsSkyAtmosphere.brightnessShift = -0.32;
    marsSkyAtmosphere.atmosphereRayleighScaleHeight = 4400;
    marsSkyAtmosphere.atmosphereMieScaleHeight = 1800;
    marsSkyAtmosphere.atmosphereLightIntensity = 18.0;
    marsSkyAtmosphere.perFragmentAtmosphere = true;
    viewer.scene.skyAtmosphere = marsSkyAtmosphere;

    viewer.scene.globe.baseColor = Cesium.Color.BLACK;
    viewer.scene.globe.preloadSiblings = true;
    viewer.scene.globe.preloadAncestors = true;
    viewer.scene.globe.tileCacheSize = 800;
    viewer.scene.globe.maximumScreenSpaceError = 1.35;
    viewer.scene.verticalExaggeration = MARS_TERRAIN_VERTICAL_EXAGGERATION;
    const initialShadowEnabled = sunShadowEnabledRef.current && mapStyleRef.current === 'optical';
    viewer.scene.globe.enableLighting = initialShadowEnabled;
    viewer.scene.globe.dynamicAtmosphereLighting = initialShadowEnabled;
    viewer.scene.globe.dynamicAtmosphereLightingFromSun = false;
    viewer.scene.globe.showGroundAtmosphere = false;
    if (viewer.scene.fog) {
      viewer.scene.fog.enabled = false;
    }
    viewer.scene.globe.lightingFadeOutDistance = 4_200_000;
    viewer.scene.globe.lightingFadeInDistance = 5_900_000;
    viewer.scene.globe.atmosphereLightIntensity = 6.0;
    viewer.scene.globe.atmosphereHueShift = -0.46;
    viewer.scene.globe.atmosphereSaturationShift = 0.25;
    viewer.scene.globe.atmosphereBrightnessShift = -0.34;
    viewer.scene.globe.atmosphereRayleighScaleHeight = 4400;
    viewer.scene.globe.atmosphereMieScaleHeight = 1800;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.light = new Cesium.DirectionalLight({
      direction: new Cesium.Cartesian3(-0.66, -0.42, -0.623),
      color: Cesium.Color.fromCssColorString('#fff6eb'),
      intensity: 2.35,
    });
    (viewer.scene.globe as any).lambertDiffuseMultiplier = 0.96;

    // Camera-locked planetary shadow: pure pitch-black (#000000) origin on the shadowed crescent
    // fading smoothly out across Mars toward the sunlit hemisphere (Optical mode only).
    const marsShadowMaterial = new Cesium.Material({
      fabric: {
        type: 'MarsCameraTwilightShadow',
        uniforms: {
          shadowStrength: initialShadowEnabled ? 1.0 : 0.0,
          lightDirEC: new Cesium.Cartesian3(0.66, 0.42, 0.623),
        },
        source: `
          uniform float shadowStrength;
          uniform vec3 lightDirEC;
          czm_material czm_getMaterial(czm_materialInput materialInput) {
            czm_material material = czm_getDefaultMaterial(materialInput);
            vec3 n = normalize(materialInput.normalEC);
            vec3 l = normalize(lightDirEC);
            float ndotl = dot(n, l);
            // Smooth twilight ramp: 0 = deep night, 1 = full daylight, faded gradually across
            // a soft terminator band so there is never a hard day/night edge.
            float daylight = smoothstep(-0.08, 0.34, ndotl);
            // Grazing limb stays marginally darker so the shadowed crescent melts into deep space.
            float limbSoft = mix(0.82, 1.0, smoothstep(0.02, 0.30, max(n.z, 0.0)));
            float lit = daylight * limbSoft;
            // Night side is drawn fully black with zero ambient washout (alpha reaches 1.0 on
            // the unlit hemisphere, so no atmosphere/ambient tint leaks through).
            float darkness = (1.0 - lit) * clamp(shadowStrength, 0.0, 1.0);
            material.diffuse = vec3(0.0, 0.0, 0.0);
            material.emission = vec3(0.0, 0.0, 0.0);
            material.specular = 0.0;
            material.alpha = clamp(darkness, 0.0, 1.0);
            return material;
          }
        `,
      },
      translucent: true,
    });
    viewer.scene.globe.material = marsShadowMaterial;
    shadowMaterialRef.current = marsShadowMaterial;

    viewer.scene.sun = new Cesium.Sun();
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
    opticalLayer.contrast = 1.08;
    opticalLayer.brightness = 1.0;
    opticalLayer.saturation = 1.15;
    opticalLayer.gamma = 1.0;
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
    ctxLayer.contrast = 1.12;
    ctxLayer.brightness = 1.0;
    ctxLayer.gamma = 1.0;
    ctxLayerRef.current = ctxLayer;

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

    // 4. Multi-Resolution Seasonal Temperature Pyramid (Levels 0-12, bilinear NASA MGS TES)
    const temperatureProvider = createMarsProceduralImageryProvider({
      Cesium,
      tilingScheme: marsTilingScheme,
      mode: 'temperature',
      solarLongitudeLs: temperatureLs,
      maximumLevel: 12,
    });
    const temperatureLayer = viewer.imageryLayers.addImageryProvider(temperatureProvider);
    configureLayerFiltering(temperatureLayer);
    temperatureLayer.show = false;
    temperatureLayer.alpha = 0.85;
    temperatureLayer.contrast = 1.12;
    temperatureLayerRef.current = temperatureLayer;
    loadedTemperatureLsRef.current = temperatureLs;

    // 5. Multi-Resolution Surface Radiation Pyramid (Levels 0-12, MSL RAD calibrated)
    const radiationProvider = createMarsProceduralImageryProvider({
      Cesium,
      tilingScheme: marsTilingScheme,
      mode: 'radiation',
      maximumLevel: 12,
    });
    const radiationLayer = viewer.imageryLayers.addImageryProvider(radiationProvider);
    configureLayerFiltering(radiationLayer);
    radiationLayer.show = false;
    radiationLayer.alpha = 0.88;
    radiationLayer.contrast = 1.45;
    radiationLayerRef.current = radiationLayer;

    // 6. Multi-Resolution Grayscale Elevation Pyramid (Levels 0-12, crisp below 40 km)
    const elevationProvider = createMarsProceduralImageryProvider({
      Cesium,
      tilingScheme: marsTilingScheme,
      mode: 'elevation',
      maximumLevel: 12,
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
            target.category === 'satellite' ? 8_500_000 : 4_800_000
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

    // Geodesic Measure Tool Entities (Minimal 7px Yellow Dots Only + Live Dashed / Locked Solid Geodesic Line)
    const ms = measureStateRef.current;
    ms.pointAEntity = viewer.entities.add({
      id: '__measure-point-a',
      show: false,
      position: new Cesium.CallbackProperty(
        () =>
          ms.pointA
            ? getExaggeratedSurfacePosition(
                ms.pointA.latDeg,
                ms.pointA.lonDeg,
                ms.pointA.elevMeters,
                40
              )
            : Cesium.Cartesian3.fromDegrees(0, 0, 0, marsEllipsoid),
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
        () =>
          ms.pointB
            ? getExaggeratedSurfacePosition(
                ms.pointB.latDeg,
                ms.pointB.lonDeg,
                ms.pointB.elevMeters,
                40
              )
            : Cesium.Cartesian3.fromDegrees(0, 0, 0, marsEllipsoid),
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
          if (ms.pointA && ms.hoverCartesian) {
            const hoverCartographic = marsEllipsoid.cartesianToCartographic(ms.hoverCartesian);
            if (!hoverCartographic) return [];
            const hoverLat = Cesium.Math.toDegrees(hoverCartographic.latitude);
            const hoverLon = Cesium.Math.toDegrees(hoverCartographic.longitude);
            const hoverElevation = getMarsElevation(hoverLat, hoverLon, 4);
            return [
              getExaggeratedSurfacePosition(
                ms.pointA.latDeg,
                ms.pointA.lonDeg,
                ms.pointA.elevMeters,
                40
              ),
              getExaggeratedSurfacePosition(hoverLat, hoverLon, hoverElevation, 40),
            ];
          }
          return [];
        }, false),
        width: 3,
        arcType: Cesium.ArcType.GEODESIC,
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
        positions: new Cesium.CallbackProperty(
          () =>
            ms.pointA && ms.pointB
              ? [
                  getExaggeratedSurfacePosition(
                    ms.pointA.latDeg,
                    ms.pointA.lonDeg,
                    ms.pointA.elevMeters,
                    40
                  ),
                  getExaggeratedSurfacePosition(
                    ms.pointB.latDeg,
                    ms.pointB.lonDeg,
                    ms.pointB.elevMeters,
                    40
                  ),
                ]
              : [],
          false
        ),
        width: 3.5,
        arcType: Cesium.ArcType.GEODESIC,
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
                180
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
                180
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

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(65.0, 12.0, 9200000, marsEllipsoid),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
    });

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

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
      const elevMeters = getMarsElevation(latDeg, lonDeg, 4);
      const cartesian = getExaggeratedSurfacePosition(latDeg, lonDeg, elevMeters, 40);
      return { cartesian, carto, latDeg, lonDeg, elevMeters };
    };

    // Real-time cursor coordinates + live measure preview
    handler.setInputAction((movement: { endPosition: { x: number; y: number } }) => {
      lastCursorPositionRef.current = movement.endPosition;
      const pt = pickMarsSurfacePoint(movement.endPosition);
      if (!pt) {
        onCursorTelemetryChangeRef.current(null);
        if (measureModeRef.current && ms.pointA && !ms.pointB) {
          ms.hoverCartesian = null;
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
        const geodesic = new Cesium.EllipsoidGeodesic(ms.pointA.carto, pt.carto, marsEllipsoid);
        onMeasureLivePreviewChangeRef.current({
          distanceMeters: geodesic.surfaceDistance,
          x: movement.endPosition.x,
          y: movement.endPosition.y,
        });
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
        entityId.startsWith('__mars-region-')
      ) return undefined;
      const normalizedId = entityId.replace(/-(spacecraft|rover)$/, '');
      const found = MARS_TARGETS.find((t) => t.id === normalizedId);
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

      if (rs.directLineEntity) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const poly = rs.directLineEntity.polyline as any;
        if (poly) {
          const samples = result.directArcPoints.map((pt) => ({
            latDeg: pt.latDeg,
            lonDeg: pt.lonDeg,
            elevationMeters: getMarsElevation(pt.latDeg, pt.lonDeg, 4),
          }));
          poly.positions = new Cesium.CallbackProperty(
            () => getTerrainPositions(samples, 60),
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
            elevationMeters: getMarsElevation(waypoint.latDeg, waypoint.lonDeg, 4),
          }));
          poly.positions = new Cesium.CallbackProperty(
            () => getTerrainPositions(samples, 80),
            false
          );
        }
        rs.optimalLineEntity.show = true;
      }

      // Pulsing highlight rings around encountered Rovers (orange) & Satellite Relay corridors (cyan)
      result.roverEncounters.forEach((enc, idx) => {
        const ringSamples = createTerrainRingSamples(
          enc.target.latitude,
          enc.target.longitude,
          120
        );
        const baseColor = Cesium.Color.fromCssColorString('#FF6B35');
        const ringEntity = viewer.entities.add({
          id: `__route-pulse-rover-${idx}`,
          polyline: {
            positions: new Cesium.CallbackProperty(
              () => getTerrainPositions(ringSamples, 70),
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
        const ringSamples = createTerrainRingSamples(sat.crossLatDeg, sat.crossLonDeg, 85);
        const baseColor = Cesium.Color.fromCssColorString('#22D3EE');
        const ringEntity = viewer.entities.add({
          id: `__route-pulse-sat-${idx}`,
          polyline: {
            positions: new Cesium.CallbackProperty(
              () => getTerrainPositions(ringSamples, 70),
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
                4
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
          ms.pointA = pt;
          ms.pointB = null;
          ms.hoverCartesian = pt.cartesian;
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
          // 2nd click: place Point B & lock solid geodesic line
          ms.pointB = pt;
          ms.hoverCartesian = null;
          if (ms.pointBEntity) {
            ms.pointBEntity.show = true;
          }
          if (ms.previewLineEntity) ms.previewLineEntity.show = false;
          if (ms.lockedLineEntity) {
            ms.lockedLineEntity.show = true;
          }

          const geodesic = new Cesium.EllipsoidGeodesic(ms.pointA.carto, pt.carto, marsEllipsoid);
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
            surfaceDistanceMeters: geodesic.surfaceDistance,
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
      if (measureModeRef.current || routeModeRef.current) return;
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

    const updateCameraDaylight = () => {
      if (viewer.isDestroyed()) return;

      if (!sunShadowEnabledRef.current || mapStyleRef.current !== 'optical') {
        if (shadowMaterialRef.current?.uniforms) {
          shadowMaterialRef.current.uniforms.shadowStrength = 0.0;
        }
        return;
      }

      // Full-strength night shading at every altitude so the unlit hemisphere stays pure black
      // (no ambient washout) whether viewing from orbit or close to the surface.
      if (shadowMaterialRef.current?.uniforms) {
        shadowMaterialRef.current.uniforms.shadowStrength = 1.0;
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

            pin.show = isFront;

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
            pin.show = occluder.isPointVisible(surfacePoint);
          }
        }
      }
    });

    // postRender: Progressive MRO CTX fade, atmospheric limb scale, compass heading, camera scale, and cursor telemetry
    let lastHeading = 0;
    let lastCameraTelemetryAt = 0;

    let lastCursorPickAt = 0;
    let hasCursorCameraBaseline = false;
    let lastGroundScaleAt = 0;
    let sampledMetersPerPixel = 0;
    const lastCursorCameraPosition = new Cesium.Cartesian3();
    const lastCursorCameraDirection = new Cesium.Cartesian3();

    const removePostRender = viewer.scene.postRender.addEventListener(() => {
      if (viewer.isDestroyed()) return;

      const now = performance.now();
      const camCarto = marsEllipsoid.cartesianToCartographic(viewer.camera.positionWC);
      const camHeight = camCarto ? camCarto.height : 9200000;
      const ctxOpacity = getCtxFadeAlpha(camHeight);
      if (ctxLayerRef.current) {
        ctxLayerRef.current.alpha = ctxOpacity;
        ctxLayerRef.current.show = mapStyleRef.current === 'optical' && ctxOpacity > 0.003;
      }

      const currentHeading = viewer.camera.heading;
      if (Math.abs(currentHeading - lastHeading) > 0.003) {
        lastHeading = currentHeading;
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
          const cameraLatDeg = Cesium.Math.toDegrees(cameraCarto.latitude);
          const cameraLonDeg = Cesium.Math.toDegrees(cameraCarto.longitude);
          const localTerrainHeight =
            getMarsElevation(cameraLatDeg, cameraLonDeg, 4) * MARS_TERRAIN_VERTICAL_EXAGGERATION;
          const altitudeAboveSurface = Math.max(0, cameraCarto.height - localTerrainHeight);
          const lowAltBoost = getLowAltitudeAtmosphereBoost(altitudeAboveSurface);
          const skyAtmosphere = viewer.scene.skyAtmosphere;
          if (skyAtmosphere) {
            // Subtle thin yellowish limb visible at all orbital altitudes (>500 km very small),
            // smoothly widening & warming below 500 km as the camera approaches Mars.
            const hueShift = -0.46 - 0.02 * lowAltBoost;
            const saturationShift = 0.26 + 0.06 * lowAltBoost;
            const brightnessShift = -0.26 + 0.20 * lowAltBoost;
            const rayleighScaleHeight = Math.round(4600 + 4800 * lowAltBoost);
            const mieScaleHeight = Math.round(1900 + 1700 * lowAltBoost);
            const lightIntensity = 24.0 + 14.0 * lowAltBoost;
            if (
              Math.abs(skyAtmosphere.hueShift - hueShift) > 0.002 ||
              Math.abs(skyAtmosphere.saturationShift - saturationShift) > 0.002 ||
              Math.abs(skyAtmosphere.brightnessShift - brightnessShift) > 0.002
            ) {
              skyAtmosphere.hueShift = hueShift;
              skyAtmosphere.saturationShift = saturationShift;
              skyAtmosphere.brightnessShift = brightnessShift;
              skyAtmosphere.atmosphereRayleighScaleHeight = rayleighScaleHeight;
              skyAtmosphere.atmosphereMieScaleHeight = mieScaleHeight;
              skyAtmosphere.atmosphereLightIntensity = lightIntensity;
            }
          }

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

      if (now - lastUiSyncTime > 250) {
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

    setIsReady(true);

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
      container.removeEventListener('wheel', handleContainerWheel);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      handler.destroy();
      unbindVikingErr();
      unbindCtxErr();
      unbindShadeErr();
      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
      rebuildGridRef.current = null;
      onCameraTelemetryChangeRef.current(null);
    };
  }, []);

  // Switch between Optical, Temperature (over grayscale relief), Radiation (over darkened Viking), and Grayscale Elevation
  useEffect(() => {
    if (!isReady) return;
    const opticalLayer = vikingLayerRef.current;
    const ctxLayer = ctxLayerRef.current;
    const reliefShadeLayer = reliefShadeLayerRef.current;
    const temperatureLayer = temperatureLayerRef.current;
    const radiationLayer = radiationLayerRef.current;
    const elevationLayer = elevationLayerRef.current;

    if (opticalLayer) {
      if (mapStyle === 'optical') {
        opticalLayer.show = true;
        opticalLayer.contrast = 1.08;
        opticalLayer.brightness = 1.0;
        opticalLayer.saturation = 1.15;
        opticalLayer.gamma = 1.0;
      } else if (mapStyle === 'radiation') {
        opticalLayer.show = true;
        opticalLayer.brightness = 0.30;
        opticalLayer.saturation = 0.15;
        opticalLayer.contrast = 1.25;
        opticalLayer.gamma = 0.90;
      } else {
        opticalLayer.show = false;
      }
    }

    if (ctxLayer) {
      const viewer = viewerRef.current;
      const marsEllipsoid = marsEllipsoidRef.current;
      let camHeight = 9200000;
      if (viewer && !viewer.isDestroyed() && marsEllipsoid) {
        const carto = marsEllipsoid.cartesianToCartographic(viewer.camera.position);
        if (carto) camHeight = carto.height;
      }
      const ctxOpacity = getCtxFadeAlpha(camHeight);
      ctxLayer.alpha = ctxOpacity;
      ctxLayer.show = mapStyle === 'optical' && ctxOpacity > 0.003;
    }

    if (reliefShadeLayer) {
      // Crisp 200m grayscale terrain relief serves as underlying shading for Temperature & Elevation
      reliefShadeLayer.show = mapStyle === 'temperature' || mapStyle === 'elevation';
    }

    if (temperatureLayer) {
      temperatureLayer.show = mapStyle === 'temperature';
    }

    if (radiationLayer) {
      radiationLayer.show = mapStyle === 'radiation';
    }

    if (elevationLayer) {
      elevationLayer.show = mapStyle === 'elevation';
    }
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
      maximumLevel: 12,
    });
    const nextLayer = viewer.imageryLayers.addImageryProvider(provider);
    nextLayer.magnificationFilter = Cesium.TextureMagnificationFilter.LINEAR;
    nextLayer.minificationFilter = Cesium.TextureMinificationFilter.LINEAR;
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
    const effectiveShadow = sunShadowEnabled && mapStyle === 'optical';
    viewer.scene.globe.enableLighting = effectiveShadow;
    viewer.scene.globe.dynamicAtmosphereLighting = effectiveShadow;
    if (shadowMaterialRef.current?.uniforms) {
      shadowMaterialRef.current.uniforms.shadowStrength = effectiveShadow ? 1.0 : 0.0;
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
        style={{ touchAction: 'none', cursor: measureMode || routeMode ? 'crosshair' : 'grab' }}
        className="w-full h-full"
        aria-label="Interactive 3D Mars Globe"
      />

      {!isReady && !webglError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-30">
          <div className="w-9 h-9 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin mb-3" />
          <p className="font-display text-sm tracking-wide text-slate-200">
            Loading NASA Mars Trek Imagery
          </p>
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
