#!/usr/bin/env python3
"""Min 10s loading, altitude-based sandy color blend, clouds fade on zoom-in."""
from pathlib import Path

MARS = Path(__file__).resolve().parents[1] / "src/components/MarsGlobe.tsx"
text = MARS.read_text(encoding="utf-8")

def once(old, new, label):
    global text
    if old not in text:
        if new[:50] in text:
            print(f"SKIP: {label}")
            return
        raise SystemExit(f"FAIL: {label}")
    if text.count(old) != 1:
        raise SystemExit(f"FAIL count {text.count(old)}: {label}")
    text = text.replace(old, new, 1)
    print(f"OK: {label}")

# --- 1) Cloud fade + color-blend helpers ---
old_clouds = """// Clouds stay always visible at a slightly dim fixed opacity (no altitude fade-out).
const CLOUDS_ALWAYS_ALPHA = 0.48;
const CLOUD_SHELL_ALTITUDE_METERS = 58_000;

function getCloudFadeAlpha(_cameraHeightMeters: number): number {
  return CLOUDS_ALWAYS_ALPHA;
}"""

new_clouds = """// Clouds: full at high altitude, progressive fade as the camera zooms in.
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
  cameraHeightMeters: number,
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
  const t = getAltitudeColorBlend(cameraHeightMeters);
  layer.hue = lerp(OPTICAL_COLOR_FAR.hue, OPTICAL_COLOR_NEAR.hue, t);
  layer.contrast = lerp(OPTICAL_COLOR_FAR.contrast, OPTICAL_COLOR_NEAR.contrast, t);
  layer.brightness = lerp(OPTICAL_COLOR_FAR.brightness, OPTICAL_COLOR_NEAR.brightness, t);
  layer.saturation = lerp(OPTICAL_COLOR_FAR.saturation, OPTICAL_COLOR_NEAR.saturation, t);
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
}"""

once(old_clouds, new_clouds, "cloud-and-color-helpers")

# --- 2) Initial optical layer: start at FAR (orbital) colors ---
old_init_opt = """    opticalLayer.show = true;
    // Sandy / butterscotch / tan palette matching natural Mars true-color photography
    opticalLayer.hue = 0.02;
    opticalLayer.contrast = 1.08;
    opticalLayer.brightness = 0.96;
    opticalLayer.saturation = 0.92;
    opticalLayer.gamma = 0.98;"""
new_init_opt = """    opticalLayer.show = true;
    // Start at orbital (far) grading; post-render loop blends toward sandy near-surface look
    opticalLayer.hue = OPTICAL_COLOR_FAR.hue;
    opticalLayer.contrast = OPTICAL_COLOR_FAR.contrast;
    opticalLayer.brightness = OPTICAL_COLOR_FAR.brightness;
    opticalLayer.saturation = OPTICAL_COLOR_FAR.saturation;
    opticalLayer.gamma = OPTICAL_COLOR_FAR.gamma;"""
once(old_init_opt, new_init_opt, "init-optical-far")

old_init_ctx = """    ctxLayer.show = false;
    ctxLayer.alpha = 0.0;
    // Match optical sandy/butterscotch/tan treatment
    ctxLayer.hue = 0.02;
    ctxLayer.contrast = 1.1;
    ctxLayer.brightness = 0.94;
    ctxLayer.saturation = 0.92;
    ctxLayer.gamma = 0.95;"""
new_init_ctx = """    ctxLayer.show = false;
    ctxLayer.alpha = 0.0;
    ctxLayer.hue = CTX_COLOR_FAR.hue;
    ctxLayer.contrast = CTX_COLOR_FAR.contrast;
    ctxLayer.brightness = CTX_COLOR_FAR.brightness;
    ctxLayer.saturation = CTX_COLOR_FAR.saturation;
    ctxLayer.gamma = CTX_COLOR_FAR.gamma;"""
once(old_init_ctx, new_init_ctx, "init-ctx-far")

# --- 3) Apply color blend in post-render loop next to cloud opacity ---
old_loop = """      const camHeight = camCarto ? camCarto.height : DEFAULT_CAMERA_HEIGHT_METERS;
      const ctxOpacity = getCtxFadeAlpha(camHeight);"""
new_loop = """      const camHeight = camCarto ? camCarto.height : DEFAULT_CAMERA_HEIGHT_METERS;
      const ctxOpacity = getCtxFadeAlpha(camHeight);
      // Progressive color: orbital mosaic far away → sandy image palette when zoomed in
      if (mapStyleRef.current === 'optical' || mapStyleRef.current === 'radiation') {
        applyOpticalColorForAltitude(
          vikingLayerRef.current,
          camHeight,
          mapStyleRef.current === 'optical'
        );
        applyCtxColorForAltitude(ctxLayerRef.current, camHeight);
      }"""
once(old_loop, new_loop, "post-render-color-blend")

# --- 4) mapStyle effect: use far defaults only as base; loop owns altitude blend for optical ---
old_style = """      opticalLayer.hue = mapStyle === 'optical' ? -0.04 : 0.0;
      opticalLayer.contrast = mapStyle === 'optical' ? 1.15 : 1.25;
      opticalLayer.brightness = mapStyle === 'optical' ? 1.0 : 0.30;
      opticalLayer.saturation = mapStyle === 'optical' ? 1.35 : 0.15;
      opticalLayer.gamma = mapStyle === 'optical' ? 0.88 : 0.90;"""
new_style = """      // Non-optical modes get fixed grading; optical altitude blend runs in the render loop
      if (mapStyle === 'optical') {
        applyOpticalColorForAltitude(opticalLayer, DEFAULT_CAMERA_HEIGHT_METERS, true);
      } else {
        opticalLayer.hue = 0.0;
        opticalLayer.contrast = 1.25;
        opticalLayer.brightness = 0.3;
        opticalLayer.saturation = 0.15;
        opticalLayer.gamma = 0.9;
      }"""
once(old_style, new_style, "mapstyle-optical-branch")

# --- 5) Minimum 10s loading screen ---
old_ready = """    setIsReady(true);
    onGlobeReady?.(true);"""
new_ready = """    // Keep the loading image up for at least 10s; if the globe is slower, wait for it.
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
    }"""
once(old_ready, new_ready, "min-10s-loading")

# Add loadingStartedAtRef near isReady state
old_state = "  const [isReady, setIsReady] = useState<boolean>(false);"
new_state = (
    "  const [isReady, setIsReady] = useState<boolean>(false);\n"
    "  const loadingStartedAtRef = useRef<number>(performance.now());"
)
once(old_state, new_state, "loading-started-ref")

# Update cloud comment
old_cmt = (
    "    // 2b. Global Translucent Limb/Horizon Martian Cloud Shell (always on, slightly dim in optical mode;\n"
    "    //     invisible straight-on from the front, emerging along edges/horizons & fading into space)"
)
new_cmt = (
    "    // 2b. Global Translucent Limb/Horizon Martian Cloud Shell (full at altitude, fades on zoom-in;\n"
    "    //     invisible straight-on from the front, emerging along edges/horizons & fading into space)"
)
once(old_cmt, new_cmt, "cloud-comment")

MARS.write_text(text, encoding="utf-8")
print("Wrote", MARS, "len", len(text))
