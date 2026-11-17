#!/usr/bin/env python3
"""Apply Extra Details (Murray Lab CTX) across all map modes + MOLA footer lock."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def once(text, old, new, label):
    if old not in text:
        if new[:80] in text or label in text:
            print(f"SKIP: {label}")
            return text
        raise SystemExit(f"FAIL: not found: {label}\n---\n{old[:200]}")
    if text.count(old) != 1:
        raise SystemExit(f"FAIL: {label} count={text.count(old)}")
    print(f"OK: {label}")
    return text.replace(old, new, 1)

def patch_app(text):
    text = once(
        text,
        "  const [showSatellites, setShowSatellites] = useState<boolean>(false);\n  const [showRovers, setShowRovers] = useState<boolean>(false);\n",
        "  const [showSatellites, setShowSatellites] = useState<boolean>(false);\n  const [showRovers, setShowRovers] = useState<boolean>(false);\n  const [extraDetails, setExtraDetails] = useState<boolean>(false);\n",
        "app-extraDetails-state",
    )
    text = once(
        text,
        "        onGlobeReady={setGlobeReady}\n      />\n",
        "        extraDetails={extraDetails}\n        onGlobeReady={setGlobeReady}\n      />\n",
        "app-extraDetails-prop",
    )
    text = once(
        text,
        """      <SearchBar\n        onSelectAndFly={handleSearchSelectAndFly}\n        liveRovers={liveRovers}\n        customPins={customPins}\n      />\n""",
        """      <SearchBar\n        onSelectAndFly={handleSearchSelectAndFly}\n        liveRovers={liveRovers}\n        customPins={customPins}\n      />\n\n      {/* Opt-in Murray Lab CTX high-res detail (all map modes) */}\n      <div className=\"pointer-events-auto fixed top-[3.75rem] left-2.5 sm:top-[4.25rem] sm:left-4 z-30\">\n        <button\n          type=\"button\"\n          aria-pressed={extraDetails}\n          aria-label={extraDetails ? 'Disable Extra Details (Murray Lab CTX)' : 'Enable Extra Details (Murray Lab CTX)'}\n          title={\n            extraDetails\n              ? 'Hide high-resolution orbital detail (Murray Lab CTX)'\n              : 'Show high-resolution orbital detail (Murray Lab CTX ~5 m/px)'\n          }\n          onClick={() => setExtraDetails((prev) => !prev)}\n          className={`group flex h-9 md:h-10 items-center justify-center rounded-2xl border px-2.5 md:px-3 text-xs font-medium backdrop-blur-md shadow-2xl transition-all duration-200 cursor-pointer whitespace-nowrap hover:px-3.5 focus-visible:px-3.5 ${\n            extraDetails\n              ? 'border-amber-400/60 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30'\n              : 'border-white/15 bg-[#0B0F17]/82 text-slate-200 hover:bg-white/10 hover:text-white'\n          }`}\n        >\n          <svg\n            className={`h-4 w-4 shrink-0 ${extraDetails ? 'text-amber-300' : 'text-slate-400'}`}\n            viewBox=\"0 0 24 24\"\n            fill=\"none\"\n            stroke=\"currentColor\"\n            strokeWidth=\"2\"\n            strokeLinecap=\"round\"\n            strokeLinejoin=\"round\"\n            aria-hidden=\"true\"\n          >\n            <circle cx=\"12\" cy=\"12\" r=\"3\" />\n            <path d=\"M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41\" />\n          </svg>\n          <span className=\"max-w-0 overflow-hidden opacity-0 transition-all duration-200 group-hover:ml-2 group-hover:max-w-[14rem] group-hover:opacity-100 group-focus-visible:ml-2 group-focus-visible:max-w-[14rem] group-focus-visible:opacity-100\">\n            Extra Details\n          </span>\n        </button>\n      </div>\n""",
        "app-extraDetails-button",
    )
    return text

