import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const iconsDir = path.join(projectRoot, 'public', 'icons')

const ICONS = [
  { input: 'icon-192.base64', output: 'icon-192.png' },
  { input: 'icon-512.base64', output: 'icon-512.png' }
]

async function ensureIcons() {
  await mkdir(iconsDir, { recursive: true })

  for (const icon of ICONS) {
    const sourcePath = path.join(iconsDir, icon.input)
    const destPath = path.join(iconsDir, icon.output)
    const raw = await readFile(sourcePath, 'utf8')
    const normalized = raw.replace(/\s+/g, '')
    await writeFile(destPath, Buffer.from(normalized, 'base64'))
    console.log(`Generated ${path.relative(projectRoot, destPath)}`)
  }
}

ensureIcons().catch((error) => {
  console.error('Failed to generate icon assets:', error)
  process.exitCode = 1
})
