#!/usr/bin/env python3
"""Inject Phobos & Deimos 3D entities + orbit sync into MarsGlobe and InfoMenu."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARS = ROOT / "src/components/MarsGlobe.tsx"
INFO = ROOT / "src/components/InfoMenu.tsx"
APP = ROOT / "src/App.tsx"

def once(text, old, new, label):
    if old not in text:
        if new[:40] in text:
            print(f"SKIP: {label}")
            return text
        raise SystemExit(f"FAIL: {label}\n--- looking for ---\n{old[:200]}")
    if text.count(old) != 1:
        raise SystemExit(f"FAIL count={text.count(old)}: {label}")
    print(f"OK: {label}")
    return text.replace(old, new, 1)

# ---------- MarsGlobe ----------
text = MARS.read_text(encoding="utf-8")

if "MARS_MOONS" not in text:
    text = once(
        text,
        "import { getGlobalMarsCloudCanvas } from '../utils/marsClouds';\n",
        "import { getGlobalMarsCloudCanvas } from '../utils/marsClouds';\n"
        "import { MARS_MOONS } from '../data/marsMoons';\n"
        "import {\n"
        "  LiveMoonElements,\n"
        "  loadCachedMoonElements,\n"
        "  refreshMoonEphemerides,\n"
        "} from '../services/marsMoonSync';\n",
        "imports",
    )

# Ref for moon primitives after cloudShellPrimitiveRef
if "moonPrimitivesRef" not in text:
    text = once(
        text,
        "  const cloudShellPrimitiveRef = useRef<any>(null);\n",
        "  const cloudShellPrimitiveRef = useRef<any>(null);\n"
        "  // Phobos & Deimos Cesium Model entities (NASA glTF)\n"
        "  // eslint-disable-next-line @typescript-eslint/no-explicit-any\n"
        "  const moonPrimitivesRef = useRef<Map<string, any>>(new Map());\n"
        "  const moonElementsRef = useRef<Record<string, LiveMoonElements>>(loadCachedMoonElements());\n",
        "moon-refs",
    )

# After setIsReady block starts the orbit tick - inject moon setup before setIsReady
# Find a stable anchor: initial cloud opacity setup ends, or after cloud primitive add

MOON_SETUP = r'''
    // ---- Phobos & Deimos (NASA/JPL-Caltech glTF models, JPL Horizons MAR099 orbits) ----
    // Illustration-grade: true mean radii (Ernst 2023) and semi-major axes; positions
    // advance in real time from Horizons-synced (or published mean) Keplerian elements.
    const CesiumMoon = (window as unknown as { Cesium: any }).Cesium;
    const moonMu = 4.282837e13; // Mars GM m^3/s^2 (approx, matches marsData)
    const moonMarsRot0 = 176.63;
    const moonMarsWdot = 350.89198226;

    const solveKeplerE = (M: number, e: number) => {
      let E = M + e * Math.sin(M);
      for (let i = 0; i < 5; i++) {
        const f = E - e * Math.sin(E) - M;
        E -= f / (1 - e * Math.cos(E));
      }
      return E;
    };

    const moonPositionAt = (elem: LiveMoonElements, epochMs: number) => {
      const a = elem.semiMajorAxisMeters;
      const e = elem.eccentricity;
      const n = Math.sqrt(moonMu / (a * a * a));
      const dt = (epochMs - elem.epochMs) / 1000;
      const M =
        ((((elem.meanAnomalyAtEpochDeg * Math.PI) / 180 + n * dt) % (Math.PI * 2)) +
          Math.PI * 2) %
        (Math.PI * 2);
      const E = solveKeplerE(M, e);
      const trueAnom =
        2 *
        Math.atan2(
          Math.sqrt(1 + e) * Math.sin(E / 2),
          Math.sqrt(1 - e) * Math.cos(E / 2)
        );
      const r = a * (1 - e * Math.cos(E));
      const i = (elem.inclinationDeg * Math.PI) / 180;
      const O = (elem.raanDeg * Math.PI) / 180;
      const w = (elem.argPeriapsisDeg * Math.PI) / 180;
      const u = w + trueAnom;
      const xMci = r * (Math.cos(O) * Math.cos(u) - Math.sin(O) * Math.sin(u) * Math.cos(i));
      const yMci = r * (Math.sin(O) * Math.cos(u) + Math.cos(O) * Math.sin(u) * Math.cos(i));
      const zMci = r * (Math.sin(u) * Math.sin(i));
      // MCI → body-fixed (IAU_MARS sidereal)
      const days = (epochMs - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86_400_000;
      const wMars = ((moonMarsRot0 + moonMarsWdot * days) * Math.PI) / 180;
      const cosW = Math.cos(wMars);
      const sinW = Math.sin(wMars);
      return new CesiumMoon.Cartesian3(
        xMci * cosW + yMci * sinW,
        -xMci * sinW + yMci * cosW,
        zMci
      );
    };

    // Load NASA glTF models (CORS-enabled assets.science.nasa.gov)
    for (const moon of MARS_MOONS) {
      const elem = moonElementsRef.current[moon.id];
      if (!elem) continue;
      const pos = moonPositionAt(elem, Date.now());
      // Model unit scale is arbitrary; fit mean radius in meters.
      // NASA Phobos/Deimos glbs are roughly unit-sized (~1–2 m); scale to true radius.
      const modelScale = moon.meanRadiusMeters; // meters
      CesiumMoon.Model.fromGltfAsync({
        url: moon.modelUrl,
        modelMatrix: CesiumMoon.Transforms.eastNorthUpToFixedFrame(pos),
        scale: modelScale,
        minimumPixelSize: 12,
        maximumScale: moon.meanRadiusMeters * 40,
        silhouetteColor: CesiumMoon.Color.fromCssColorString('#c4b5a0').withAlpha(0.35),
        silhouetteSize: 1.0,
      })
        .then((model: any) => {
          if (!viewer || viewer.isDestroyed()) return;
          viewer.scene.primitives.add(model);
          moonPrimitivesRef.current.set(moon.id, model);
        })
        .catch(() => {
          // Fallback: small ellipsoid if glTF fails to load
          const fallback = viewer.entities.add({
            id: `moon-${moon.id}`,
            name: moon.name,
            position: pos,
            ellipsoid: {
              radii: new CesiumMoon.Cartesian3(
                moon.meanRadiusMeters,
                moon.meanRadiusMeters,
                moon.meanRadiusMeters * 0.9
              ),
              material: CesiumMoon.Color.fromCssColorString('#a89078'),
            },
          });
          moonPrimitivesRef.current.set(moon.id, fallback);
        });
    }

    // Keep moon ephemeris fresh (JPL Horizons when online)
    refreshMoonEphemerides(moonElementsRef.current).then((next) => {
      moonElementsRef.current = next;
    });

'''

# Insert moon setup just before setIsReady / min-10s loading block
if "Phobos & Deimos" not in text:
    anchor = "    // Keep the loading image up for at least 10s; if the globe is slower, wait for it."
    if anchor not in text:
        # older pattern
        anchor = "    setIsReady(true);\n    onGlobeReady?.(true);"
        if anchor not in text:
            raise SystemExit("FAIL: cannot find setIsReady anchor")
        text = text.replace(anchor, MOON_SETUP + "\n" + anchor, 1)
    else:
        text = text.replace(anchor, MOON_SETUP + "\n" + anchor, 1)
    print("OK: moon-setup")

# Update moon positions inside the existing requestAnimationFrame tickOrbit
# Look for rafId = requestAnimationFrame(tickOrbit) and inject before it in the tick function
MOON_TICK = r'''
      // Update Phobos & Deimos model matrices (real-time Keplerian / Horizons)
      if (moonPrimitivesRef.current.size > 0) {
        const nowMs = Date.now();
        for (const moon of MARS_MOONS) {
          const prim = moonPrimitivesRef.current.get(moon.id);
          const elem = moonElementsRef.current[moon.id];
          if (!prim || !elem) continue;
          const p = moonPositionAt(elem, nowMs);
          if (prim.modelMatrix) {
            // Cesium.Model
            const enu = CesiumMoon.Transforms.eastNorthUpToFixedFrame(p);
            const scale = CesiumMoon.Matrix4.fromScale(
              new CesiumMoon.Cartesian3(
                moon.meanRadiusMeters,
                moon.meanRadiusMeters,
                moon.meanRadiusMeters
              )
            );
            prim.modelMatrix = CesiumMoon.Matrix4.multiply(enu, scale, new CesiumMoon.Matrix4());
          } else if (prim.position) {
            // Entity fallback
            prim.position = p;
          }
        }
      }

'''

if "Update Phobos & Deimos model matrices" not in text:
    # Insert near end of tickOrbit, before closing of the function - use onLiveSatellitesUpdate as nearby
    marker = "        onLiveSatellitesUpdateRef.current(satUpdates);"
    if marker not in text:
        raise SystemExit("FAIL: tickOrbit satellite update marker")
    text = text.replace(marker, marker + "\n" + MOON_TICK, 1)
    print("OK: moon-tick")

# Cleanup on unmount
if "moonPrimitivesRef.current" in text and "moonPrimitivesRef.current.forEach" not in text:
    cleanup_anchor = "      if (cloudShellPrimitiveRef.current && !viewer.isDestroyed()) {"
    if cleanup_anchor in text:
        text = text.replace(
            cleanup_anchor,
            "      moonPrimitivesRef.current.forEach((prim) => {\n"
            "        try {\n"
            "          if (prim && viewer && !viewer.isDestroyed()) {\n"
            "            if (viewer.scene.primitives.contains(prim)) viewer.scene.primitives.remove(prim);\n"
            "            else if (prim.id && viewer.entities.getById(prim.id)) viewer.entities.remove(prim);\n"
            "          }\n"
            "        } catch { /* ignore */ }\n"
            "      });\n"
            "      moonPrimitivesRef.current.clear();\n"
            + cleanup_anchor,
            1,
        )
        print("OK: moon-cleanup")

MARS.write_text(text, encoding="utf-8")
print("Wrote", MARS)

# ---------- InfoMenu attribution ----------
info = INFO.read_text(encoding="utf-8")
if "Phobos & Deimos" not in info and "Loading Screen Mars Image" in info:
    needle = "  {\n    title: 'Loading Screen Mars Image',"
    insert = (
        "  {\n"
        "    title: 'Phobos & Deimos 3D Models & Orbits',\n"
        "    description: (\n"
        "      <>\n"
        "        Interactive 3D models of Mars\u2019 moons for illustration. Models:{' '}\n"
        "        <em className=\"text-slate-300\">NASA/JPL-Caltech</em> Science 3D Resources\n"
        "        (glTF) —{' '}\n"
        "        <a\n"
        "          href=\"https://science.nasa.gov/resource/phobos-mars-moon-3d-model/\"\n"
        "          target=\"_blank\"\n"
        "          rel=\"noreferrer\"\n"
        "          className=\"text-cyan-300 underline underline-offset-2 hover:text-cyan-200\"\n"
        "        >\n"
        "          Phobos\n"
        "        </a>{' '}&amp;{' '}\n"
        "        <a\n"
        "          href=\"https://science.nasa.gov/resource/deimos-mars-moon-3d-model/\"\n"
        "          target=\"_blank\"\n"
        "          rel=\"noreferrer\"\n"
        "          className=\"text-cyan-300 underline underline-offset-2 hover:text-cyan-200\"\n"
        "        >\n"
        "          Deimos\n"
        "        </a>\n"
        "        . Mean radii from Ernst et al. 2023. Real-time orbital elements synchronized\n"
        "        from{' '}\n"
        "        <em className=\"text-slate-300\">NASA JPL Horizons</em> (MAR099 ephemerides;\n"
        "        Brozović, Jacobson &amp; Park 2025) when online, with published mean geometric\n"
        "        elements as offline fallback. Phobos ~6,000 km above the surface; Deimos\n"
        "        ~20,000 km (semi-major axes ~9,375 km and ~23,458 km from Mars center).\n"
        "      </>\n"
        "    ),\n"
        "  },\n"
        "  {\n"
        "    title: 'Loading Screen Mars Image',"
    )
    info = info.replace(needle, insert, 1)
    INFO.write_text(info, encoding="utf-8")
    print("Wrote InfoMenu attribution")
elif "Phobos & Deimos" in info:
    print("SKIP: InfoMenu moons attribution")
else:
    print("WARN: InfoMenu pattern not found")

print("done")
