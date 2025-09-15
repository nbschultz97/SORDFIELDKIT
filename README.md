# SORDFIELDKIT

Vantage Scanner's public manifest now stores lightweight icon placeholders as base64 to keep the repo binary-free.

## Build pipeline

```sh
npm run build
```

The build script decodes the manifest's data URIs, writes real PNGs into `dist/icons/`, and rewrites `dist/manifest.webmanifest` so installable PWAs still receive file-backed icons.
