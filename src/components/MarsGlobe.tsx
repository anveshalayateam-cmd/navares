import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  CATEGORY_COLORS,
  HAZARD_ZONES,
  MARS_CONSTANTS,
  MARS_TARGETS,
  MapLayerState,
  MarsTarget,
  TargetCategory,
  TelemetryMode,
  sampleMarsElevationMeters,
} from '../data/marsData';
import { CesiumEntity, CesiumImageryLayer, CesiumViewer } from '../types/cesium';
import {
  computeSatelliteCartesian,
  createGlowPinDataUri,
  sampleSatelliteOrbitArc,
} from '../utils/marsMath';

export interface CursorTelemetry {
  latitude: number | null;
  longitude: number | null;
  elevationMeters: number | null;
  cameraAltitudeKm: number;
}

export interface LiveSatellitePosition {
  latDeg: number;
  lonDeg: number;
  altKm: number;
}

export interface MarsGlobeHandle {
  flyToTarget: (target: MarsTarget) => void;
  resetOrbitView: () => void;
}

interface MarsGlobeProps {
  selectedTargetId: string | null;
  visibleCategories: Record<TargetCategory, boolean>;
  layers: MapLayerState;
  telemetryMode: TelemetryMode;
  onSelectTarget: (target: MarsTarget | null) => void;
  onCursorTelemetry: (telemetry: CursorTelemetry) => void;
  onLiveSatellitesUpdate: (positions: Record<string, LiveSatellitePosition>) => void;
  onTileWarning: (message: string | null) => void;
}

function createSlopeHazardRampCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Slope ramp from 0 deg (flat, transparent) to 90 deg (steep cliffs, crimson-amber)
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0.0, 'rgba(0, 0, 0, 0.0)');
    grad.addColorStop(0.12, 'rgba(0, 0, 0, 0.0)');
    grad.addColorStop(0.22, 'rgba(245, 158, 11, 0.35)');
    grad.addColorStop(0.38, 'rgba(249, 115, 22, 0.60)');
    grad.addColorStop(0.65, 'rgba(239, 68, 68, 0.80)');
    grad.addColorStop(1.0, 'rgba(220, 38, 38, 0.90)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 1);
  }
  return canvas;
}

