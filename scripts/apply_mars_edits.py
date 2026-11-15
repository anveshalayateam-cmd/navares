#!/usr/bin/env python3
"""Apply the 5 MarsGlobe edits + InfoMenu Grok/cloud text. Run from repo root."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARS = ROOT / "src/components/MarsGlobe.tsx"
INFO = ROOT / "src/components/InfoMenu.tsx"

def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"FAIL: pattern not found for {label}")
    if text.count(old) != 1:
        raise SystemExit(f"FAIL: expected 1 occurrence for {label}, found {text.count(old)}")
    print(f"OK: {label}")
    return text.replace(old, new, 1)

def main() -> None:
    mars = MARS.read_text(encoding="utf-8")

    mars = replace_once(
        mars,
        """const CLOUDS_MIN_VISIBLE_ALTITUDE_METERS = 7_000_000;
const CLOUDS_FULL_ALPHA_ALTITUDE_METERS = 7_600_000;
const CLOUDS_MAX_ALPHA = 1.0;
const CLOUD_SHELL_ALTITUDE_METERS = 58_000;

function getCloudFadeAlpha(cameraHeightMeters: number): number {
  if (cameraHeightMeters <= CLOUDS_MIN_VISIBLE_ALTITUDE_METERS) return 0;
  const progress = Math.max(
    0,
    Math.min(
      1,
      (cameraHeightMeters - CLOUDS_MIN_VISIBLE_ALTITUDE_METERS) /
        (CLOUDS_FULL_ALPHA_ALTITUDE_METERS - CLOUDS_MIN_VISIBLE_ALTITUDE_METERS)
    )
  );
  const smooth = progress * progress * (3 - 2 * progress);
  return CLOUDS_MAX_ALPHA * smooth;
}""",
        """// Clouds stay always visible at a slightly dim fixed opacity (no altitude fade-out).
const CLOUDS_ALWAYS_ALPHA = 0.48;
const CLOUD_SHELL_ALTITUDE_METERS = 58_000;

function getCloudFadeAlpha(_cameraHeightMeters: number): number {
  return CLOUDS_ALWAYS_ALPHA;
}""",
        "clouds-always-on",
    )

    mars = replace_once(
        mars,
        """    opticalLayer.show = true;
    opticalLayer.hue = -0.04;
    opticalLayer.contrast = 1.15;
    opticalLayer.brightness = 1.0;
    opticalLayer.saturation = 1.35;
    opticalLayer.gamma = 0.88;""",
        """    opticalLayer.show = true;
    // Sandy / butterscotch / tan palette matching natural Mars true-color photography
    opticalLayer.hue = 0.02;
    opticalLayer.contrast = 1.08;
    opticalLayer.brightness = 0.96;
    opticalLayer.saturation = 0.92;
    opticalLayer.gamma = 0.98;""",
        "optical-sandy-colors",
    )

    mars = replace_once(
        mars,
        """    ctxLayer.show = false;
    ctxLayer.alpha = 0.0;
    ctxLayer.hue = -0.04;
    ctxLayer.contrast = 1.2;
    ctxLayer.brightness = 0.94;
    ctxLayer.saturation = 1.35;
    ctxLayer.gamma = 0.85;""",
        """    ctxLayer.show = false;
    ctxLayer.alpha = 0.0;
    // Match optical sandy/butterscotch/tan treatment
    ctxLayer.hue = 0.02;
    ctxLayer.contrast = 1.1;
    ctxLayer.brightness = 0.94;
    ctxLayer.saturation = 0.92;
    ctxLayer.gamma = 0.95;""",
        "ctx-sandy-colors",
    )

    mars = replace_once(
        mars,
        """      {!isReady && !webglError && (
        <div className=\"absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-30\">
          <div className=\"w-9 h-9 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin mb-3\" />
          <p className=\"font-display text-sm tracking-wide text-slate-200\">
            Loading NASA Mars Trek Imagery
          </p>
        </div>
      )}""",
        """      {!isReady && !webglError && (
        <div className=\"absolute inset-0 flex flex-col items-center justify-center bg-black z-30\">
          <div className=\"relative w-full h-full max-w-full max-h-full flex items-center justify-center overflow-hidden\">
            <img
              src=\"/assets/aistudio/MM_2bfd2967.webp\"
              alt=\"Mars\"
              className=\"absolute inset-0 w-full h-full object-cover object-center\"
            />
            <div className=\"relative z-10 flex flex-col items-center justify-center gap-4\">
              <div className=\"w-12 h-12 rounded-full border-[3px] border-black/25 border-t-black animate-spin\" />
              <p className=\"font-display text-lg sm:text-xl font-semibold tracking-wide text-black drop-shadow-sm\">
                ILoveMars
              </p>
            </div>
          </div>
        </div>
      )}""",
        "loading-ilovemars",
    )

    mars = replace_once(
        mars,
        """    // 2b. Global Translucent Limb/Horizon Martian Cloud Shell (visible > 7,000 km in optical mode;
    //     invisible straight-on from the front, emerging along edges/horizons & fading into space)""",
        """    // 2b. Global Translucent Limb/Horizon Martian Cloud Shell (always on, slightly dim in optical mode;
    //     invisible straight-on from the front, emerging along edges/horizons & fading into space)""",
        "cloud-comment",
    )

    MARS.write_text(mars, encoding="utf-8")
    print(f"Wrote {MARS}")

    # InfoMenu: only apply if file looks complete (has the About section)
    if INFO.exists() and "Google AI Studio (Gemini)" in INFO.read_text(encoding="utf-8"):
        info = INFO.read_text(encoding="utf-8")
        old_ai = (
            '<strong className="font-semibold text-white">OpenHands</strong>, and{\' \'}\n'
            '                      <strong className="font-semibold text-white">Google AI</strong>'
        )
        new_ai = (
            '<strong className="font-semibold text-white">OpenHands</strong>,{\' \'}\n'
            '                      <strong className="font-semibold text-white">Google AI</strong>, and{\' \'}\n'
            '                      <strong className="font-semibold text-white">Grok</strong>'
        )
        if old_ai in info and "Grok" not in info:
            info = replace_once(info, old_ai, new_ai, "about-grok")
            INFO.write_text(info, encoding="utf-8")
            print(f"Wrote {INFO}")
        else:
            print("InfoMenu Grok edit skipped (already applied or pattern mismatch)")
    else:
        print("InfoMenu incomplete or missing About section; skip InfoMenu edits (restore first)")

if __name__ == "__main__":
    main()
