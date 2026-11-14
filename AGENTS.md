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

## Camera / interaction notes
- `ScreenSpaceCameraController` is configured in `src/components/MarsGlobe.tsx` (the `controller` block near the Viewer init). Inertia, zoom limits, and input sensitivity live there.
- `src/index.css` already applies `touch-action: none !important` to `#cesiumContainer`, `.cesium-viewer`, and the Cesium canvas — browser gestures are already disabled over the globe.
- Custom camera-zoom paths bypass Cesium defaults and must be kept in sync: `startContinuousZoomInternal` (hold +/-), `wheelZoomInternal` (scroll wheel), and `zoomToTargetInternal` (range clamp). They share module constants `MIN_CAMERA_HEIGHT_METERS`, `MAX_CAMERA_HEIGHT_METERS`, and `CAMERA_INPUT_SENSITIVITY_MULTIPLIER`.
