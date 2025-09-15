# Icon data

All application icons live as base64 PNG data inside `icon-data.json` so this repository stays binary-free for mobile commits. The PWA manifest links to those data URIs directly. If you need actual `.png` files (for screenshots or sideloading), run `npm run icons:generate` and check the generated files under `.generated/`.
