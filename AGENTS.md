# AGENTS.md

## Project
ARES NAV — a React 19 + Vite + TypeScript 3D Mars globe viewer built on CesiumJS (loaded from CDN in `index.html`, not npm). UI is Tailwind CSS v4 + lucide-react.

## Build & test commands
- Install: `npm install --legacy-peer-deps` (plain `npm install` fails on a peer-dep conflict between `vite@8` and `tsx`'s esbuild).
- Typecheck / lint: `npm run lint` (`tsc --noEmit`). Note: a hand-written ambient type file `src/types/cesium.d.ts` declares the Cesium surface used in the app — new Cesium properties must be added there or typecheck fails.
- Build: `npm run build` (Vite). Dev server: `npm run dev` (port 3000).
- `tsc`/`vite` are only available after installing dependencies (no node_modules checked in).

## Verifying the running app (headless)
- The runtime proxies port **12000** → `https://work-1-...prod-runtime.all-hands.dev/`. To preview, run Vite on 12000 with `server.allowedHosts: true` (default config rejects the proxy host with "Blocked request").
- To assert runtime state / catch console errors, temporarily inject a script into `index.html` that collects `window.onerror` / `console.error` / `unhandledrejection` and dumps values into a DOM node, then revert. `index.html` is served by Vite so edits are picked up immediately.

## Bottom HUD layout notes
- The bottom control rail lives in `src/components/MapStyleBar.tsx`. The data-layer radiogroup (`Optical`/`Radiation`/`Temperature`/`Elevation`) must stay horizontally centered on screen, with the Lat/Lon grid toggle immediately to its left (12px gap) and the Weather toggle to its right.
- Centering is achieved with a symmetric 3-column grid (`md:grid-cols-[1fr_auto_1fr]`, left/right columns `1fr`), NOT `justify-between` or `absolute left-1/2` — those let an unequal-width side control (grid vs weather) shift the bar off true center. The left column uses `md:justify-self-end` so the grid button sits flush against the bar.
- On `< md` the grid collapses to one column and controls stack centered, so nothing overlaps on mobile. Verify wrap with a narrow iframe since the page needs a real viewport width for media queries.

## Camera / interaction notes
- `ScreenSpaceCameraController` is configured in `src/components/MarsGlobe.tsx` (the `controller` block near the Viewer init). Inertia, zoom limits, and input sensitivity live there. It is set **once** inside the `useEffect(..., [])` that builds the Viewer; no other effect or React state re-render writes to it, so controller settings persist for the life of the viewer.
- Drag inertia is Cesium-native (the app has no custom drag-rotate handler). It only fires when the drag lasted `< 0.4s` (`inertiaMaxClickTimeThreshold`) and the pointer moved — so a slow, long drag deliberately produces no coast. `inertiaSpin`/`inertiaTranslate` govern rotate/pan; `inertiaZoom` governs wheel/pinch.
- `requestRenderMode` must stay `false` (it is passed explicitly to the `Viewer` constructor). If it were `true`, the render loop would freeze the instant the pointer lifts and the inertia glide would be invisible unless `viewer.scene.requestRender()` were called every coasting frame.
- `src/index.css` already applies `touch-action: none !important` to `#cesiumContainer`, `.cesium-viewer`, and the Cesium canvas — browser gestures are already disabled over the globe.
- Custom camera-zoom paths bypass Cesium defaults and must be kept in sync: `startContinuousZoomInternal` (hold +/-), `wheelZoomInternal` (scroll wheel), and `zoomToTargetInternal` (range clamp). They share module constants `MIN_CAMERA_HEIGHT_METERS`, `MAX_CAMERA_HEIGHT_METERS`, and `CAMERA_INPUT_SENSITIVITY_MULTIPLIER`.
