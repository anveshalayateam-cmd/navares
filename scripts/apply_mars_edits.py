#!/usr/bin/env python3
"""Apply MarsGlobe + InfoMenu edits. Run from repo root."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MARS = ROOT / "src/components/MarsGlobe.tsx"
INFO = ROOT / "src/components/InfoMenu.tsx"

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"FAIL: not found: {label}")
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"FAIL: {label} found {n} times, expected 1")
    print(f"OK: {label}")
    return text.replace(old, new, 1)

def patch_mars(text):
    text = replace_once(
        text,
        "const CLOUDS_MIN_VISIBLE_ALTITUDE_METERS = 7_000_000;\n"
        "const CLOUDS_FULL_ALPHA_ALTITUDE_METERS = 7_600_000;\n"
        "const CLOUDS_MAX_ALPHA = 1.0;\n"
        "const CLOUD_SHELL_ALTITUDE_METERS = 58_000;\n"
        "\n"
        "function getCloudFadeAlpha(cameraHeightMeters: number): number {\n"
        "  if (cameraHeightMeters <= CLOUDS_MIN_VISIBLE_ALTITUDE_METERS) return 0;\n"
        "  const progress = Math.max(\n"
        "    0,\n"
        "    Math.min(\n"
        "      1,\n"
        "      (cameraHeightMeters - CLOUDS_MIN_VISIBLE_ALTITUDE_METERS) /\n"
        "        (CLOUDS_FULL_ALPHA_ALTITUDE_METERS - CLOUDS_MIN_VISIBLE_ALTITUDE_METERS)\n"
        "    )\n"
        "  );\n"
        "  const smooth = progress * progress * (3 - 2 * progress);\n"
        "  return CLOUDS_MAX_ALPHA * smooth;\n"
        "}",
        "// Clouds stay always visible at a slightly dim fixed opacity (no altitude fade-out).\n"
        "const CLOUDS_ALWAYS_ALPHA = 0.48;\n"
        "const CLOUD_SHELL_ALTITUDE_METERS = 58_000;\n"
        "\n"
        "function getCloudFadeAlpha(_cameraHeightMeters: number): number {\n"
        "  return CLOUDS_ALWAYS_ALPHA;\n"
        "}",
        "clouds-always-on",
    )
    text = replace_once(
        text,
        "    opticalLayer.show = true;\n"
        "    opticalLayer.hue = -0.04;\n"
        "    opticalLayer.contrast = 1.15;\n"
        "    opticalLayer.brightness = 1.0;\n"
        "    opticalLayer.saturation = 1.35;\n"
        "    opticalLayer.gamma = 0.88;",
        "    opticalLayer.show = true;\n"
        "    // Sandy / butterscotch / tan palette matching natural Mars true-color photography\n"
        "    opticalLayer.hue = 0.02;\n"
        "    opticalLayer.contrast = 1.08;\n"
        "    opticalLayer.brightness = 0.96;\n"
        "    opticalLayer.saturation = 0.92;\n"
        "    opticalLayer.gamma = 0.98;",
        "optical-sandy-colors",
    )
    text = replace_once(
        text,
        "    ctxLayer.show = false;\n"
        "    ctxLayer.alpha = 0.0;\n"
        "    ctxLayer.hue = -0.04;\n"
        "    ctxLayer.contrast = 1.2;\n"
        "    ctxLayer.brightness = 0.94;\n"
        "    ctxLayer.saturation = 1.35;\n"
        "    ctxLayer.gamma = 0.85;",
        "    ctxLayer.show = false;\n"
        "    ctxLayer.alpha = 0.0;\n"
        "    // Match optical sandy/butterscotch/tan treatment\n"
        "    ctxLayer.hue = 0.02;\n"
        "    ctxLayer.contrast = 1.1;\n"
        "    ctxLayer.brightness = 0.94;\n"
        "    ctxLayer.saturation = 0.92;\n"
        "    ctxLayer.gamma = 0.95;",
        "ctx-sandy-colors",
    )
    text = replace_once(
        text,
        "      {!isReady && !webglError && (\n"
        "        <div className=\"absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-30\">\n"
        "          <div className=\"w-9 h-9 rounded-full border-2 border-orange-500/30 border-t-orange-500 animate-spin mb-3\" />\n"
        "          <p className=\"font-display text-sm tracking-wide text-slate-200\">\n"
        "            Loading NASA Mars Trek Imagery\n"
        "          </p>\n"
        "        </div>\n"
        "      )}",
        "      {!isReady && !webglError && (\n"
        "        <div className=\"absolute inset-0 flex flex-col items-center justify-center bg-black z-30\">\n"
        "          <div className=\"relative w-full h-full max-w-full max-h-full flex items-center justify-center overflow-hidden\">\n"
        "            <img\n"
        "              src=\"/assets/aistudio/MM_2bfd2967.webp\"\n"
        "              alt=\"Mars\"\n"
        "              className=\"absolute inset-0 w-full h-full object-cover object-center\"\n"
        "            />\n"
        "            <div className=\"relative z-10 flex flex-col items-center justify-center gap-4\">\n"
        "              <div className=\"w-12 h-12 rounded-full border-[3px] border-black/25 border-t-black animate-spin\" />\n"
        "              <p className=\"font-display text-lg sm:text-xl font-semibold tracking-wide text-black drop-shadow-sm\">\n"
        "                ILoveMars\n"
        "              </p>\n"
        "            </div>\n"
        "          </div>\n"
        "        </div>\n"
        "      )}",
        "loading-ilovemars",
    )
    text = replace_once(
        text,
        "    // 2b. Global Translucent Limb/Horizon Martian Cloud Shell (visible > 7,000 km in optical mode;\n"
        "    //     invisible straight-on from the front, emerging along edges/horizons & fading into space)",
        "    // 2b. Global Translucent Limb/Horizon Martian Cloud Shell (always on, slightly dim in optical mode;\n"
        "    //     invisible straight-on from the front, emerging along edges/horizons & fading into space)",
        "cloud-comment",
    )
    return text

def patch_info(text):
    # Cloud attribution
    text2, n = re.subn(
        r"Global translucent water-ice and aerosol cloud veil visible above\{' '\}\s*"
        r"\n\s*<span className=\"font-mono-tabular text-slate-200\">7,000 km</span> "
        r". invisible straight-on\s*\n\s*while emerging smoothly along planetary edges and horizons "
        r". is procedurally generated with\s*\n\s*AI assistance, inspired by orbital photography from\{' '\}",
        "Global translucent water-ice and aerosol cloud veil (always present, slightly dim) \u2014\n"
        "        invisible straight-on while emerging smoothly along planetary edges and horizons \u2014 is\n"
        "        procedurally generated with AI assistance, inspired by orbital photography from{' '}",
        text,
        count=1,
    )
    print(f"cloud-attr replacements: {n}")
    text = text2
    # Grok in About
    old_ai = (
        '<strong className="font-semibold text-white">OpenHands</strong>, and{\' \'}\n'
        '                      <strong className="font-semibold text-white">Google AI</strong>'
    )
    new_ai = (
        '<strong className="font-semibold text-white">OpenHands</strong>,{\' \'}\n'
        '                      <strong className="font-semibold text-white">Google AI</strong>, and{\' \'}\n'
        '                      <strong className="font-semibold text-white">Grok</strong>'
    )
    if "Grok" in text:
        print("Grok already present")
    elif old_ai in text:
        text = text.replace(old_ai, new_ai, 1)
        print("OK: about-grok")
    else:
        print("WARN: About AI list pattern not found")
    return text

def main():
    mars = MARS.read_text(encoding="utf-8")
    if "CLOUDS_ALWAYS_ALPHA" in mars:
        print("MarsGlobe already patched")
    else:
        mars = patch_mars(mars)
        MARS.write_text(mars, encoding="utf-8")
        print(f"Wrote {MARS}")

    if not INFO.exists():
        print("InfoMenu missing; skip")
        return
    info = INFO.read_text(encoding="utf-8")
    if len(info) < 20000:
        print(f"InfoMenu still truncated ({len(info)} bytes); skip InfoMenu patches")
        return
    info2 = patch_info(info)
    if info2 != info:
        INFO.write_text(info2, encoding="utf-8")
        print(f"Wrote {INFO}")
    else:
        print("InfoMenu unchanged")

if __name__ == "__main__":
    main()
