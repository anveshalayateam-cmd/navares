#!/usr/bin/env python3
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "src/App.tsx"
text = APP.read_text(encoding="utf-8")

if "globeReady" in text:
    print("Already applied")
    raise SystemExit(0)

# 1) state
old = "  const globeRef = useRef<MarsGlobeHandle | null>(null);\n"
new = (
    "  const globeRef = useRef<MarsGlobeHandle | null>(null);\n"
    "  const [globeReady, setGlobeReady] = useState(false);\n"
)
if old not in text:
    raise SystemExit("FAIL state anchor")
text = text.replace(old, new, 1)
print("OK state")

# 2) prop on MarsGlobe
old = "        onSiteRectComplete={setSiteBounds}\n      />\n"
new = (
    "        onSiteRectComplete={setSiteBounds}\n"
    "        onGlobeReady={setGlobeReady}\n"
    "      />\n"
)
if old not in text:
    raise SystemExit("FAIL prop anchor")
text = text.replace(old, new, 1)
print("OK prop")

# 3) wrap HUD
old = (
    "      />\n\n"
    "      {/* Control 1: Top-Left Floating Search & Quick-Jump Pill */}\n"
)
# after onGlobeReady line the /> is already replaced - find unique
marker = "        onGlobeReady={setGlobeReady}\n      />\n\n      {/* Control 1: Top-Left Floating Search & Quick-Jump Pill */}\n"
if marker not in text:
    raise SystemExit("FAIL open marker")
text = text.replace(
    marker,
    "        onGlobeReady={setGlobeReady}\n"
    "      />\n\n"
    "      {globeReady && (\n"
    "        <>\n"
    "      {/* Control 1: Top-Left Floating Search & Quick-Jump Pill */}\n",
    1,
)
print("OK open")

old = (
    "      {/* Top-Right 3-Dot Menu */}\n"
    "      <InfoMenu hasTargetCardOpen={Boolean(selectedTarget)} />\n"
    "    </main>\n"
)
new = (
    "      {/* Top-Right 3-Dot Menu */}\n"
    "      <InfoMenu hasTargetCardOpen={Boolean(selectedTarget)} />\n"
    "        </>\n"
    "      )}\n"
    "    </main>\n"
)
if old not in text:
    raise SystemExit("FAIL close marker")
text = text.replace(old, new, 1)
print("OK close")

APP.write_text(text, encoding="utf-8")
print("Wrote", APP)
