#!/usr/bin/env python3
"""Restore full InfoMenu.tsx from last known-good commit and add CTX attribution."""
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
INFO = ROOT / "src/components/InfoMenu.tsx"
GOOD_URL = (
    "https://raw.githubusercontent.com/anveshalayateam-cmd/navares/"
    "7c2bd225aae76e06457e8a720404c2a55861d667/src/components/InfoMenu.tsx"
)

def restore():
    print(f"Fetching {GOOD_URL}")
    data = urllib.request.urlopen(GOOD_URL, timeout=60).read()
    text = data.decode("utf-8")
    if "export function InfoMenu" not in text:
        raise SystemExit("Downloaded file missing export function InfoMenu")
    old = """  {
    title: 'Optical Surface Imagery',
    description: (
      <>
        NASA Mars Trek / Viking Orbiter MDIM 2.1 Colorized Global Mosaic (
        <span className=\"font-mono-tabular text-slate-200\">232m/px</span>) & Caltech Bruce
        Murray Lab Global MRO CTX Mosaic V01 (
        <span className=\"font-mono-tabular text-slate-200\">5m/px</span>,{' '}
        <span className=\"font-mono-tabular text-slate-200\">murray-lab.caltech.edu/CTX/</span>) —{' '}
        <em className=\"text-slate-300\">
          NASA / JPL / MSSS / Caltech Murray Lab / USGS Astrogeology / Esri
        </em>
        .
      </>
    ),
  },
"""
    new = """  {
    title: 'Optical Surface Imagery',
    description: (
      <>
        NASA Mars Trek / Viking Orbiter MDIM 2.1 Colorized Global Mosaic (
        <span className=\"font-mono-tabular text-slate-200\">232m/px</span>) —{' '}
        <em className=\"text-slate-300\">NASA / JPL / USGS Astrogeology / Esri</em>.
      </>
    ),
  },
  {
    title: 'High-Resolution Orbital Detail',
    description: (
      <>
        High-Resolution Orbital Detail: Bruce Murray Laboratory for Planetary Visualization
        (Caltech) / NASA MRO CTX Global Mosaic (
        <span className=\"font-mono-tabular text-slate-200\">~5 m/px</span>, opt-in Extra Details
        overlay across Optical, Elevation, Temperature, and Radiation modes;{' '}
        <span className=\"font-mono-tabular text-slate-200\">murray-lab.caltech.edu/CTX/</span>
        ) — <em className=\"text-slate-300\">NASA / JPL / MSSS / Caltech Murray Lab</em>.
      </>
    ),
  },
"""
    if "High-Resolution Orbital Detail" in text:
        print("Attribution already present")
    elif old in text:
        text = text.replace(old, new, 1)
        print("Added High-Resolution Orbital Detail attribution")
    else:
        print("WARN: attribution pattern not found; writing restored original")
    INFO.write_text(text)
    assert "export function InfoMenu" in INFO.read_text()
    print(f"Wrote {INFO} ({INFO.stat().st_size} bytes)")

if __name__ == "__main__":
    restore()
