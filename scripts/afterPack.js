const path = require('node:path')
const fs = require('node:fs')

const REQUIRED_OVERLAY_VERSION = '4.1.0'
const REQUIRED_NATIVE_EXPORTS = ['setTargetTitles', 'clearTarget', 'stopHook']

function findNativeBinaries(dir) {
  const binaries = []
  if (!fs.existsSync(dir)) return binaries

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) binaries.push(...findNativeBinaries(fullPath))
    else if (entry.isFile() && entry.name.endsWith('.node')) binaries.push(fullPath)
  }
  return binaries
}

function assertOverlayDependency(moduleDir) {
  const packagePath = path.join(moduleDir, 'package.json')
  const wrapperPath = path.join(moduleDir, 'dist', 'index.js')
  if (!fs.existsSync(packagePath) || !fs.existsSync(wrapperPath)) {
    throw new Error(`electron-overlay-window is incomplete in ${moduleDir}`)
  }

  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  if (packageJson.version !== REQUIRED_OVERLAY_VERSION) {
    throw new Error(
      `electron-overlay-window ${packageJson.version ?? 'unknown'} is installed; ${REQUIRED_OVERLAY_VERSION} is required`,
    )
  }

  const wrapper = fs.readFileSync(wrapperPath, 'utf8')
  for (const api of ['attachByTitles', 'setTargetTitles']) {
    if (!wrapper.includes(`${api}(`)) {
      throw new Error(`electron-overlay-window ${packageJson.version} JS wrapper is missing ${api}()`)
    }
  }

  const binaries = findNativeBinaries(moduleDir)
  const compatibleBinary = binaries.find((binaryPath) => {
    const binary = fs.readFileSync(binaryPath)
    return REQUIRED_NATIVE_EXPORTS.every((name) => binary.includes(Buffer.from(name)))
  })
  if (!compatibleBinary) {
    throw new Error(
      `electron-overlay-window ${packageJson.version} has no native addon with ${REQUIRED_NATIVE_EXPORTS.join('/')}`,
    )
  }

  return compatibleBinary
}

exports.default = async function afterPack(context) {
  const overlayDir = path.join(
    context.appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'electron-overlay-window',
  )
  const overlayBinary = assertOverlayDependency(overlayDir)
  console.log(`[afterPack] Verified electron-overlay-window ${REQUIRED_OVERLAY_VERSION}: ${overlayBinary}`)

  // Remove app-update.yml (we use our own update system, not electron-updater)
  const ymlPath = path.join(context.appOutDir, 'resources', 'app-update.yml')
  if (fs.existsSync(ymlPath)) {
    fs.unlinkSync(ymlPath)
    console.log('[afterPack] Removed app-update.yml')
  }
}

exports.assertOverlayDependency = assertOverlayDependency
