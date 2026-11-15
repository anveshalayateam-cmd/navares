#!/usr/bin/env python3
"""Incremental patches for navares. Idempotent."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MARS = ROOT / "src/components/MarsGlobe.tsx"
APP = ROOT / "src/App.tsx"
INFO = ROOT / "src/components/InfoMenu.tsx"

def once(text, old, new, label):
    if old not in text:
        # already applied?
        if new[:60] in text or (label.startswith("app-") and "globeReady" in text and label != "app-globeReady-state"):
            print(f"SKIP: {label}")
            return text
        raise SystemExit(f"FAIL: not found: {label}")
    if text.count(old) != 1:
        raise SystemExit(f"FAIL: {label} count={text.count(old)}")
    print(f"OK: {label}")
    return text.replace(old, new, 1)

def patch_mars(text):
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
        text = once(
            text,
            "    setIsReady(true);",
            "    setIsReady(true);\n"
            "    onGlobeReady?.(true);",
            "mars-call-onGlobeReady",
        )
    else:
        print("SKIP: mars onGlobeReady already present")

    if 'z-[100]' not in text and 'ILoveMars' in text:
        text = once(
            text,
            '        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-30">',
            '        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-[100]">',
            "loading-z-index",
        )
    elif 'z-[100]' in text:
        print("SKIP: loading z-index")
    return text

def patch_app(text):
    if "globeReady" not in text:
        text = once(
            text,
            "  const globeRef = useRef<MarsGlobeHandle | null>(null);\n",
            "  const globeRef = useRef<MarsGlobeHandle | null>(null);\n"
            "  const [globeReady, setGlobeReady] = useState(false);\n",
            "app-globeReady-state",
        )
    else:
        print("SKIP: globeReady state")

    if "onGlobeReady={setGlobeReady}" not in text:
        text = once(
            text,
            "        onSiteRectComplete={setSiteBounds}\n"
            "      />\n",
            "        onSiteRectComplete={setSiteBounds}\n"
            "        onGlobeReady={setGlobeReady}\n"
            "      />\n",
            "app-pass-onGlobeReady",
        )
    else:
        print("SKIP: onGlobeReady prop")

    if "globeReady &&" not in text:
        # open wrapper after MarsGlobe
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
        # close before </main> — match actual source
        text = once(
            text,
            "      {/* Top-Right 3-Dot Menu */}\n"
            "      <InfoMenu hasTargetCardOpen={Boolean(selectedTarget)} />\n"
            "    </main>\n",
            "      {/* Top-Right 3-Dot Menu */}\n"
            "      <InfoMenu hasTargetCardOpen={Boolean(selectedTarget)} />\n"
            "        </>\n"
            "      )}\n"
            "    </main>\n",
            "app-wrap-hud-close",
        )
    else:
        print("SKIP: HUD wrapper")
    return text

def patch_info(text):
    if "Loading Screen Mars Image" not in text:
        needle = "  {\n    title: 'Mission Photography',"
        insert = (
            "  {\n"
            "    title: 'Loading Screen Mars Image',\n"
            "    description: (\n"
            "      <>\n"
            "        True-color full-disk view of Mars shown while the 3D globe initializes. Based on\n"
            "        Emirates Mars Mission (Hope) EXI imagery acquired around{' '}\n"
            "        <span className=\"font-mono-tabular text-slate-200\">30 August 2021</span>, processed\n"
            "        into natural color by{' '}\n"
            "        <em className=\"text-slate-300\">Kevin M. Gill</em> (filters f635 / f546 / f437;\n"
            "        CU/LASP EMM/EXI). Source:{' '}\n"
            "        <a\n"
            "          href=\"https://commons.wikimedia.org/wiki/File:Mars_-_August_30_2021_-_Flickr_-_Kevin_M._Gill.png\"\n"
            "          target=\"_blank\"\n"
            "          rel=\"noreferrer\"\n"
            "          className=\"text-cyan-300 underline underline-offset-2 hover:text-cyan-200\"\n"
            "        >\n"
            "          Wikimedia Commons\n"
            "        </a>{' '}/ Flickr; license{' '}\n"
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
    else:
        print("SKIP: loading image attribution")
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
        print("InfoMenu skip")

if __name__ == "__main__":
    main()
