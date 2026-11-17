#!/usr/bin/env python3
"""Restore full InfoMenu.tsx from last known-good commit and add CTX attribution."""
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
INFO = ROOT / "src/components/InfoMenu.tsx"
GOOD_URL = (
    "https://raw.githubusercontent.com/anveshalayateam-cmd/navares/"
    "7c2bd225aae76e06457e8a720404c2a55861d667/src/components/InfoMenu.tsx"
)

NEW_BLOCK = '''  {
    title: 'Optical Surface Imagery',
    description: (
      <>
        NASA Mars Trek / Viking Orbiter MDIM 2.1 Colorized Global Mosaic (
        <span className="font-mono-tabular text-slate-200">232m/px</span>) \u2014{' '}
        <em className="text-slate-300">NASA / JPL / USGS Astrogeology / Esri</em>.
      </>
    ),
  },
  {
    title: 'High-Resolution Orbital Detail',
    description: (
      <>
        High-Resolution Orbital Detail: Bruce Murray Laboratory for Planetary Visualization
        (Caltech) / NASA MRO CTX Global Mosaic (
        <span className="font-mono-tabular text-slate-200">~5 m/px</span>, opt-in Extra Details
        overlay across Optical, Elevation, Temperature, and Radiation modes;{' '}
        <span className="font-mono-tabular text-slate-200">murray-lab.caltech.edu/CTX/</span>
        ) \u2014 <em className="text-slate-300">NASA / JPL / MSSS / Caltech Murray Lab</em>.
      </>
    ),
  },
'''

def restore():
    print(f"Fetching {GOOD_URL}")
    data = urllib.request.urlopen(GOOD_URL, timeout=60).read()
    text = data.decode("utf-8")
    if "export function InfoMenu" not in text:
        raise SystemExit("Downloaded file missing export function InfoMenu")

    if "High-Resolution Orbital Detail" in text:
        print("Attribution already present")
    else:
        # Replace the first DATA_ATTRIBUTIONS entry (Optical Surface Imagery) by matching
        # from its title through the closing of that object, before the next title.
        pattern = re.compile(
            r"  \{\n"
            r"    title: 'Optical Surface Imagery',\n"
            r"    description: \([\s\S]*?\n"
            r"    \),\n"
            r"  \},\n",
            re.M,
        )
        m = pattern.search(text)
        if not m:
            raise SystemExit("FAIL: could not locate Optical Surface Imagery block")
        # Use em-dash character directly
        new_block = NEW_BLOCK.replace("\\u2014", "\u2014")
        text = text[: m.start()] + new_block + text[m.end() :]
        print("Added High-Resolution Orbital Detail attribution")

    INFO.write_text(text)
    body = INFO.read_text()
    assert "export function InfoMenu" in body
    assert "High-Resolution Orbital Detail" in body
    assert "MarsClockWidget" in body
    print(f"Wrote {INFO} ({INFO.stat().st_size} bytes)")

if __name__ == "__main__":
    restore()
