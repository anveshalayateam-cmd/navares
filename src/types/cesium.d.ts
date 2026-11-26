// Ambient TypeScript declarations for CesiumJS v1.124 loaded via CDN

export interface CesiumEntity {
  id: string;
  name?: string;
  position?: {
    getValue?: (time: unknown) => unknown;
  };
  billboard?: unknown;
  label?: unknown;
  model?: unknown;
  orientation?: unknown;
  polyline?: unknown;
  polygon?: unknown;
  ellipse?: unknown;
  point?: unknown;
  show: boolean;
  properties?: Record<string, unknown>;
}

export interface CesiumImageryLayer {
  show: boolean;
  alpha: number;
  hue?: number;
  contrast: number;
  brightness: number;
  gamma: number;
  saturation: number;
  magnificationFilter?: unknown;
  minificationFilter?: unknown;
  dayAlpha?: number;
  nightAlpha?: number;
  imageryProvider: {
    errorEvent?: {
      addEventListener: (cb: (err: unknown) => void) => () => void;
    };
  };
}

export interface CesiumViewer {
  trackedEntity?: CesiumEntity;
  resolutionScale: number;
  cesiumWidget: {
    screenSpaceEventHandler: {
      removeInputAction: (type: unknown, modifier?: unknown) => void;
    };
  };
  scene: {
    requestRenderMode: boolean;
    msaaSamples?: number;
    msaaSupported?: boolean;
    postProcessStages: {
      fxaa: {
        enabled: boolean;
      };
      add?: (stage: unknown) => unknown;
      remove?: (stage: unknown) => boolean;
    };
    globe: {
      baseColor: unknown;
      enableLighting: boolean;
      dynamicAtmosphereLighting?: boolean;
      dynamicAtmosphereLightingFromSun?: boolean;
      showGroundAtmosphere: boolean;
      lightingFadeInDistance?: number;
      lightingFadeOutDistance?: number;
      nightFadeInDistance?: number;
      nightFadeOutDistance?: number;
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
      atmosphereRayleighCoefficient?: unknown;
      atmosphereMieCoefficient?: unknown;
      atmosphereMieAnisotropy?: number;
      depthTestAgainstTerrain: boolean;
      tilesLoaded?: boolean;
      getHeight?: (cartographic: unknown) => number | undefined;
      pick: (ray: unknown, scene: unknown) => unknown;
      material?: unknown;
      tileLoadProgressEvent: {
        addEventListener: (cb: (queued: number) => void) => () => void;
      };
    };
    primitives: {
      add: (primitive: unknown) => unknown;
      remove: (primitive: unknown) => boolean;
    };
    skyAtmosphere: {
      show?: boolean;
      hueShift: number;
      saturationShift: number;
      brightnessShift: number;
      atmosphereRayleighScaleHeight?: number;
      atmosphereMieScaleHeight?: number;
      atmosphereRayleighCoefficient?: unknown;
      atmosphereMieCoefficient?: unknown;
      atmosphereMieAnisotropy?: number;
      atmosphereLightIntensity?: number;
      perFragmentAtmosphere?: boolean;
    };
    fog?: {
      enabled: boolean;
      density?: number;
      minimumBrightness?: number;
      screenSpaceErrorFactor?: number;
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
    sun?: {
      show?: boolean;
    };
    moon?: unknown;
    backgroundColor: unknown;
    skyBox?: {
      show: boolean;
    };
    verticalExaggeration: number;
    canvas: HTMLCanvasElement;
    pick: (windowPosition: unknown) => { id?: CesiumEntity } | undefined;
    pickPosition: (windowPosition: unknown) => unknown;
  };
  camera: {
    position: unknown;
    positionWC: unknown;
    directionWC: unknown;
    viewMatrix: unknown;
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
    length: number;
    get: (index: number) => CesiumImageryLayer | undefined;
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
