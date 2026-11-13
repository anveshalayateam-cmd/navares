import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  CATEGORY_COLORS,
  MARS_CONSTANTS,
  MARS_TARGETS,
  MarsTarget,
  TelemetryMode,
  sampleMarsElevationMeters,
} from '../data/marsData';
import { MarsWeatherStation } from '../services/marsWeather';
import { CesiumEntity, CesiumImageryLayer, CesiumViewer } from '../types/cesium';
import {
  computeSatelliteCartesian,
  createGlowPinDataUri,
  createRoverSprite,
  createSatelliteSprite,
  sampleSatelliteOrbitArc,
} from '../utils/marsMath';
import {
  generateMarsElevationGrayscaleDataUrl,
  generateMarsRadiationDataUrl,
  generateMarsTemperatureDataUrl,
} from '../utils/marsOverlayMaps';
import { CursorTelemetry } from './CursorTelemetryPill';
import { MapStyleMode } from './MapStyleBar';
import { LiveMeasurePreview, MeasureResult } from './MeasureToolOverlay';
import { ProjectedWeatherBadge } from './WeatherBadges';

export interface LiveSatellitePosition {
  latDeg: number;
  lonDeg: number;
  altKm: number;
}

export interface MarsGlobeHandle {
  zoomToLocation: (lat: number, lon: number, alt?: number) => void;
  zoomToTarget: (target: MarsTarget) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetNorth: () => void;
  resetGlobe: () => void;
  clearMeasurement: () => void;
}

interface MarsGlobeProps {
  selectedTargetId: string | null;
  mapStyle: MapStyleMode;
  telemetryMode: TelemetryMode;
  weatherEnabled: boolean;
  weatherStations: MarsWeatherStation[];
  measureMode: boolean;
  onSelectTarget: (target: MarsTarget | null) => void;
  onHeadingChange: (headingRad: number) => void;
  onLiveSatellitesUpdate: (positions: Record<string, LiveSatellitePosition>) => void;
  onWeatherBadgesUpdate: (badges: ProjectedWeatherBadge[]) => void;
  onCursorTelemetryChange: (telemetry: CursorTelemetry | null) => void;
  onMeasureHasPointAChange: (hasPointA: boolean) => void;
  onMeasureLivePreviewChange: (preview: LiveMeasurePreview | null) => void;
  onMeasureResultChange: (result: MeasureResult | null) => void;
}

