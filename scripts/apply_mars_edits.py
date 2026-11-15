#!/usr/bin/env python3
"""Incremental patches for navares. Idempotent."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MARS = ROOT / "src/components/MarsGlobe.tsx"
APP = ROOT / "src/App.tsx"
INFO = ROOT / "src/components/InfoMenu.tsx"

def once(text, old, new, label):
    if new.strip()[:40] in text and old not in text:
        print(f"SKIP (already applied): {label}")
        return text
    if old not in text:
        raise SystemExit(f"FAIL: not found: {label}")
    if text.count(old) != 1:
        raise SystemExit(f"FAIL: {label} count={text.count(old)}")
    print(f"OK: {label}")
    return text.replace(old, new, 1)

def patch_mars(text):
    # 1) clouds always on
    if "CLOUDS_ALWAYS_ALPHA" not in text:
        text = once(
            text,
            "const CLOUDS_MIN_VISIBLE_ALTITUDE_METERS = 7_000_000;\n"
            "const CLOUDS_FULL_ALPHA_ALTITUDE_METERS = 7_600_000;\n"
            "const CLOUDS_MAX_ALPHA = 1.0;\n"
            "const CLOUD_SHELL_ALTITUDE_METERS = 58_000;\n\n"
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
            "const CLOUD_SHELL_ALTITUDE_METERS = 58_000;\n\n"
            "function getCloudFadeAlpha(_cameraHeightMeters: number): number {\n"
            "  return CLOUDS_ALWAYS_ALPHA;\n"
            "}",
            "clouds-always-on",
        )

    # 2) onGlobeReady prop
    if "onGlobeReady" not in text:
        text = once(
            text,
            "  onSiteRectLivePreviewChange: (preview: LiveSiteRectPreview | null) => void;\n"
            "  onSiteRectComplete: (bounds: SiteBounds) => void;\n"
            "}",
            "  onSiteRectLivePreviewChange: (preview: LiveSiteRectPreview | null) => void;\n"
            "  onSiteRectComplete: (bounds: SiteBounds) => void;\n"
            "  onGlobeReady?: (ready: boolean) => void;\n"
            "}",
            "mars-props-onGlobeReady",
        )
        text = once(
            text,
            "    onSiteRectLivePreviewChange,\n"
            "    onSiteRectComplete,\n"
            "  },\n"
            "  ref\n"
            ") {",
            "    onSiteRectLivePreviewChange,\n"
            "    onSiteRectComplete,\n"
            "    onGlobeReady,\n"
            "  },\n"
            "  ref\n"
            ") {",
            "mars-destructure-onGlobeReady",
        )
        # notify parent when ready
        text = once(
            text,
            "    setIsReady(true);",
            "    setIsReady(true);\n"
            "    onGlobeReady?.(true);",
            "mars-call-onGlobeReady",
        )

    # 3) raise loading overlay above all HUD (z-[100])
    if "z-[100]" not in text and "ILoveMars" in text:
        text = once(
            text,
            '        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-30">',
            '        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-[100]">',
            "loading-z-index",
        )

    return text

def patch_app(text):
    if "globeReady" in text:
        print("SKIP: App already has globeReady")
        return text

    text = once(
        text,
        "  const globeRef = useRef<MarsGlobeHandle | null>(null);\n",
        "  const globeRef = useRef<MarsGlobeHandle | null>(null);\n"
        "  const [globeReady, setGlobeReady] = useState(false);\n",
        "app-globeReady-state",
    )

    text = once(
        text,
        "        onSiteRectComplete={setSiteBounds}\n"
        "      />\n",
        "        onSiteRectComplete={setSiteBounds}\n"
        "        onGlobeReady={setGlobeReady}\n"
        "      />\n",
        "app-pass-onGlobeReady",
    )

    # Wrap every HUD sibling after MarsGlobe so they only show when ready
    # Find the block from SearchBar through end of main content before closing </main>
    old_hud_start = "      {/* Control 1: Top-Left Floating Search & Quick-Jump Pill */}\n"
    if old_hud_start not in text:
        raise SystemExit("FAIL: HUD start marker not found")

    # Insert conditional wrapper after MarsGlobe closes
    text = once(
        text,
        "        onGlobeReady={setGlobeReady}\n"
        "      />\n\n"
        "      {/* Control 1: Top-Left Floating Search & Quick-Jump Pill */}\n",
        "        onGlobeReady={setGlobeReady}\n"
        "      />\n\n"
        "      {/* Hide all chrome until the globe finishes loading */}\n"
        "      {globeReady && (\n"
        "        <>\n"
        "      {/* Control 1: Top-Left Floating Search & Quick-Jump Pill */}\n",
        "app-wrap-hud-open",
    )

    # Close the fragment before </main>
    text = once(
        text,
        "      <InfoMenu hasTargetCardOpen={selectedTarget !== null} />\n"
        "    </main>\n",
        "      <InfoMenu hasTargetCardOpen={selectedTarget !== null} />\n"
        "        </>\n"
        "      )}\n"
        "    </main>\n",
        "app-wrap-hud-close",
    )
    return text

def patch_info(text):
    # Loading-image attribution entry (insert after Mission Photography if missing)
    if "Loading Screen Mars Image" in text or "Emirates Mars Mission" in text and "loading" in text.lower():
        # still try to add specific entry
        pass
    if "Loading Screen Mars Image" not in text:
        needle = "  {\n    title: 'Mission Photography',"
        insert = (
            "  {\n"
            "    title: 'Loading Screen Mars Image',\n"
            "    description: (\n"
            "      <>\n"
            "        True-color full-disk view of Mars used while the 3D globe initializes. Based on\n"
            "        Emirates Mars Mission (Hope) EXI imagery acquired around{' '}\n"
            "        <span className=\"font-mono-tabular text-slate-200\">30 August 2021</span>, processed\n"
            "        into natural color by{' '}\n"
            "        <em className=\"text-slate-300\">Kevin M. Gill</em> (filters f635 / f546 / f437).\n"
            "        Source:{' '}\n"
            "        <a\n"
            "          href=\"https://commons.wikimedia.org/wiki/File:Mars_-_August_30_2021_-_Flickr_-_Kevin_M._Gill.png\"\n"
            "          target=\"_blank\"\n"
            "          rel=\"noreferrer\"\n"
            "          className=\"text-cyan-300 underline underline-offset-2 hover:text-cyan-200\"\n"
            "        >\n"
            "          Wikimedia Commons\n"
            "        </a>{' '}\n"
            "        / Flickr; license{' '}\n"
            "        <span className=\"font-mono-tabular text-slate-200\">CC BY 2.0</span>.\n"
            "      </>\n"
            "    ),\n"
            "  },\n"
            "  {\n"
            "    title: 'Mission Photography',"
        )
        if needle not in text:
            raise SystemExit("FAIL: Mission Photography block not found")
        text = text.replace(needle, insert, 1)
        print("OK: loading-image-attribution")

    # Cloud attribution (if still old)
    if "visible above" in text and "7,000 km" in text:
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

    # Grok
    if "Grok" not in text:
        old_ai = (
            '<strong className="font-semibold text-white">OpenHands</strong>, and{\' \'}\n'
            '                      <strong className="font-semibold text-white">Google AI</strong>'
        )
        new_ai = (
            '<strong className="font-semibold text-white">OpenHands</strong>,{\' \'}\n'
            '                      <strong className="font-semibold text-white">Google AI</strong>, and{\' \'}\n'
            '                      <strong className="font-semibold text-white">Grok</strong>'
        )
        if old_ai in text:
            text = text.replace(old_ai, new_ai, 1)
            print("OK: about-grok")
    return text

def main():
    mars = MARS.read_text(encoding="utf-8")
    mars2 = patch_mars(mars)
    if mars2 != mars:
        MARS.write_text(mars2, encoding="utf-8")
        print(f"Wrote {MARS}")

    app = APP.read_text(encoding="utf-8")
    app2 = patch_app(app)
    if app2 != app:
        APP.write_text(app2, encoding="utf-8")
        print(f"Wrote {APP}")

    if INFO.exists() and INFO.stat().st_size > 20000:
        info = INFO.read_text(encoding="utf-8")
        info2 = patch_info(info)
        if info2 != info:
            INFO.write_text(info2, encoding="utf-8")
            print(f"Wrote {INFO}")
    else:
        print("InfoMenu skip/truncated")

if __name__ == "__main__":
    main()
