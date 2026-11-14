// Ambient TypeScript declarations for CesiumJS v1.124 loaded via CDN

export interface CesiumEntity {
  id: string;
  name?: string;
  position?: {
    getValue?: (time: unknown) => unknown;
  };
  billboard?: unknown;
  label?: unknown;
  polyline?: unknown;
  ellipse?: unknown;
  point?: unknown;
  show: boolean;
  properties?: Record<string, unknown>;
}

export interface CesiumImageryLayer {
  show: boolean;
  alpha: number;
  contrast: number;
  brightness: number;
  gamma: number;
  saturation: number;
  magnificationFilter?: unknown;
  minificationFilter?: unknown;
  imageryProvider: {
    errorEvent?: {
      addEventListener: (cb: (err: unknown) => void) => () => void;
    };
  };
}

export interface CesiumViewer {
  trackedEntity?: CesiumEntity;
  cesiumWidget: {
    screenSpaceEventHandler: {
      removeInputAction: (type: unknown, modifier?: unknown) => void;
    };
  };
  scene: {
    globe: {
      baseColor: unknown;
      enableLighting: boolean;
      dynamicAtmosphereLighting?: boolean;
      dynamicAtmosphereLightingFromSun?: boolean;
      showGroundAtmosphere: boolean;
      lightingFadeInDistance?: number;
      lightingFadeOutDistance?: number;
      preloadSiblings?: boolean;
      preloadAncestors?: boolean;
      tileCacheSize?: number;
      maximumScreenSpaceError?: number;
      atmosphereLightIntensity: number;
      atmosphereHueShift?: number;
      atmosphereSaturationShift?: number;
      atmosphereBrightnessShift?: number;
      atmosphereRayleighScaleHeight?: number;
      atmosphereMieScaleHeight?: number;
      depthTestAgainstTerrain: boolean;
      pick: (ray: unknown, scene: unknown) => unknown;
      material?: unknown;
      tileLoadProgressEvent: {
        addEventListener: (cb: (queued: number) => void) => () => void;
      };
    };
    skyAtmosphere: {
      show?: boolean;
      hueShift: number;
      saturationShift: number;
      brightnessShift: number;
      atmosphereRayleighScaleHeight?: number;
      atmosphereMieScaleHeight?: number;
      atmosphereLightIntensity?: number;
      perFragmentAtmosphere?: boolean;
    };
    fog?: {
      enabled: boolean;
    };
    screenSpaceCameraController: {
      enableCollisionDetection: boolean;
      minimumZoomDistance: number;
      maximumZoomDistance: number;
      enableZoom: boolean;
      enableRotate: boolean;
      enableTilt: boolean;
      enableTranslate: boolean;
      zoomFactor?: number;
      inertiaZoom?: number;
      inertiaSpin?: number;
      inertiaTranslate?: number;
      maximumMovementRatio?: number;
      bounceAnimationTime?: number;
      zoomEventTypes: unknown[];
      tiltEventTypes: unknown[];
    };
    preUpdate: {
      addEventListener: (cb: () => void) => () => void;
    };
    preRender: {
      addEventListener: (cb: () => void) => () => void;
    };
    postRender: {
      addEventListener: (cb: () => void) => () => void;
    };
    renderError?: {
      addEventListener: (cb: (scene: unknown, error: unknown) => void) => () => void;
    };
    light?: unknown;
    highDynamicRange: boolean;
    sun?: unknown;
    moon?: unknown;
    backgroundColor: unknown;
    verticalExaggeration: number;
    canvas: HTMLCanvasElement;
    pick: (windowPosition: unknown) => { id?: CesiumEntity } | undefined;
    pickPosition: (windowPosition: unknown) => unknown;
  };
  camera: {
    position: unknown;
    positionWC: unknown;
    directionWC: unknown;
    heading: number;
    pitch: number;
    roll: number;
    positionCartographic: {
      latitude: number;
      longitude: number;
      height: number;
    };
    flyTo: (options: Record<string, unknown>) => void;
    cancelFlight: () => void;
    setView: (options: Record<string, unknown>) => void;
    moveForward: (amount?: number) => void;
    moveBackward: (amount?: number) => void;
    zoomIn: (amount?: number) => void;
    zoomOut: (amount?: number) => void;
    getPickRay: (windowPosition: unknown) => unknown;
    pickEllipsoid: (windowPosition: unknown, ellipsoid: unknown) => unknown;
  };
  entities: {
    add: (options: Record<string, unknown>) => CesiumEntity;
    getById: (id: string) => CesiumEntity | undefined;
    remove: (entity: CesiumEntity) => boolean;
    removeById: (id: string) => boolean;
    removeAll: () => void;
  };
  imageryLayers: {
    addImageryProvider: (provider: unknown) => CesiumImageryLayer;
    removeAll: (destroy?: boolean) => void;
  };
  clock: {
    currentTime: unknown;
    shouldAnimate: boolean;
  };
  flyTo: (target: unknown, options?: Record<string, unknown>) => Promise<boolean>;
  destroy: () => void;
  isDestroyed: () => boolean;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Cesium: any;
  }
}