def patch_mars(text):
    text = once(
        text,
        "  onSiteRectComplete: (bounds: SiteBounds) => void;\n  onGlobeReady?: (ready: boolean) => void;\n}\n",
        "  onSiteRectComplete: (bounds: SiteBounds) => void;\n  onGlobeReady?: (ready: boolean) => void;\n  /** Opt-in Caltech Murray Lab CTX ~5 m/px detail overlay (all map modes). */\n  extraDetails?: boolean;\n}\n",
        "mars-props-extraDetails",
    )
    text = once(
        text,
        "    onSiteRectComplete,\n    onGlobeReady,\n  },\n  ref\n) {\n",
        "    onSiteRectComplete,\n    onGlobeReady,\n    extraDetails = false,\n  },\n  ref\n) {\n",
        "mars-destructure-extraDetails",
    )
    if "extraDetailsRef" not in text:
        text = once(
            text,
            "  const mapStyleRef = useRef<MapStyleMode>(mapStyle);\n",
            "  const mapStyleRef = useRef<MapStyleMode>(mapStyle);\n  const extraDetailsRef = useRef<boolean>(extraDetails);\n  const isOnlineRef = useRef<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);\n",
            "mars-extraDetailsRef-decl",
        )
    if "extraDetailsRef.current = extraDetails" not in text:
        text = once(
            text,
            "  mapStyleRef.current = mapStyle;\n",
            "  mapStyleRef.current = mapStyle;\n  extraDetailsRef.current = extraDetails;\n",
            "mars-extraDetailsRef-assign",
        )
    text = once(
        text,
        """    const unbindCtxErr = ctxProvider.errorEvent.addEventListener((e: { retry?: boolean }) => {\n      if (e) e.retry = false;\n    });\n    const ctxLayer = viewer.imageryLayers.addImageryProvider(ctxProvider);\n""",
        """    const unbindCtxErr = ctxProvider.errorEvent.addEventListener((e: { retry?: boolean }) => {\n      if (e) e.retry = false;\n    });\n    const onOffline = () => {\n      isOnlineRef.current = false;\n      if (ctxLayerRef.current) {\n        ctxLayerRef.current.show = false;\n        ctxLayerRef.current.alpha = 0;\n      }\n    };\n    const onOnline = () => {\n      isOnlineRef.current = true;\n    };\n    window.addEventListener('offline', onOffline);\n    window.addEventListener('online', onOnline);\n    isOnlineRef.current = navigator.onLine;\n    const ctxLayer = viewer.imageryLayers.addImageryProvider(ctxProvider);\n""",
        "mars-offline-handlers",
    )
    if "removeEventListener('offline', onOffline)" not in text:
        text = once(
            text,
            "      unbindCtxErr();\n",
            "      unbindCtxErr();\n      window.removeEventListener('offline', onOffline);\n      window.removeEventListener('online', onOnline);\n",
            "mars-offline-cleanup",
        )
    text = once(
        text,
        """      if (mapStyleRef.current === 'optical' || mapStyleRef.current === 'radiation') {\n        applyOpticalColorForAltitude(\n          vikingLayerRef.current,\n          surfaceRedT,\n          mapStyleRef.current === 'optical'\n        );\n        applyCtxColorForAltitude(ctxLayerRef.current, camClearanceM);\n      }\n      if (ctxLayerRef.current) {\n        ctxLayerRef.current.alpha = ctxOpacity;\n        ctxLayerRef.current.show = mapStyleRef.current === 'optical' && ctxOpacity > 0.003;\n      }\n""",
        """      if (mapStyleRef.current === 'optical' || mapStyleRef.current === 'radiation') {\n        applyOpticalColorForAltitude(\n          vikingLayerRef.current,\n          surfaceRedT,\n          mapStyleRef.current === 'optical'\n        );\n      }\n      if (ctxLayerRef.current) {\n        const wantCtx =\n          extraDetailsRef.current &&\n          isOnlineRef.current &&\n          typeof navigator !== 'undefined' &&\n          navigator.onLine;\n        if (!wantCtx) {\n          ctxLayerRef.current.alpha = 0;\n          ctxLayerRef.current.show = false;\n        } else {\n          const mode = mapStyleRef.current;\n          const targetAlpha = mode === 'optical' ? 0.75 : 0.35;\n          const fadeGate = Math.max(0, Math.min(1, ctxOpacity / Math.max(CTX_MAX_ALPHA, 1e-6)));\n          const alpha = targetAlpha * (0.35 + 0.65 * fadeGate);\n          ctxLayerRef.current.alpha = alpha;\n          ctxLayerRef.current.show = alpha > 0.003;\n          if (mode === 'optical') {\n            applyCtxColorForAltitude(ctxLayerRef.current, camClearanceM);\n          } else {\n            ctxLayerRef.current.hue = 0;\n            ctxLayerRef.current.saturation = 0.15;\n            ctxLayerRef.current.contrast = 1.15;\n            ctxLayerRef.current.brightness = 0.92;\n            ctxLayerRef.current.gamma = 0.95;\n          }\n        }\n      }\n""",
        "mars-ctx-postRender",
    )
    text = once(
        text,
        """    const pickMarsSurfacePoint = (screenPos: unknown) => {\n      const ray = viewer.camera.getPickRay(screenPos);\n      const terrainCartesian = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined;\n      const pickedCartesian =\n        terrainCartesian ?? viewer.camera.pickEllipsoid(screenPos, marsEllipsoid);\n      if (!pickedCartesian) return null;\n      const pickedCartographic = marsEllipsoid.cartesianToCartographic(pickedCartesian);\n      if (!pickedCartographic) return null;\n      const carto = Cesium.Cartographic.fromRadians(\n        pickedCartographic.longitude,\n        pickedCartographic.latitude,\n        0\n      );\n      const latDeg = Cesium.Math.toDegrees(carto.latitude);\n      const lonDeg = Cesium.Math.toDegrees(carto.longitude);\n      const elevMeters = sampleElevationAt(lonDeg, latDeg);\n""",
        """    const pickMarsSurfacePoint = (screenPos: unknown) => {\n      // Footer elev ALWAYS from local 16-bit MOLA via sampleElevationAt — never cartographic.height / globe.getHeight().\n      const ray = viewer.camera.getPickRay(screenPos);\n      const terrainCartesian = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined;\n      const pickedCartesian =\n        terrainCartesian ?? viewer.camera.pickEllipsoid(screenPos, marsEllipsoid);\n      if (!pickedCartesian) return null;\n      const pickedCartographic = marsEllipsoid.cartesianToCartographic(pickedCartesian);\n      if (!pickedCartographic) return null;\n      const carto = Cesium.Cartographic.fromRadians(\n        pickedCartographic.longitude,\n        pickedCartographic.latitude,\n        0\n      );\n      const latDeg = Cesium.Math.toDegrees(carto.latitude);\n      const lonDeg = Cesium.Math.toDegrees(carto.longitude);\n      const elevMeters = sampleElevationAt(lonDeg, latDeg);\n""",
        "mars-pick-mola-lock",
    )
    return text