export const MarsGlobe = forwardRef<MarsGlobeHandle, MarsGlobeProps>(function MarsGlobe(
  {
    selectedTargetId,
    mapStyle,
    telemetryMode,
    weatherEnabled,
    weatherStations,
    measureMode,
    onSelectTarget,
    onHeadingChange,
    onLiveSatellitesUpdate,
    onWeatherBadgesUpdate,
    onCursorTelemetryChange,
    onMeasureHasPointAChange,
    onMeasureLivePreviewChange,
    onMeasureResultChange,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marsEllipsoidRef = useRef<any>(null);

  const vikingLayerRef = useRef<CesiumImageryLayer | null>(null);
  const ctxLayerRef = useRef<CesiumImageryLayer | null>(null);
  const reliefShadeLayerRef = useRef<CesiumImageryLayer | null>(null);
  const temperatureLayerRef = useRef<CesiumImageryLayer | null>(null);
  const radiationLayerRef = useRef<CesiumImageryLayer | null>(null);
  const elevationLayerRef = useRef<CesiumImageryLayer | null>(null);

  const pinEntitiesRef = useRef<Map<string, CesiumEntity>>(new Map());
  const spacecraftEntitiesRef = useRef<Map<string, CesiumEntity>>(new Map());
  const roverEntitiesRef = useRef<Map<string, CesiumEntity>>(new Map());
  const simSecondsRef = useRef<number>(0);

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

  const mapStyleRef = useRef<MapStyleMode>(mapStyle);
  const telemetryModeRef = useRef<TelemetryMode>(telemetryMode);
  const weatherEnabledRef = useRef<boolean>(weatherEnabled);
  const weatherStationsRef = useRef<MarsWeatherStation[]>(weatherStations);
  const measureModeRef = useRef<boolean>(measureMode);
  const onSelectTargetRef = useRef(onSelectTarget);
  const onHeadingChangeRef = useRef(onHeadingChange);
  const onLiveSatellitesUpdateRef = useRef(onLiveSatellitesUpdate);
  const onWeatherBadgesUpdateRef = useRef(onWeatherBadgesUpdate);
  const onCursorTelemetryChangeRef = useRef(onCursorTelemetryChange);
  const onMeasureHasPointAChangeRef = useRef(onMeasureHasPointAChange);
  const onMeasureLivePreviewChangeRef = useRef(onMeasureLivePreviewChange);
  const onMeasureResultChangeRef = useRef(onMeasureResultChange);

  const [webglError, setWebglError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);

  mapStyleRef.current = mapStyle;
  telemetryModeRef.current = telemetryMode;
  weatherEnabledRef.current = weatherEnabled;
  weatherStationsRef.current = weatherStations;
  measureModeRef.current = measureMode;
  onSelectTargetRef.current = onSelectTarget;
  onHeadingChangeRef.current = onHeadingChange;
  onLiveSatellitesUpdateRef.current = onLiveSatellitesUpdate;
  onWeatherBadgesUpdateRef.current = onWeatherBadgesUpdate;
  onCursorTelemetryChangeRef.current = onCursorTelemetryChange;
  onMeasureHasPointAChangeRef.current = onMeasureHasPointAChange;
  onMeasureLivePreviewChangeRef.current = onMeasureLivePreviewChange;
  onMeasureResultChangeRef.current = onMeasureResultChange;

  const zoomToLocationInternal = (lat: number, lon: number, alt = 15000) => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    const marsEllipsoid = marsEllipsoidRef.current;
    if (!viewer || viewer.isDestroyed() || !Cesium || !marsEllipsoid) return;

    viewer.trackedEntity = undefined;
    viewer.camera.cancelFlight();

    const lookAheadMeters = alt / Math.tan(Cesium.Math.toRadians(65));
    const metersPerDegLat = (Math.PI * MARS_CONSTANTS.EQUATORIAL_RADIUS) / 180;
    const latOffset = lookAheadMeters / metersPerDegLat;
    const cameraLat = Math.max(-88.5, lat - latOffset);

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, cameraLat, alt, marsEllipsoid),
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

      viewer.trackedEntity = undefined;
      viewer.camera.cancelFlight();

      // Aim slightly ahead at 1x speed so the 2s camera flight meets the orbiter cleanly
      const targetTimeSec =
        simSecondsRef.current + (telemetryModeRef.current === 'realtime' ? 1.8 : 0);
      const satNow = computeSatelliteCartesian(target, targetTimeSec);
      const satNext = computeSatelliteCartesian(target, targetTimeSec + 1.0);

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
      // Fly smoothly below 35 km (slant range ~12 km) to reveal the rover directly on the crater floor
      zoomToLocationInternal(target.latitude, target.longitude, 11000);
      return;
    }
    zoomToLocationInternal(target.latitude, target.longitude, 15000);
  };

  const resetGlobeInternal = () => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    const marsEllipsoid = marsEllipsoidRef.current;
    if (!viewer || viewer.isDestroyed() || !Cesium || !marsEllipsoid) return;

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

  const resetNorthInternal = () => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || viewer.isDestroyed() || !Cesium) return;

    viewer.trackedEntity = undefined;
    viewer.camera.cancelFlight();

    viewer.camera.flyTo({
      destination: viewer.camera.position,
      orientation: {
        heading: 0,
        pitch: viewer.camera.pitch,
        roll: 0,
      },
      duration: 0.6,
      endTransform: Cesium.Matrix4.IDENTITY,
    });
  };

  const zoomInInternal = () => {
    const viewer = viewerRef.current;
    const marsEllipsoid = marsEllipsoidRef.current;
    if (!viewer || viewer.isDestroyed() || !marsEllipsoid) return;

    viewer.trackedEntity = undefined;
    viewer.camera.cancelFlight();

    const carto = marsEllipsoid.cartesianToCartographic(viewer.camera.position);
    const cameraHeight = carto ? Math.max(250, carto.height) : 10000;
    const moveStep = Math.min(cameraHeight - 250, cameraHeight * 0.35);
    if (moveStep > 0) {
      viewer.camera.moveForward(moveStep);
    }
  };

  const zoomOutInternal = () => {
    const viewer = viewerRef.current;
    const marsEllipsoid = marsEllipsoidRef.current;
    if (!viewer || viewer.isDestroyed() || !marsEllipsoid) return;

    viewer.trackedEntity = undefined;
    viewer.camera.cancelFlight();

    const carto = marsEllipsoid.cartesianToCartographic(viewer.camera.position);
    const cameraHeight = carto ? Math.max(250, carto.height) : 10000;
    viewer.camera.moveBackward(Math.max(150, cameraHeight * 0.35));
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

  useImperativeHandle(ref, () => ({
    zoomToLocation: zoomToLocationInternal,
    zoomToTarget: zoomToTargetInternal,
    zoomIn: zoomInInternal,
    zoomOut: zoomOutInternal,
    resetNorth: resetNorthInternal,
    resetGlobe: resetGlobeInternal,
    clearMeasurement: clearMeasurementInternal,
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

    let viewer: CesiumViewer;
    try {
      viewer = new Cesium.Viewer(container, {
        globe: new Cesium.Globe(marsEllipsoid),
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
    controller.minimumZoomDistance = 250;
    controller.maximumZoomDistance = 32000000;
    controller.enableZoom = true;
    controller.enableRotate = true;
    controller.enableTilt = true;
    controller.enableTranslate = true;
    controller.zoomFactor = 3.5;
    controller.zoomEventTypes = [
      Cesium.CameraEventType.WHEEL,
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

    // Dusty Martian amber atmosphere with reduced milky haze
    viewer.scene.backgroundColor = Cesium.Color.BLACK;
    viewer.scene.highDynamicRange = false;
    viewer.scene.skyAtmosphere = new Cesium.SkyAtmosphere(marsEllipsoid);
    viewer.scene.skyAtmosphere.hueShift = -0.50;
    viewer.scene.skyAtmosphere.saturationShift = 0.2;
    viewer.scene.skyAtmosphere.brightnessShift = -0.35;

    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#140a07');
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.showGroundAtmosphere = false;
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.sun = new Cesium.Sun();
    viewer.scene.moon = undefined;

    // 1. Optical Base Layer: Viking Color Mosaic 232m (natural soft contrast)
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
    opticalLayer.show = true;
    opticalLayer.contrast = 1.08;
    opticalLayer.brightness = 0.96;
    opticalLayer.saturation = 1.15;
    opticalLayer.gamma = 1.0;
    vikingLayerRef.current = opticalLayer;

    // 2. High-Res MRO CTX Overlay: Subtle 22% texture detail < 350 km in Optical mode
    const ctxProvider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/{z}/{y}/{x}',
      tilingScheme: marsTilingScheme,
      tileWidth: 512,
      tileHeight: 512,
      minimumLevel: 4,
      maximumLevel: 11,
    });
    const unbindCtxErr = ctxProvider.errorEvent.addEventListener((e: { retry?: boolean }) => {
      if (e) e.retry = false;
    });
    const ctxLayer = viewer.imageryLayers.addImageryProvider(ctxProvider);
    ctxLayer.show = false;
    ctxLayer.alpha = 0.22;
    ctxLayer.contrast = 1.0;
    ctxLayer.brightness = 1.0;
    ctxLayer.gamma = 1.0;
    ctxLayerRef.current = ctxLayer;

    // 3. Grayscale MOLA/HRSC Terrain Relief Base (used beneath Temperature & Grayscale Elevation modes)
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
    reliefShadeLayer.show = false;
    reliefShadeLayer.saturation = 0.0;
    reliefShadeLayer.contrast = 1.45;
    reliefShadeLayer.brightness = 0.95;
    reliefShadeLayer.gamma = 0.9;
    reliefShadeLayerRef.current = reliefShadeLayer;

    // 4. Global Temperature Map (Rainbow Thermal Scale 2048x1024, alpha = 0.85 over grayscale terrain relief)
    const temperatureDataUrl = generateMarsTemperatureDataUrl(2048, 1024);
    const temperatureProvider = new Cesium.SingleTileImageryProvider({
      url: temperatureDataUrl,
      rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
      ellipsoid: marsEllipsoid,
      tileWidth: 2048,
      tileHeight: 1024,
    });
    const temperatureLayer = viewer.imageryLayers.addImageryProvider(temperatureProvider);
    temperatureLayer.show = false;
    temperatureLayer.alpha = 0.85;
    temperatureLayer.contrast = 1.12;
    temperatureLayerRef.current = temperatureLayer;

    // 5. Surface Radiation Layer (MSL RAD Black-to-Neon-Green 2048x1024, alpha = 0.88 over darkened base)
    const radiationDataUrl = generateMarsRadiationDataUrl(2048, 1024);
    const radiationProvider = new Cesium.SingleTileImageryProvider({
      url: radiationDataUrl,
      rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
      ellipsoid: marsEllipsoid,
      tileWidth: 2048,
      tileHeight: 1024,
    });
    const radiationLayer = viewer.imageryLayers.addImageryProvider(radiationProvider);
    radiationLayer.show = false;
    radiationLayer.alpha = 0.88;
    radiationLayer.contrast = 1.45;
    radiationLayerRef.current = radiationLayer;

    // 6. Grayscale Elevation Hypsometry (Black = Lowest -8 km, Mid Gray = 0 km, White = Highest +21 km)
    const elevationGrayscaleUrl = generateMarsElevationGrayscaleDataUrl(2048, 1024);
    const elevationProvider = new Cesium.SingleTileImageryProvider({
      url: elevationGrayscaleUrl,
      rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
      ellipsoid: marsEllipsoid,
      tileWidth: 2048,
      tileHeight: 1024,
    });
    const elevationLayer = viewer.imageryLayers.addImageryProvider(elevationProvider);
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
    const farLabelOffset = new Cesium.Cartesian2(0, -10);
    const closeLabelOffset = new Cesium.Cartesian2(0, 78);
    const roverCloseLabelOffset = new Cesium.Cartesian2(0, 48);

    for (const target of MARS_TARGETS) {
      const colorHex = CATEGORY_COLORS[target.category];
      const cesiumColor = Cesium.Color.fromCssColorString(colorHex);

      if (target.category === 'satellite' && target.orbit) {
        const positionProperty = new Cesium.CallbackProperty(() => {
          const pos = computeSatelliteCartesian(target, simSecondsRef.current);
          return new Cesium.Cartesian3(pos.x, pos.y, pos.z);
        }, false);

        const satPin = viewer.entities.add({
          id: target.id,
          name: target.name,
          position: positionProperty,
          billboard: {
            image: createGlowPinDataUri(colorHex, 'satellite', false),
            scale: 0.5,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            eyeOffset: pinEyeOffset,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: target.shortName,
            font: '600 12px "Chakra Petch", sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#05070B'),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: farLabelOffset,
            eyeOffset: pinEyeOffset,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
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

        const ringPts = sampleSatelliteOrbitArc(target, 0, 360, 128, false).map(
          (p) => new Cesium.Cartesian3(p.x, p.y, p.z)
        );
        viewer.entities.add({
          id: `${target.id}-orbit-ring`,
          polyline: {
            positions: ringPts,
            width: 1.25,
            material: cesiumColor.withAlpha(0.22),
          },
        });

        const wakePositions = new Cesium.CallbackProperty(() => {
          return sampleSatelliteOrbitArc(target, simSecondsRef.current, 100, 40, true).map(
            (p) => new Cesium.Cartesian3(p.x, p.y, p.z)
          );
        }, false);
        viewer.entities.add({
          id: `${target.id}-orbit-wake`,
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
      } else if (target.category === 'rover') {
        // Rovers show compact orange badge (>35 km) and reveal surface rover sprite (<=35 km)
        const roverSurfacePos = Cesium.Cartesian3.fromDegrees(
          target.longitude,
          target.latitude,
          0,
          marsEllipsoid
        );
        roverPositions.set(target.id, roverSurfacePos);

        const roverPin = viewer.entities.add({
          id: target.id,
          name: target.name,
          position: roverSurfacePos,
          billboard: {
            image: createGlowPinDataUri(colorHex, 'rover', false),
            scale: 0.5,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            eyeOffset: pinEyeOffset,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: target.shortName,
            font: '600 12px "Chakra Petch", sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#05070B'),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: farLabelOffset,
            eyeOffset: pinEyeOffset,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
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
        surfaceHorizonPoints.set(
          target.id,
          Cesium.Cartesian3.fromDegrees(target.longitude, target.latitude, 0, marsEllipsoid)
        );

        const surfacePin = viewer.entities.add({
          id: target.id,
          name: target.name,
          position: Cesium.Cartesian3.fromDegrees(
            target.longitude,
            target.latitude,
            3000,
            marsEllipsoid
          ),
          billboard: {
            image: createGlowPinDataUri(colorHex, target.category, false),
            scale: 0.5,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            eyeOffset: pinEyeOffset,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: target.shortName,
            font: '600 12px "Chakra Petch", sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#05070B'),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: farLabelOffset,
            eyeOffset: pinEyeOffset,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
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
      position: Cesium.Cartesian3.fromDegrees(0, 0, 0, marsEllipsoid),
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
      position: Cesium.Cartesian3.fromDegrees(0, 0, 0, marsEllipsoid),
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
            return [ms.pointA.cartesian, ms.hoverCartesian];
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
        positions: [],
        width: 3.5,
        arcType: Cesium.ArcType.GEODESIC,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.25,
          color: Cesium.Color.fromCssColorString('#22D3EE'),
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
      const pickedCartesian = viewer.camera.pickEllipsoid(screenPos, marsEllipsoid);
      if (!pickedCartesian) return null;
      const carto = marsEllipsoid.cartesianToCartographic(pickedCartesian);
      if (!carto) return null;
      const latDeg = Cesium.Math.toDegrees(carto.latitude);
      const lonDeg = Cesium.Math.toDegrees(carto.longitude);
      const elevMeters = sampleMarsElevationMeters(lonDeg, latDeg);
      return { cartesian: pickedCartesian, carto, latDeg, lonDeg, elevMeters };
    };

    // Real-time cursor coordinates + live measure preview
    handler.setInputAction((movement: { endPosition: { x: number; y: number } }) => {
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
      if (entityId.startsWith('__measure-')) return undefined;
      const normalizedId = entityId.replace(/-(spacecraft|rover)$/, '');
      return MARS_TARGETS.find((t) => t.id === normalizedId);
    };

    handler.setInputAction((click: { position: { x: number; y: number } }) => {
      const searchInput = document.getElementById('searchInput');
      if (searchInput && document.activeElement === searchInput) {
        searchInput.blur();
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (ms.pointAEntity as any).position = pt.cartesian;
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (ms.pointBEntity as any).position = pt.cartesian;
            ms.pointBEntity.show = true;
          }
          if (ms.previewLineEntity) ms.previewLineEntity.show = false;
          if (ms.lockedLineEntity) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const poly = ms.lockedLineEntity.polyline as any;
            if (poly) {
              poly.positions = [ms.pointA.cartesian, pt.cartesian];
            }
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
        const matched = resolvePickedTarget(picked.id.id);
        if (matched) {
          onSelectTargetRef.current(matched);
          return;
        }
      }
      onSelectTargetRef.current(null);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((doubleClick: { position: unknown }) => {
      if (measureModeRef.current) return;
      const picked = viewer.scene.pick(doubleClick.position);
      if (picked?.id) {
        const matched = resolvePickedTarget(picked.id.id);
        if (matched) {
          onSelectTargetRef.current(matched);
          zoomToTargetInternal(matched);
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    // preRender: Horizon-Occlusion Check + Satellite Badge <-> Spacecraft LOD + Rover Badge <-> Surface Sprite LOD
    const removePreRender = viewer.scene.preRender.addEventListener(() => {
      if (viewer.isDestroyed()) return;
      const occluder = new Cesium.EllipsoidalOccluder(marsEllipsoid, viewer.camera.positionWC);

      for (const target of MARS_TARGETS) {
        const pin = pinMap.get(target.id);
        if (!pin) continue;

        if (target.category === 'satellite') {
          const satPosition = pin.position?.getValue
            ? pin.position.getValue(viewer.clock.currentTime)
            : undefined;
          if (satPosition) {
            const isFront = occluder.isPointVisible(satPosition);
            const distMeters = Cesium.Cartesian3.distance(viewer.camera.positionWC, satPosition);
            const isCloseUp = distMeters <= 120000;

            pin.show = isFront;

            const spacecraftEntity = spacecraftMap.get(target.id);
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
          const roverPosition = roverPositions.get(target.id);
          if (roverPosition) {
            const isFront = occluder.isPointVisible(roverPosition);
            const distMeters = Cesium.Cartesian3.distance(viewer.camera.positionWC, roverPosition);
            const isCloseUp = distMeters <= 35000;

            pin.show = isFront;

            const roverSpriteEntity = roverMap.get(target.id);
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
          const surfacePoint = surfaceHorizonPoints.get(target.id);
          if (surfacePoint) {
            pin.show = occluder.isPointVisible(surfacePoint);
          }
        }
      }
    });

    // postRender: Dynamic MRO CTX Overlay, Compass Heading & Weather Badges
    let lastHeading = 0;
    let lastBadgeSignature = '';

    const removePostRender = viewer.scene.postRender.addEventListener(() => {
      if (viewer.isDestroyed()) return;

      const occluder = new Cesium.EllipsoidalOccluder(marsEllipsoid, viewer.camera.positionWC);

      const camCarto = marsEllipsoid.cartesianToCartographic(viewer.camera.position);
      const camHeight = camCarto ? camCarto.height : 9200000;
      const shouldShowCtx = mapStyleRef.current === 'optical' && camHeight < 350000;
      if (ctxLayerRef.current && ctxLayerRef.current.show !== shouldShowCtx) {
        ctxLayerRef.current.show = shouldShowCtx;
      }

      const currentHeading = viewer.camera.heading;
      if (Math.abs(currentHeading - lastHeading) > 0.015) {
        lastHeading = currentHeading;
        onHeadingChangeRef.current(currentHeading);
      }

      if (weatherEnabledRef.current && weatherStationsRef.current.length > 0) {
        const projected: ProjectedWeatherBadge[] = [];

        for (const station of weatherStationsRef.current) {
          const worldPos = Cesium.Cartesian3.fromDegrees(
            station.longitude,
            station.latitude,
            1500,
            marsEllipsoid
          );
          const isFront = occluder.isPointVisible(worldPos);
          if (isFront) {
            const winPos = Cesium.SceneTransforms.worldToWindowCoordinates(
              viewer.scene,
              worldPos
            );
            if (winPos && Number.isFinite(winPos.x) && Number.isFinite(winPos.y)) {
              projected.push({
                station,
                x: winPos.x,
                y: winPos.y,
                visible: true,
              });
              continue;
            }
          }
          projected.push({ station, x: -999, y: -999, visible: false });
        }

        const sig = projected
          .map((p) => `${p.visible ? 1 : 0}:${Math.round(p.x)},${Math.round(p.y)}`)
          .join('|');
        if (sig !== lastBadgeSignature) {
          lastBadgeSignature = sig;
          onWeatherBadgesUpdateRef.current(projected);
        }
      } else if (lastBadgeSignature !== '') {
        lastBadgeSignature = '';
        onWeatherBadgesUpdateRef.current([]);
      }
    });

    const canvas = viewer.scene.canvas;
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL context lost. Attempting recovery...');
    };
    const handleContextRestored = () => {
      setWebglError(null);
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    let rafId = 0;
    let lastFrameTime = performance.now();
    let lastUiSyncTime = 0;

    const tickOrbit = (now: number) => {
      const dtSec = Math.min(0.1, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      const multiplier = telemetryModeRef.current === 'simulation100x' ? 100 : 1;
      simSecondsRef.current += dtSec * multiplier;

      if (now - lastUiSyncTime > 250) {
        lastUiSyncTime = now;
        const satUpdates: Record<string, LiveSatellitePosition> = {};
        for (const target of MARS_TARGETS) {
          if (target.category === 'satellite' && target.orbit) {
            const pos = computeSatelliteCartesian(target, simSecondsRef.current);
            satUpdates[target.id] = {
              latDeg: pos.latDeg,
              lonDeg: pos.lonDeg,
              altKm: pos.altKm,
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
      cancelAnimationFrame(rafId);
      removePreRender();
      removePostRender();
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      handler.destroy();
      unbindVikingErr();
      unbindCtxErr();
      unbindShadeErr();
      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
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
        opticalLayer.brightness = 0.96;
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
      ctxLayer.show = mapStyle === 'optical' && camHeight < 350000;
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
    if (!weatherEnabled) {
      onWeatherBadgesUpdateRef.current([]);
    }
  }, [weatherEnabled]);

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

  return (
    <div className="relative w-full h-full bg-black">
      <div
        id="cesiumContainer"
        ref={containerRef}
        style={{ touchAction: 'none', cursor: measureMode ? 'crosshair' : 'grab' }}
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
