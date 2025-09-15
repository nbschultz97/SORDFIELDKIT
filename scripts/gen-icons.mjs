import { mkdir, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const distDir = path.join(projectRoot, 'dist');
const manifestFile = path.join(publicDir, 'manifest.webmanifest');

async function cleanDist() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
}

async function copyPublicAssets() {
  const entries = await readdir(publicDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(publicDir, entry.name);
    const destPath = path.join(distDir, entry.name);
    if (entry.name === 'manifest.webmanifest') {
      continue;
    }
    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true });
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

async function copyDir(src, dest) {
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true });
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

function sanitizeSize(sizes = '') {
  const tokens = sizes.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return 'any';
  }
  return tokens[0].toLowerCase();
}

function sanitizePurpose(purpose = '') {
  if (!purpose.trim()) {
    return '';
  }
  return purpose
    .split(/\s+/)
    .map((token) => token.toLowerCase())
    .join('-');
}

async function generateIcons() {
  const manifestRaw = await readFile(manifestFile, 'utf8');
  const sourceManifest = JSON.parse(manifestRaw);
  const buildManifest = JSON.parse(JSON.stringify(sourceManifest));
  const iconsOutputDir = path.join(distDir, 'icons');
  let generatedCount = 0;

  if (!Array.isArray(buildManifest.icons)) {
    console.warn('No icons array defined in manifest; skipping generation.');
  } else {
    await mkdir(iconsOutputDir, { recursive: true });
    for (const icon of buildManifest.icons) {
      if (typeof icon.src !== 'string') {
        continue;
      }
      const match = icon.src.match(/^data:image\/png;base64,(.+)$/i);
      if (!match) {
        continue;
      }
      const base64Payload = match[1];
      const sizeToken = sanitizeSize(icon.sizes);
      const purposeToken = sanitizePurpose(icon.purpose);
      const filenameParts = ['icon', sizeToken];
      if (purposeToken && purposeToken !== 'any') {
        filenameParts.push(purposeToken);
      }
      const fileName = `${filenameParts.join('-')}.png`;
      const filePath = path.join(iconsOutputDir, fileName);
      await writeFile(filePath, Buffer.from(base64Payload, 'base64'));
      icon.src = path.posix.join('icons', fileName);
      generatedCount += 1;
    }
  }

  await writeFile(path.join(distDir, 'manifest.webmanifest'), JSON.stringify(buildManifest, null, 2) + '\n');
  console.log(`Generated ${generatedCount} icon file(s) and manifest for deployment.`);
}

try {
  await cleanDist();
  await copyPublicAssets();
  await generateIcons();
} catch (error) {
  console.error('Failed to generate icons from manifest:', error);
  process.exitCode = 1;
}
