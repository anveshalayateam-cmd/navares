#!/usr/bin/env python3
from pathlib import Path

MARS = Path(__file__).resolve().parents[1] / "src/components/MarsGlobe.tsx"
text = MARS.read_text(encoding="utf-8")

if "moonPositionAt" in text and "Model.fromGltfAsync" in text:
    print("Already has full moon setup")
    raise SystemExit(0)

SETUP = r'''
    // ---- Phobos & Deimos load (NASA/JPL-Caltech glTF; JPL Horizons MAR099) ----
    // True mean radii (Ernst et al. 2023); semi-major axes ~9375 km / ~23458 km from Mars center.
    // Positions advance in real time from Horizons-synced or published mean Keplerian elements.
    const CesiumMoon = (window as unknown as { Cesium: any }).Cesium;
    const moonMu = 4.282837e13; // Mars GM m^3/s^2
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

    for (const moon of MARS_MOONS) {
      const elem = moonElementsRef.current[moon.id];
      if (!elem) continue;
      const pos = moonPositionAt(elem, Date.now());
      CesiumMoon.Model.fromGltfAsync({
        url: moon.modelUrl,
        modelMatrix: CesiumMoon.Transforms.eastNorthUpToFixedFrame(pos),
        scale: moon.meanRadiusMeters,
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

    refreshMoonEphemerides(moonElementsRef.current).then((next) => {
      moonElementsRef.current = next;
    });

'''

anchor = "    // Keep the loading image up for at least 10s; if the globe is slower, wait for it."
if anchor not in text:
    raise SystemExit("FAIL: loading anchor missing")
if "Model.fromGltfAsync" in text:
    print("Model load already present")
else:
    text = text.replace(anchor, SETUP + "\n" + anchor, 1)
    print("OK: inserted moon setup")

MARS.write_text(text, encoding="utf-8")
print("Wrote", MARS, "len", len(text))
