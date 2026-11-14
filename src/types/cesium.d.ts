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
      showGroundAtmosphere: boolean;
      atmosphereLightIntensity: number;
      depthTestAgainstTerrain: boolean;
      material?: unknown;
      tileLoadProgressEvent: {
        addEventListener: (cb: (queued: number) => void) => () => void;
      };
    };
    skyAtmosphere: {
      hueShift: number;
      saturationShift: number;
      brightnessShift: number;
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
      zoomEventTypes: unknown[];
      tiltEventTypes: unknown[];
    };
    preRender: {
      addEventListener: (cb: () => void) => () => void;
    };
    postRender: {
      addEventListener: (cb: () => void) => () => void;
    };
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
