#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import iconData from "../public/icons/icon-data.json" with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../public/icons/.generated");

await fs.mkdir(outDir, { recursive: true });

const entries = Object.entries(iconData);
for (const [name, dataUri] of entries) {
  const [prefix, base64] = dataUri.split(",", 2);
  if (!base64 || !prefix.startsWith("data:image/png;base64")) {
    console.warn(`Skipping ${name}: unexpected data URI`);
    continue;
  }
  const filePath = resolve(outDir, `${name}.png`);
  await fs.writeFile(filePath, Buffer.from(base64, "base64"));
  console.log(`Generated ${filePath}`);
}

console.log(`Done. ${entries.length} placeholder icons are available under ${outDir}.`);
