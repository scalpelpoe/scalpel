import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_ID = 'scalpel-economy'
const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const pluginsRoot = join(
  process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'),
  'Scalpel',
  'plugins',
)
const destDir = join(pluginsRoot, PLUGIN_ID)

function addId(listPath, id) {
  let ids = []
  if (existsSync(listPath)) {
    try {
      const raw = JSON.parse(readFileSync(listPath, 'utf-8'))
      if (Array.isArray(raw)) ids = raw.filter((x) => typeof x === 'string')
    } catch {
      ids = []
    }
  }
  if (!ids.includes(id)) ids.push(id)
  mkdirSync(pluginsRoot, { recursive: true })
  writeFileSync(listPath, JSON.stringify(ids))
}

if (!existsSync(join(distDir, 'manifest.json')) || !existsSync(join(distDir, 'plugin.js'))) {
  console.error('dist/ is missing manifest.json or plugin.js — run npm run build first')
  process.exit(1)
}

if (process.platform === 'win32') {
  const { spawnSync } = await import('node:child_process')
  spawnSync('taskkill', ['/F', '/IM', 'Scalpel.exe', '/T'], { stdio: 'ignore', windowsHide: true })
  spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      "Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*scalpel-main*' } | Stop-Process -Force -ErrorAction SilentlyContinue",
    ],
    { stdio: 'ignore', windowsHide: true },
  )
}

mkdirSync(destDir, { recursive: true })
for (const name of readdirSync(distDir)) {
  copyFileSync(join(distDir, name), join(destDir, name))
}

addId(join(pluginsRoot, 'installed.json'), PLUGIN_ID)
addId(join(pluginsRoot, 'unpacked.json'), PLUGIN_ID)

console.log(`Installed ${PLUGIN_ID} → ${destDir}`)

const scalpelRoot = join(import.meta.dirname, '..', '..', 'scalpel-main')
const launchScript = join(scalpelRoot, 'scripts', 'launch-built.mjs')
if (existsSync(launchScript)) {
  console.log('Launching Scalpel...')
  const { spawn } = await import('node:child_process')
  const child = spawn(process.execPath, [launchScript], {
    cwd: scalpelRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
} else {
  console.log('Restart Scalpel so it picks up the new plugin.')
}