export const MarsGlobe = forwardRef<MarsGlobeHandle, MarsGlobeProps>(function MarsGlobe(
  {
    selectedTargetId,
    visibleCategories,
    layers,
    telemetryMode,
    onSelectTarget,
    onCursorTelemetry,
    onLiveSatellitesUpdate,
    onTileWarning,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marsEllipsoidRef = useRef<any>(null);

  const baseLayerRef = useRef<CesiumImageryLayer | null>(null);
  const molaLayerRef = useRef<CesiumImageryLayer | null>(null);

  const pinEntitiesRef = useRef<Map<string, CesiumEntity>>(new Map());
  const traverseEntitiesRef = useRef<Map<string, CesiumEntity>>(new Map());
  const orbitEntitiesRef = useRef<Map<string, CesiumEntity[]>>(new Map());
  const hazardEntitiesRef = useRef<CesiumEntity[]>([]);

  // Simulation time tracker (seconds) advanced via requestAnimationFrame
  const simSecondsRef = useRef<number>(0);
  const telemetryModeRef = useRef<TelemetryMode>(telemetryMode);
  const onSelectTargetRef = useRef(onSelectTarget);
  const onCursorTelemetryRef = useRef(onCursorTelemetry);
  const onLiveSatellitesUpdateRef = useRef(onLiveSatellitesUpdate);
  const onTileWarningRef = useRef(onTileWarning);

  const [webglError, setWebglError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);

  telemetryModeRef.current = telemetryMode;
  onSelectTargetRef.current = onSelectTarget;
  onCursorTelemetryRef.current = onCursorTelemetry;
  onLiveSatellitesUpdateRef.current = onLiveSatellitesUpdate;
  onTileWarningRef.current = onTileWarning;

  const flyToTargetInternal = (target: MarsTarget) => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || viewer.isDestroyed() || !Cesium) return;

    const entity = pinEntitiesRef.current.get(target.id);
    if (entity) {
      // Google Earth-style angled inspection view (range: 80000m, pitch: -40 deg)
      viewer
        .flyTo(entity, {
          duration: 1.75,
          offset: new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(18),
            Cesium.Math.toRadians(-40),
            80000
          ),
        })
        .catch(() => {
          // Ignore cancelled flights if user initiates another flyTo rapidly
        });
    }
  };

  const resetOrbitViewInternal = () => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    const ellipsoid = marsEllipsoidRef.current;
    if (!viewer || viewer.isDestroyed() || !Cesium || !ellipsoid) return;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(48.0, 12.0, 9200000, ellipsoid),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
      duration: 1.6,
    });
  };

  useImperativeHandle(ref, () => ({
    flyToTarget: flyToTargetInternal,
    resetOrbitView: resetOrbitViewInternal,
  }));

  useEffect(() => {
    const container = containerRef.current;
    const Cesium = window.Cesium;
    if (!container) return;

    if (!Cesium) {
      setWebglError('CesiumJS library failed to load from CDN. Check network connectivity and reload.');
      return;
    }

    // 1. Custom Mars Ellipsoid (equatorial: 3396190m, polar: 3376200m)
    const marsEllipsoid = new Cesium.Ellipsoid(
      MARS_CONSTANTS.EQUATORIAL_RADIUS,
      MARS_CONSTANTS.EQUATORIAL_RADIUS,
      MARS_CONSTANTS.POLAR_RADIUS
    );
    marsEllipsoidRef.current = marsEllipsoid;

    try {
      Cesium.Ellipsoid.WGS84 = marsEllipsoid;
    } catch {
      // Safe fallback if WGS84 property is non-writable in strict contexts
    }

    const marsTilingScheme = new Cesium.GeographicTilingScheme({
      ellipsoid: marsEllipsoid,
    });

    // 2. Analytic 3D Mars Relief Terrain Provider (Olympus Mons, Valles Marineris, Hellas, Craters)
    const marsTerrainProvider = new Cesium.CustomHeightmapTerrainProvider({
      width: 33,
      height: 33,
      tilingScheme: marsTilingScheme,
      ellipsoid: marsEllipsoid,
      callback: (x: number, y: number, level: number) => {
        const rect = marsTilingScheme.tileXYToRectangle(x, y, level);
        const buffer = new Float32Array(33 * 33);
        for (let row = 0; row < 33; row++) {
          const v = row / 32;
          const latRad = Cesium.Math.lerp(rect.north, rect.south, v);
          const latDeg = Cesium.Math.toDegrees(latRad);
          for (let col = 0; col < 33; col++) {
            const u = col / 32;
            const lonRad = Cesium.Math.lerp(rect.west, rect.east, u);
            const lonDeg = Cesium.Math.toDegrees(lonRad);
            buffer[row * 33 + col] = sampleMarsElevationMeters(lonDeg, latDeg);
          }
        }
        return buffer;
      },
    });

    let viewer: CesiumViewer;
    try {
      viewer = new Cesium.Viewer(container, {
        globe: new Cesium.Globe(marsEllipsoid),
        mapProjection: new Cesium.GeographicProjection(marsEllipsoid),
        terrainProvider: marsTerrainProvider,
        baseLayer: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        creditContainer: document.createElement('div'),
        requestRenderMode: false,
      });
    } catch (err) {
      setWebglError(
        err instanceof Error
          ? `WebGL 3D Globe initialization failed: ${err.message}`
          : 'WebGL 3D rendering context is unavailable in this browser.'
      );
      return;
    }

    viewerRef.current = viewer;

    // Remove all default Earth imagery layers
    viewer.imageryLayers.removeAll(true);

    // 3. Configure Dusty Martian SkyAtmosphere & Lighting
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#05070B');
    viewer.scene.skyAtmosphere = new Cesium.SkyAtmosphere(marsEllipsoid);
    viewer.scene.skyAtmosphere.hueShift = -0.45;
    viewer.scene.skyAtmosphere.saturationShift = 0.2;
    viewer.scene.skyAtmosphere.brightnessShift = -0.05;

    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#542818');
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.atmosphereLightIntensity = 12.0;
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.sun = new Cesium.Sun();
    viewer.scene.moon = undefined;

    // 4. NASA Mars Trek Viking Color Mosaic WMTS (Base Global Imagery)
    let tileFailureCount = 0;
    const vikingProvider = new Cesium.WebMapTileServiceImageryProvider({
      url: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg',
      layer: 'Mars_Viking_MDIM21_ClrMosaic_global_232m',
      style: 'default',
      format: 'image/jpeg',
      tileMatrixSetID: 'default028mm',
      maximumLevel: 7,
      tilingScheme: marsTilingScheme,
      credit: new Cesium.Credit('NASA Mars Trek Viking 232m Color Mosaic'),
    });

    const unbindVikingError = vikingProvider.errorEvent.addEventListener((tileError: { retry?: boolean }) => {
      if (tileError) tileError.retry = false;
      tileFailureCount += 1;
      if (tileFailureCount >= 4) {
        onTileWarningRef.current(
          'Some NASA Trek imagery tiles were unreachable; rendering surface fallback & 3D relief.'
        );
      }
    });

    const baseLayer = viewer.imageryLayers.addImageryProvider(vikingProvider);
    baseLayerRef.current = baseLayer;

    // 5. Secondary Toggleable Overlay: NASA MGS MOLA Colorized Shaded Relief
    const molaProvider = new Cesium.WebMapTileServiceImageryProvider({
      url: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg',
      layer: 'Mars_MGS_MOLA_ClrShade_merge_global_463m',
      style: 'default',
      format: 'image/jpeg',
      tileMatrixSetID: 'default028mm',
      maximumLevel: 7,
      tilingScheme: marsTilingScheme,
      credit: new Cesium.Credit('NASA MGS MOLA Shaded Relief'),
    });

    const unbindMolaError = molaProvider.errorEvent.addEventListener((tileError: { retry?: boolean }) => {
      if (tileError) tileError.retry = false;
    });

    const molaLayer = viewer.imageryLayers.addImageryProvider(molaProvider);
    molaLayer.show = false;
    molaLayer.alpha = 0.72;
    molaLayerRef.current = molaLayer;

    // 6. Plot Interactive Pins, Rover Traverses, Orbiting Satellites & Hazard Zones
    const pinMap = new Map<string, CesiumEntity>();
    const traverseMap = new Map<string, CesiumEntity>();
    const orbitMap = new Map<string, CesiumEntity[]>();
    const hazardList: CesiumEntity[] = [];

    for (const target of MARS_TARGETS) {
      const colorHex = CATEGORY_COLORS[target.category];
      const cesiumColor = Cesium.Color.fromCssColorString(colorHex);

      if (target.category === 'satellite' && target.orbit) {
        // Animated Satellite Pin using Cesium.CallbackProperty
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
            scale: 1.0,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: target.shortName,
            font: '600 12px "Chakra Petch", sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#07090E'),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -26),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: { targetId: target.id },
        });
        pinMap.set(target.id, satPin);

        // Full Reference Orbit Ring
        const ringPts = sampleSatelliteOrbitArc(target, 0, 360, 128, false).map(
          (p) => new Cesium.Cartesian3(p.x, p.y, p.z)
        );
        const orbitRing = viewer.entities.add({
          id: `${target.id}-orbit-ring`,
          polyline: {
            positions: ringPts,
            width: 1.4,
            material: new Cesium.PolylineDashMaterialProperty({
              color: cesiumColor.withAlpha(0.28),
              dashLength: 16.0,
            }),
          },
        });

        // Glowing Dynamic Trailing Wake Arc
        const wakePositions = new Cesium.CallbackProperty(() => {
          return sampleSatelliteOrbitArc(target, simSecondsRef.current, 115, 48, true).map(
            (p) => new Cesium.Cartesian3(p.x, p.y, p.z)
          );
        }, false);

        const orbitWake = viewer.entities.add({
          id: `${target.id}-orbit-wake`,
          polyline: {
            positions: wakePositions,
            width: 4.0,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.35,
              taperPower: 0.65,
              color: cesiumColor,
            }),
          },
        });

        orbitMap.set(target.id, [orbitRing, orbitWake]);
      } else {
        // Surface Target Pin (Rovers & Landmarks)
        const surfaceHeight = sampleMarsElevationMeters(target.longitude, target.latitude) + 250;
        const surfacePos = Cesium.Cartesian3.fromDegrees(
          target.longitude,
          target.latitude,
          surfaceHeight,
          marsEllipsoid
        );

        const surfacePin = viewer.entities.add({
          id: target.id,
          name: target.name,
          position: surfacePos,
          billboard: {
            image: createGlowPinDataUri(colorHex, target.category, false),
            scale: 1.0,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: target.shortName,
            font: '600 12px "Chakra Petch", sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#07090E'),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -26),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: { targetId: target.id },
        });
        pinMap.set(target.id, surfacePin);

        // Rover Multi-Waypoint Surface Traverse Polyline
        if (target.traversePath && target.traversePath.length > 1) {
          const traversePositions = target.traversePath.map(([lon, lat]) =>
            Cesium.Cartesian3.fromDegrees(
              lon,
              lat,
              sampleMarsElevationMeters(lon, lat) + 120,
              marsEllipsoid
            )
          );

          const traverseEntity = viewer.entities.add({
            id: `${target.id}-traverse`,
            polyline: {
              positions: traversePositions,
              width: 4.0,
              clampToGround: true,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.3,
                color: cesiumColor,
              }),
            },
          });
          traverseMap.set(target.id, traverseEntity);
        }
      }
    }

    // 7. Astronaut Hazard Zones
    for (const hz of HAZARD_ZONES) {
      const hzColor =
        hz.severity === 'Extreme'
          ? Cesium.Color.fromCssColorString('#EF4444')
          : hz.severity === 'Severe'
            ? Cesium.Color.fromCssColorString('#F97316')
            : Cesium.Color.fromCssColorString('#F59E0B');

      const hzEntity = viewer.entities.add({
        id: hz.id,
        name: hz.name,
        position: Cesium.Cartesian3.fromDegrees(hz.longitude, hz.latitude, 0, marsEllipsoid),
        ellipse: {
          semiMajorAxis: hz.semiMajorAxisMeters,
          semiMinorAxis: hz.semiMinorAxisMeters,
          rotation: Cesium.Math.toRadians(hz.rotationDeg),
          material: hzColor.withAlpha(0.16),
          outline: true,
          outlineColor: hzColor.withAlpha(0.75),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: `${hz.hazardType.toUpperCase()} · ${hz.severity.toUpperCase()}`,
          font: '500 10px "JetBrains Mono", monospace',
          fillColor: hzColor,
          outlineColor: Cesium.Color.fromCssColorString('#07090E'),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(400000, 12000000),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      hazardList.push(hzEntity);
    }

    pinEntitiesRef.current = pinMap;
    traverseEntitiesRef.current = traverseMap;
    orbitEntitiesRef.current = orbitMap;
    hazardEntitiesRef.current = hazardList;

    // 8. Initial Global Orbit Camera (centered over Syrtis Major / Jezero / Arabia Terra)
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(58.0, 10.0, 9200000, marsEllipsoid),
      duration: 0,
    });

    // 9. Mouse Interaction Handlers (Single-Click Info Card, Double-Click FlyTo, Cursor Telemetry)
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((click: { position: unknown }) => {
      const picked = viewer.scene.pick(click.position);
      if (picked?.id) {
        const entityId = picked.id.id;
        const matched = MARS_TARGETS.find((t) => t.id === entityId);
        if (matched) {
          onSelectTargetRef.current(matched);
          return;
        }
      }
      // Clicking empty Mars terrain or space keeps current selection or deselects only on space
      const cartesian = viewer.camera.pickEllipsoid(click.position, marsEllipsoid);
      if (!cartesian) {
        onSelectTargetRef.current(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction((doubleClick: { position: unknown }) => {
      const picked = viewer.scene.pick(doubleClick.position);
      if (picked?.id) {
        const entityId = picked.id.id;
        const matched = MARS_TARGETS.find((t) => t.id === entityId);
        if (matched) {
          onSelectTargetRef.current(matched);
          flyToTargetInternal(matched);
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    let lastMouseUpdate = 0;
    handler.setInputAction((movement: { endPosition: unknown }) => {
      const now = performance.now();
      if (now - lastMouseUpdate < 50) return;
      lastMouseUpdate = now;

      const camHeightKm = Math.max(0, Math.round(viewer.camera.positionCartographic.height / 1000));
      const cartesian = viewer.camera.pickEllipsoid(movement.endPosition, marsEllipsoid);
      if (cartesian) {
        const cartographic = marsEllipsoid.cartesianToCartographic(cartesian);
        const latDeg = Cesium.Math.toDegrees(cartographic.latitude);
        const lonDeg = Cesium.Math.toDegrees(cartographic.longitude);
        const elev = sampleMarsElevationMeters(lonDeg, latDeg);
        onCursorTelemetryRef.current({
          latitude: latDeg,
          longitude: lonDeg,
          elevationMeters: elev,
          cameraAltitudeKm: camHeightKm,
        });
      } else {
        onCursorTelemetryRef.current({
          latitude: null,
          longitude: null,
          elevationMeters: null,
          cameraAltitudeKm: camHeightKm,
        });
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // 10. WebGL Context Lost / Restored Listeners
    const canvas = viewer.scene.canvas;
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL rendering context lost. Attempting automatic recovery...');
    };
    const handleContextRestored = () => {
      setWebglError(null);
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    // 11. Orbital Simulation Animation Loop
    let rafId = 0;
    let lastFrameTime = performance.now();
    let lastUiSyncTime = 0;

    const tickOrbit = (now: number) => {
      const dtSec = Math.min(0.1, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      const multiplier = telemetryModeRef.current === 'simulation100x' ? 100 : 1;
      simSecondsRef.current += dtSec * multiplier;

      // Sync live satellite lat/lon/alt to HUD at ~4 Hz
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
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      handler.destroy();
      unbindVikingError();
      unbindMolaError();
      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
    };
  }, []);

  // Sync Layer Visibility & Slope/Hazard Material Mode
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || viewer.isDestroyed() || !Cesium || !isReady) return;

    if (baseLayerRef.current) {
      baseLayerRef.current.show = layers.baseImagery;
    }
    if (molaLayerRef.current) {
      molaLayerRef.current.show = layers.molaOverlay;
    }

    // Slope & Hazard 3D Relief Mode
    if (layers.slopeHazardMode) {
      viewer.scene.verticalExaggeration = 2.0;
      try {
        const slopeMat = Cesium.Material.fromType('SlopeRamp');
        slopeMat.uniforms.image = createSlopeHazardRampCanvas();
        viewer.scene.globe.material = slopeMat;
      } catch {
        viewer.scene.globe.material = undefined;
      }
    } else {
      viewer.scene.verticalExaggeration = 1.0;
      viewer.scene.globe.material = undefined;
    }

    // Hazard Zone surface polygons
    for (const hzEntity of hazardEntitiesRef.current) {
      hzEntity.show = layers.hazardZones;
    }
  }, [layers, isReady]);

  // Sync Category Filters, Traverse Visibility, Orbit Trails & Selected Pin Highlight
  useEffect(() => {
    if (!isReady) return;

    for (const target of MARS_TARGETS) {
      const isCatVisible = visibleCategories[target.category];
      const isSelected = target.id === selectedTargetId;
      const pin = pinEntitiesRef.current.get(target.id);

      if (pin) {
        pin.show = isCatVisible;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const billboard = pin.billboard as any;
        if (billboard) {
          billboard.image = createGlowPinDataUri(
            CATEGORY_COLORS[target.category],
            target.category,
            isSelected
          );
          billboard.scale = isSelected ? 1.15 : 1.0;
        }
      }

      const traverse = traverseEntitiesRef.current.get(target.id);
      if (traverse) {
        traverse.show = isCatVisible && layers.roverTraverses;
      }

      const orbitGroup = orbitEntitiesRef.current.get(target.id);
      if (orbitGroup) {
        for (const orbEntity of orbitGroup) {
          orbEntity.show = isCatVisible && layers.orbitTrails;
        }
      }
    }
  }, [visibleCategories, layers.roverTraverses, layers.orbitTrails, selectedTargetId, isReady]);

  return (
    <div className="relative w-full h-full bg-[#05070B]">
      <div
        ref={containerRef}
        className="w-full h-full cursor-crosshair"
        aria-label="Interactive 3D Mars Globe Viewport"
      />

      {!isReady && !webglError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#05070B]/95 z-30">
          <div className="w-10 h-10 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin mb-4" />
          <p className="font-display text-sm tracking-wider text-slate-200">
            Initializing Martian Ellipsoid &amp; NASA Trek Mosaic
          </p>
          <p className="font-mono-tabular text-xs text-slate-400 mt-1">
            3,396.19 km eq · 3,376.20 km pol
          </p>
        </div>
      )}

      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#05070B]/95 p-6 z-40">
          <div className="max-w-md rounded-xl border border-rose-500/30 bg-[#0B0F17] p-6 text-center">
            <h2 className="font-display text-lg font-semibold text-rose-400">
              3D Viewport Unavailable
            </h2>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">{webglError}</p>
            <p className="mt-4 font-mono-tabular text-xs text-slate-400">
              Ensure hardware acceleration / WebGL 2 is enabled in your browser.
            </p>
          </div>
        </div>
      )}
    </div>
  );
});
