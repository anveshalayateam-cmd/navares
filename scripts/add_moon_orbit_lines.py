#!/usr/bin/env python3
from pathlib import Path

MARS = Path(__file__).resolve().parents[1] / "src/components/MarsGlobe.tsx"
text = MARS.read_text(encoding="utf-8")

if "moon-orbit-ring" in text or "moonOrbitEntitiesRef" in text:
    print("Already has moon orbit lines")
    raise SystemExit(0)

# 1) Ref next to moonPrimitivesRef
old_ref = (
    "  const moonPrimitivesRef = useRef<Map<string, any>>(new Map());\n"
    "  const moonElementsRef = useRef<Record<string, LiveMoonElements>>(loadCachedMoonElements());\n"
)
new_ref = (
    "  const moonPrimitivesRef = useRef<Map<string, any>>(new Map());\n"
    "  // eslint-disable-next-line @typescript-eslint/no-explicit-any\n"
    "  const moonOrbitEntitiesRef = useRef<Map<string, any>>(new Map());\n"
    "  const moonElementsRef = useRef<Record<string, LiveMoonElements>>(loadCachedMoonElements());\n"
)
if old_ref not in text:
    raise SystemExit("FAIL: moon refs anchor")
text = text.replace(old_ref, new_ref, 1)
print("OK: orbit ref")

# 2) After model load loop, before refreshMoonEphemerides — create glowing orbit polylines
old_refresh = "    refreshMoonEphemerides(moonElementsRef.current).then((next) => {"
if old_refresh not in text:
    raise SystemExit("FAIL: refreshMoonEphemerides anchor")

ORBIT_LINES = r'''
    // Faint glowing orbital paths (full 360°) for Phobos & Deimos
    const moonOrbitColors: Record<string, string> = {
      phobos: '#e8c4a0',
      deimos: '#b8c4d4',
    };
    for (const moon of MARS_MOONS) {
      const elem = moonElementsRef.current[moon.id];
      if (!elem) continue;
      const steps = 128;
      const sampleOrbit = (epochMs: number) => {
        const pts: any[] = [];
        const baseMa = elem.meanAnomalyAtEpochDeg;
        for (let s = 0; s <= steps; s++) {
          const maDeg = baseMa + (360 * s) / steps;
          const sampleElem = { ...elem, meanAnomalyAtEpochDeg: maDeg, epochMs: elem.epochMs };
          pts.push(moonPositionAt(sampleElem, elem.epochMs));
        }
        return pts;
      };
      // Callback so the ring tracks live Horizons updates without recreating the entity
      let cachedPts: any[] = sampleOrbit(Date.now());
      let lastSample = 0;
      const positions = new CesiumMoon.CallbackProperty(() => {
        const now = performance.now();
        if (now - lastSample > 5000) {
          lastSample = now;
          const live = moonElementsRef.current[moon.id];
          if (live) {
            const pts: any[] = [];
            for (let s = 0; s <= steps; s++) {
              const maDeg = live.meanAnomalyAtEpochDeg + (360 * s) / steps;
              pts.push(
                moonPositionAt(
                  { ...live, meanAnomalyAtEpochDeg: maDeg, epochMs: live.epochMs },
                  live.epochMs
                )
              );
            }
            cachedPts = pts;
          }
        }
        return cachedPts;
      }, false);

      const glowColor = CesiumMoon.Color.fromCssColorString(
        moonOrbitColors[moon.id] ?? '#d4c4a8'
      );
      const ring = viewer.entities.add({
        id: `moon-orbit-ring-${moon.id}`,
        name: `${moon.name} orbit`,
        show: true,
        polyline: {
          positions,
          width: 2.0,
          material: new CesiumMoon.PolylineGlowMaterialProperty({
            glowPower: 0.18,
            taperPower: 1.0,
            color: glowColor.withAlpha(0.45),
          }),
        },
      });
      moonOrbitEntitiesRef.current.set(moon.id, ring);
    }

'''

text = text.replace(old_refresh, ORBIT_LINES + "\n" + old_refresh, 1)
print("OK: orbit entities")

# 3) Cleanup
if "moonOrbitEntitiesRef.current" in text and "moonOrbitEntitiesRef.current.forEach" not in text:
    # After moonPrimitives cleanup if present, else before cloudShell
    if "moonPrimitivesRef.current.forEach" in text:
        old_c = (
            "      moonPrimitivesRef.current.forEach((prim) => {\n"
            "        try {\n"
            "          if (prim && viewer && !viewer.isDestroyed()) {\n"
            "            if (viewer.scene.primitives.contains(prim)) viewer.scene.primitives.remove(prim);\n"
            "            else if (prim.id && viewer.entities.getById(prim.id)) viewer.entities.remove(prim);\n"
            "          }\n"
            "        } catch { /* ignore */ }\n"
            "      });\n"
            "      moonPrimitivesRef.current.clear();\n"
        )
        new_c = old_c + (
            "      moonOrbitEntitiesRef.current.forEach((ent) => {\n"
            "        try {\n"
            "          if (ent && viewer && !viewer.isDestroyed()) viewer.entities.remove(ent);\n"
            "        } catch { /* ignore */ }\n"
            "      });\n"
            "      moonOrbitEntitiesRef.current.clear();\n"
        )
        if old_c in text:
            text = text.replace(old_c, new_c, 1)
            print("OK: orbit cleanup")
        else:
            print("WARN: cleanup pattern mismatch")
    else:
        print("WARN: no moonPrimitives cleanup to extend")

MARS.write_text(text, encoding="utf-8")
print("Wrote", MARS)
