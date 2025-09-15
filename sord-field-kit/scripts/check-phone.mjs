#!/usr/bin/env node
import { execSync } from "node:child_process";
import { promises as fs, existsSync } from "node:fs";

const line = "-".repeat(48);
console.log(line);
console.log("SORD Field Kit :: phone readiness check");
console.log(line);

console.log(`Node.js: ${process.version}`);
try {
  const npmVersion = execSync("npm -v", { stdio: ["ignore", "pipe", "inherit"] })
    .toString()
    .trim();
  console.log(`npm: ${npmVersion}`);
} catch (error) {
  console.log("npm: unavailable");
}

const manifestOk = existsSync("public/manifest.webmanifest");
const swOk = existsSync("src/sw.ts");
console.log(`Manifest: ${manifestOk ? "✅" : "⚠️ missing"}`);
console.log(`Service worker entry: ${swOk ? "✅" : "⚠️ missing"}`);

try {
  const pkgRaw = await fs.readFile("package.json", "utf-8");
  const pkg = JSON.parse(pkgRaw);
  const deps = Object.keys(pkg.dependencies || {});
  console.log(`Dependencies (${deps.length}): ${deps.join(", ")}`);
  console.log(`Scripts: ${Object.keys(pkg.scripts || {}).join(", ")}`);
} catch (error) {
  console.log("package.json not readable");
}

console.log("Quick tip: run 'npm run build' before committing from your phone.");
console.log(line);