def patch_info(text):
    old = """  {\n    title: 'Optical Surface Imagery',\n    description: (\n      <>\n        NASA Mars Trek / Viking Orbiter MDIM 2.1 Colorized Global Mosaic (\n        <span className=\"font-mono-tabular text-slate-200\">232m/px</span>) & Caltech Bruce\n        Murray Lab Global MRO CTX Mosaic V01 (\n        <span className=\"font-mono-tabular text-slate-200\">5m/px</span>,{' '}\n        <span className=\"font-mono-tabular text-slate-200\">murray-lab.caltech.edu/CTX/</span>) —{' '}\n        <em className=\"text-slate-300\">\n          NASA / JPL / MSSS / Caltech Murray Lab / USGS Astrogeology / Esri\n        </em>\n        .\n      </>\n    ),\n  },\n"""
    new = """  {\n    title: 'Optical Surface Imagery',\n    description: (\n      <>\n        NASA Mars Trek / Viking Orbiter MDIM 2.1 Colorized Global Mosaic (\n        <span className=\"font-mono-tabular text-slate-200\">232m/px</span>) —{' '}\n        <em className=\"text-slate-300\">NASA / JPL / USGS Astrogeology / Esri</em>.\n      </>\n    ),\n  },\n  {\n    title: 'High-Resolution Orbital Detail',\n    description: (\n      <>\n        High-Resolution Orbital Detail: Bruce Murray Laboratory for Planetary Visualization\n        (Caltech) / NASA MRO CTX Global Mosaic (\n        <span className=\"font-mono-tabular text-slate-200\">~5 m/px</span>, opt-in Extra Details\n        overlay across Optical, Elevation, Temperature, and Radiation modes;{' '}\n        <span className=\"font-mono-tabular text-slate-200\">murray-lab.caltech.edu/CTX/</span>\n        ) — <em className=\"text-slate-300\">NASA / JPL / MSSS / Caltech Murray Lab</em>.\n      </>\n    ),\n  },\n"""
    return once(text, old, new, "info-ctx-attribution")

def main():
    app_path = ROOT / "src/App.tsx"
    mars_path = ROOT / "src/components/MarsGlobe.tsx"
    info_path = ROOT / "src/components/InfoMenu.tsx"
    app_path.write_text(patch_app(app_path.read_text()))
    mars_path.write_text(patch_mars(mars_path.read_text()))
    info_path.write_text(patch_info(info_path.read_text()))
    print("Done.")

if __name__ == "__main__":
    main()
