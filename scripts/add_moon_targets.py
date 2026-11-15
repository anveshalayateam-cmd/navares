#!/usr/bin/env python3
"""Add Phobos/Deimos as selectable orbiter targets + pick/zoom wiring."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src/data/marsData.ts"
GLOBE = ROOT / "src/components/MarsGlobe.tsx"

# ---------- marsData.ts ----------
data = DATA.read_text(encoding="utf-8")
if "id: 'phobos'" in data or 'id: "phobos"' in data:
    print("SKIP: phobos already in marsData")
else:
    # Insert before closing of EXPANDED_ORBITERS array
    # Find the last makeOrbiterTarget of EXPANDED_ORBITERS — before `];` that closes it
    marker = "const EXPANDED_ORBITERS: MarsTarget[] = ["
    start = data.find(marker)
    if start < 0:
        raise SystemExit("FAIL: EXPANDED_ORBITERS")
    # Find next standalone `];` after start that closes the array (before other const)
    close = data.find("\n];\n", start)
    if close < 0:
        raise SystemExit("FAIL: close EXPANDED_ORBITERS")

    MOONS = r'''
  makeOrbiterTarget({
    id: 'phobos',
    name: 'Phobos (Mars I)',
    shortName: 'Phobos',
    region: 'Inner Martian Moon',
    altitudeKm: 5980,
    inclinationDeg: 1.08,
    raanDeg: 80.5,
    initialPhaseDeg: 42,
    missionStatus: 'Natural Satellite · Tidal Decay',
    agency: 'NASA / JPL-Caltech (3D model & ephemeris)',
    epochOrSol: 'Discovered 1877 · Asaph Hall',
    scientificSignificance:
      'Innermost moon of Mars (~11 km mean radius). Orbits every ~7.65 hours at ~9,375 km from Mars center (~6,000 km above the surface). Tidal forces are slowly lowering its orbit. 3D model: NASA/JPL-Caltech Science 3D Resources. Orbits synchronized from JPL Horizons MAR099.',
    searchKeywords:
      'phobos moon natural satellite mars i stickney crater mmx horizons orbiter',
    photoUrl:
      'https://assets.science.nasa.gov/content/dam/science/psd/mars/resources/list_images/24878_Phobos_1_1000-320x240-1.jpg',
    photoCaption: 'NASA/JPL-Caltech · Phobos 3D model visualization',
    dustRisk: 'Regolith is fine, dark, and loosely bound; Stickney crater dominates the nearside.',
    astronautAdvisory:
      'Illustration-scale moon model. True mean radius ~11 km (Ernst et al. 2023). Future sample-return target for JAXA MMX.',
  }),
  makeOrbiterTarget({
    id: 'deimos',
    name: 'Deimos (Mars II)',
    shortName: 'Deimos',
    region: 'Outer Martian Moon',
    altitudeKm: 20060,
    inclinationDeg: 1.79,
    raanDeg: 40.0,
    initialPhaseDeg: 210,
    missionStatus: 'Natural Satellite · Stable Outer Orbit',
    agency: 'NASA / JPL-Caltech (3D model & ephemeris)',
    epochOrSol: 'Discovered 1877 · Asaph Hall',
    scientificSignificance:
      'Outer moon of Mars (~6.3 km mean radius). Orbits every ~30.3 hours at ~23,458 km from Mars center (~20,000 km above the surface). Nearly circular, low-inclination orbit. 3D model: NASA/JPL-Caltech Science 3D Resources. Orbits synchronized from JPL Horizons MAR099.',
    searchKeywords:
      'deimos moon natural satellite mars ii horizons orbiter outer moon',
    photoUrl:
      'https://assets.science.nasa.gov/content/dam/science/psd/mars/resources/list_images/24879_Deimos_1_1000-320x240-1.jpg',
    photoCaption: 'NASA/JPL-Caltech · Deimos 3D model visualization',
    dustRisk: 'Smoother, dust-mantled surface with fewer large craters than Phobos.',
    astronautAdvisory:
      'Illustration-scale moon model. True mean radius ~6.3 km (Ernst et al. 2023).',
  }),
'''
    data = data[:close] + ",\n" + MOONS + data[close:]
    DATA.write_text(data, encoding="utf-8")
    print("OK: marsData Phobos/Deimos targets")

# ---------- MarsGlobe.tsx ----------
text = GLOBE.read_text(encoding="utf-8")

# Helper set of moon ids near PRIMARY_GLOBAL_SATELLITE_IDS
if "MARS_MOON_TARGET_IDS" not in text:
    old = "const PRIMARY_GLOBAL_SATELLITE_IDS = new Set([\n"
    if old not in text:
        raise SystemExit("FAIL: PRIMARY_GLOBAL_SATELLITE_IDS")
    text = text.replace(
        old,
        "const MARS_MOON_TARGET_IDS = new Set(['phobos', 'deimos']);\n\n" + old,
        1,
    )
    print("OK: MARS_MOON_TARGET_IDS")

# Skip moon ids in generic satellite entity creation
old_sat = "      if (target.category === 'satellite' && target.orbit) {\n        const positionProperty = new Cesium.CallbackProperty(() => {"
if old_sat in text and "MARS_MOON_TARGET_IDS.has(target.id)" not in text[text.find(old_sat):text.find(old_sat)+400]:
    text = text.replace(
        old_sat,
        "      if (target.category === 'satellite' && target.orbit && !MARS_MOON_TARGET_IDS.has(target.id)) {\n        const positionProperty = new Cesium.CallbackProperty(() => {",
        1,
    )
    print("OK: skip moons in spacecraft entity loop")

# Skip moons in live sat position updates (optional)
old_live = """        for (const target of MARS_TARGETS) {
          if (target.category === 'satellite' && target.orbit) {
            const liveElem = liveOrbiterElementsRef.current[target.id]"""
if old_live in text:
    text = text.replace(
        old_live,
        """        for (const target of MARS_TARGETS) {
          if (target.category === 'satellite' && target.orbit && !MARS_MOON_TARGET_IDS.has(target.id)) {
            const liveElem = liveOrbiterElementsRef.current[target.id]""",
        1,
    )
    print("OK: skip moons in live sat updates")

# zoomToTargetInternal — handle moons first
if "zoomToMoonTarget" not in text and "MARS_MOON_TARGET_IDS.has(target.id)" not in text[text.find("const zoomToTargetInternal"):text.find("const zoomToTargetInternal")+500]:
    old_zoom = "  const zoomToTargetInternal = (target: MarsTarget) => {\n    if (target.category === 'satellite' && target.orbit) {"
    if old_zoom not in text:
        raise SystemExit("FAIL: zoomToTargetInternal")
    moon_zoom = r'''  const zoomToTargetInternal = (target: MarsTarget) => {
    // Phobos / Deimos — fly to live moon position from Keplerian / Horizons elements
    if (MARS_MOON_TARGET_IDS.has(target.id)) {
      const viewer = viewerRef.current;
      const Cesium = window.Cesium;
      if (!viewer || viewer.isDestroyed() || !Cesium) return;
      cancelCameraOrientationAnimation();
      viewer.trackedEntity = undefined;
      viewer.camera.cancelFlight();

      const elem = moonElementsRef.current[target.id];
      if (!elem) return;

      // Local Kepler solve (same constants as moon render loop)
      const mu = 4.282837e13;
      const rot0 = 176.63;
      const wdot = 350.89198226;
      const solveE = (M: number, e: number) => {
        let E = M + e * Math.sin(M);
        for (let i = 0; i < 5; i++) {
          const f = E - e * Math.sin(E) - M;
          E -= f / (1 - e * Math.cos(E));
        }
        return E;
      };
      const posAt = (epochMs: number) => {
        const a = elem.semiMajorAxisMeters;
        const e = elem.eccentricity;
        const n = Math.sqrt(mu / (a * a * a));
        const dt = (epochMs - elem.epochMs) / 1000;
        const M =
          ((((elem.meanAnomalyAtEpochDeg * Math.PI) / 180 + n * dt) % (Math.PI * 2)) +
            Math.PI * 2) %
          (Math.PI * 2);
        const E = solveE(M, e);
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
        const wMars = ((rot0 + wdot * days) * Math.PI) / 180;
        return new Cesium.Cartesian3(
          xMci * Math.cos(wMars) + yMci * Math.sin(wMars),
          -xMci * Math.sin(wMars) + yMci * Math.cos(wMars),
          zMci
        );
      };

      const now = Date.now();
      const satPos = posAt(now + 1800);
      const nextPos = posAt(now + 2800);
      const velDir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.subtract(nextPos, satPos, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const radialUp = Cesium.Cartesian3.normalize(satPos, new Cesium.Cartesian3());
      const offsetDir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.add(
          Cesium.Cartesian3.multiplyByScalar(velDir, -0.92, new Cesium.Cartesian3()),
          Cesium.Cartesian3.multiplyByScalar(radialUp, 0.39, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        ),
        new Cesium.Cartesian3()
      );
      // Stand farther back for the tiny moons so the model fills the view
      const standOff = target.id === 'phobos' ? 80_000 : 60_000;
      const camDest = Cesium.Cartesian3.add(
        satPos,
        Cesium.Cartesian3.multiplyByScalar(offsetDir, standOff, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const lookDir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.subtract(satPos, camDest, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const up = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.cross(
          Cesium.Cartesian3.cross(lookDir, radialUp, new Cesium.Cartesian3()),
          lookDir,
          new Cesium.Cartesian3()
        ),
        new Cesium.Cartesian3()
      );
      viewer.camera.flyTo({
        destination: camDest,
        orientation: { direction: lookDir, up },
        duration: 2.2,
      });
      return;
    }

    if (target.category === 'satellite' && target.orbit) {'''
    text = text.replace(old_zoom, moon_zoom, 1)
    print("OK: moon zoomToTarget")

# Pickable entities for moons (after orbit rings are created)
if "moon-pick-" not in text:
    anchor = "    refreshMoonEphemerides(moonElementsRef.current).then((next) => {"
    if anchor not in text:
        raise SystemExit("FAIL: refreshMoonEphemerides for pick entities")
    PICK = r'''
    // Invisible pick targets so Phobos/Deimos open the same info card as other orbiters
    for (const moon of MARS_MOONS) {
      const elem = moonElementsRef.current[moon.id];
      if (!elem) continue;
      const pickEntity = viewer.entities.add({
        id: moon.id,
        name: moon.name,
        position: moonPositionAt(elem, Date.now()),
        point: {
          pixelSize: 14,
          color: CesiumMoon.Color.TRANSPARENT,
          outlineColor: CesiumMoon.Color.TRANSPARENT,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: moon.name,
          font: '600 12px Inter, system-ui, sans-serif',
          fillColor: CesiumMoon.Color.fromCssColorString('#f5e6d3'),
          outlineColor: CesiumMoon.Color.BLACK,
          outlineWidth: 3,
          style: CesiumMoon.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: CesiumMoon.VerticalOrigin.BOTTOM,
          pixelOffset: new CesiumMoon.Cartesian2(0, -16),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new CesiumMoon.DistanceDisplayCondition(0, 40_000_000),
          showBackground: true,
          backgroundColor: CesiumMoon.Color.fromCssColorString('#0B0F17').withAlpha(0.55),
          backgroundPadding: new CesiumMoon.Cartesian2(6, 4),
        },
      });
      moonOrbitEntitiesRef.current.set(`${moon.id}-pick`, pickEntity);
    }

'''
    text = text.replace(anchor, PICK + "\n" + anchor, 1)
    print("OK: pick entities")

# Update pick entity positions in the moon tick block
if "moon-pick" not in text[text.find("Update Phobos & Deimos model matrices"):]:
    old_tick = """          } else if (prim.position) {
            // Entity fallback
            prim.position = p;
          }
        }
      }"""
    new_tick = """          } else if (prim.position) {
            // Entity fallback
            prim.position = p;
          }
          // Keep pick/label entity on the live moon position
          const pickEnt = moonOrbitEntitiesRef.current.get(`${moon.id}-pick`);
          if (pickEnt && pickEnt.position) {
            pickEnt.position = p;
          }
        }
      }"""
    if old_tick not in text:
        print("WARN: tick update pattern not found")
    else:
        text = text.replace(old_tick, new_tick, 1)
        print("OK: pick position tick")

# resolvePickedTarget — also match moon-orbit-ring-* and moon-pick handled by id
if "moon-orbit-ring-" not in text[text.find("resolvePickedTarget"):text.find("resolvePickedTarget")+800]:
    old_res = "      const normalizedId = entityId.replace(/-(spacecraft|rover)$/, '');"
    if old_res in text:
        text = text.replace(
            old_res,
            "      const normalizedId = entityId\n"
            "        .replace(/-(spacecraft|rover)$/, '')\n"
            "        .replace(/^moon-orbit-ring-/, '')\n"
            "        .replace(/-pick$/, '');",
            1,
        )
        print("OK: resolvePickedTarget moon ids")

GLOBE.write_text(text, encoding="utf-8")
print("Wrote MarsGlobe")
print("done")
