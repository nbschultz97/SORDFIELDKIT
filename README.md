Live site: https://nbschultz97.github.io/SORDFIELDKIT/

# SORD Field Kit Repository

Project files live under [`sord-field-kit/`](./sord-field-kit/). See that directory's README for usage, phone-only deployment steps, and troubleshooting.

The repo root now ships a minimal Vite + React shell so GitHub Pages can host static previews while CSI tooling matures.

## Development

```sh
npm install
npm run dev    # Start local preview
npm run build  # Emit production assets into dist/
```

The GitHub Pages workflow publishes `dist/` to the `gh-pages` branch and drops SPA fallbacks (`404.html`, `.nojekyll`) alongside the bundle.

## Phone-only steps

- Visit https://nbschultz97.github.io/SORDFIELDKIT/ → Add to Home screen.
- For offline basemap: upload public/tiles/basemap.pmtiles (via phone), wait for deploy, reopen app, confirm status shows “local tiles”.
- Buttons: 📍 Locate, ➕ Waypoint, ⬇️ Export.
