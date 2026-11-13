// Ambient TypeScript declarations for CesiumJS v1.124 loaded via CDN

export interface CesiumEntity {
  id: string;
  name?: string;
  position?: unknown;
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
  imageryProvider: {
    errorEvent?: {
      addEventListener: (cb: (err: unknown) => void) => () => void;
    };
  };
}

export interface CesiumViewer {
  scene: {
    globe: {
      baseColor: unknown;
      enableLighting: boolean;
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
    positionCartographic: {
      latitude: number;
      longitude: number;
      height: number;
    };
    flyTo: (options: Record<string, unknown>) => void;
    pickEllipsoid: (windowPosition: unknown, ellipsoid: unknown) => unknown;
  };
  entities: {
    add: (options: Record<string, unknown>) => CesiumEntity;
    getById: (id: string) => CesiumEntity | undefined;
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
