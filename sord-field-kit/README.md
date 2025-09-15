# SORD Field Kit

Progressive Web App field notebook purpose-built for Android phones. Ship routes, drop waypoints, cache PMTiles offline, and optionally light up on-device AI (MediaPipe object detection + WebLLM SALUTE assistant) without touching a laptop.

## Capabilities
- **MapLibre GL + PMTiles** full-screen vector basemap. Automatically prefers `/tiles/basemap.pmtiles` if you upload one, otherwise streams a public demo archive.
- **Waypoint workflow** – quick GPS locate, add marker, export as GeoJSON for intel packages. Total track distance is tracked via `geolib`.
- **Offline-first** – vite-plugin-pwa precaches the app shell; Settings toggle downloads the entire PMTiles archive into IndexedDB with live progress and clear controls.
- **AI toggles** – MediaPipe object detector (camera overlay) and WebLLM SALUTE summarizer. Both lazy-load and stay off until explicitly enabled.
- **Phone-friendly CI/CD** – npm scripts stay standard, plus a `check:phone` helper to verify manifest + versions before committing from mobile. GitHub Pages workflow publishes `/dist` automatically.

## Phone-only launch checklist
1. **Enable GitHub Pages** – open this repository on GitHub Mobile → ⋮ menu → `Settings` → `Pages` → under *Build and deployment* choose **GitHub Actions**. Save.
2. **Trigger a build** – edit any file using the GitHub mobile code editor (or the web editor in Chrome on Android) and commit. The `pages` workflow (see Actions tab) runs `npm ci && npm run build` and deploys to Pages.
3. **Find the site URL** – open the successful workflow run → Summary → the Pages URL is printed near the bottom. Bookmark it.
4. **Install the PWA** – open the URL in Chrome on Android → ⋮ menu → **Add to Home screen**. Launch from the icon for a true fullscreen experience.
5. **Go fully offline** – inside the app tap ⚙️ Settings → enable **Offline tiles**. Keep the app foregrounded until progress reads 100% and the status pill shows “Tiles ready”.

## Controls & UI map
- **Top bar** – `📍 Locate` recenters the map using the last GPS fix. `⚙️ Settings` opens the slide-in panel.
- **Floating buttons** – `+ Waypoint` drops at current fix, `Export` downloads all waypoints as GeoJSON.
- **Status pill** – live GPS state, tile cache state, and install state (browser vs installed PWA).
- **Settings → Offline tiles** – pause/resume caching, clear tiles, and inspect the source URL (local file vs remote).
- **Settings → MediaPipe** – toggling on requests camera permission, then overlays boxes for detected objects at ~15 fps. Toggle off releases the camera immediately.
- **Settings → WebLLM** – requires WebGPU (Chrome 121+ on Android 13+). Toggle on to preload `Qwen2.5-0.5B` and send prompts such as “Summarize these notes into a SALUTE report”. A toast explains when WebGPU is missing.

## Replacing the basemap from your phone
1. Export or acquire a `.pmtiles` archive on the device.
2. In GitHub Mobile tap **Add file → Upload file** and place `basemap.pmtiles` under `public/tiles/` (overwrite if necessary).
3. Commit; the next GitHub Pages build will ship your custom tiles. The runtime also checks `/tiles/basemap.pmtiles` on each load, so subsequent refreshes pick it up immediately.

## Development scripts (mobile safe)
- `npm run dev` – Vite dev server.
- `npm run build` – type check + production bundle. Required before merging.
- `npm run preview` – static preview of the production build.
- `npm run check:phone` – prints Node/npm versions, manifest + service worker presence, and a quick dependency summary to sanity check edits from Android terminals like Termux.
- `npm run icons:generate` – optional helper that expands the text-based icon placeholders into PNGs under `public/icons/.generated/` for sideloading; the PWA manifest already inlines the same data URIs.

## GitHub Pages workflow
`.github/workflows/pages.yml` installs dependencies with `npm ci`, runs `npm run build`, uploads `dist/`, and deploys via `actions/deploy-pages`. Output includes the live URL so you never hunt around.

## Icon placeholders
Binary icon assets stay out of git to keep the repo text-only for phone commits. The manifest references inline base64 PNG data sourced from `public/icons/icon-data.json`. When you need raw files—for example to preview icons on-device—run `npm run icons:generate` and grab them from `public/icons/.generated/` (ignored by git so you can delete or replace freely).

## Troubleshooting
- **GPS stuck on locating** – ensure Android location is enabled and you granted the browser permission. Move outdoors briefly for a clean fix.
- **Camera access denied** – Chrome prompts once. If denied, go to Android Settings → Apps → Chrome → Permissions → Camera → Allow, then toggle MediaPipe off/on.
- **WebLLM toggle disabled** – WebGPU is not yet exposed on your device/browser. Chrome Canary or Pixel 8+ devices currently expose it; otherwise leave the toggle off and use traditional notes.
- **Offline tiles stalled** – leaving the tab or locking the phone pauses the download. Resume from Settings after reopening.

## Post-deploy checklist (Android / Chrome)
1. Open the Pages URL while online and verify the map renders with your tiles.
2. Tap `📍 Locate` and confirm the status pill flips to “GPS fix”.
3. Drop two waypoints and export GeoJSON; confirm a file downloads.
4. Enable **Offline tiles** and wait for 100%, then reload in airplane mode to confirm the cached basemap renders.
5. Enable **MediaPipe** → ensure camera permission is granted and boxes appear.
6. Enable **WebLLM** (if WebGPU present) → submit a SALUTE prompt and review the reply.
7. Add to Home Screen and relaunch to verify standalone mode + dark theming.
