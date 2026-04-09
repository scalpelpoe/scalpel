const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const installerDir = __dirname
const nsiPath = path.join(installerDir, 'bootstrapper.nsi')
const distDir = path.resolve(__dirname, '..', 'dist')
const version = require('../package.json').version
const electronVersion = require('../node_modules/electron/package.json').version

// Ensure dist directory exists with ASAR artifacts
const versionDir = path.join(distDir, `v${version}`)
const asarPath = path.join(versionDir, 'app.asar')
const unpackedDir = path.join(versionDir, 'app.asar.unpacked')

if (!fs.existsSync(asarPath)) {
  console.error('Error: app.asar not found. Run `npm run build && node scripts/pack-asar.js` first.')
  process.exit(1)
}

// Copy icon.ico into installer dir
const iconSrc = path.resolve(__dirname, '..', 'resources', 'icon.ico')
fs.cpSync(iconSrc, path.join(installerDir, 'icon.ico'))

// Copy ASAR into installer dir
fs.cpSync(asarPath, path.join(installerDir, 'app.asar'))

// Copy unpacked dir into installer dir
const installerUnpacked = path.join(installerDir, 'app.asar.unpacked')
if (fs.existsSync(installerUnpacked)) fs.rmSync(installerUnpacked, { recursive: true })
if (fs.existsSync(unpackedDir)) {
  fs.cpSync(unpackedDir, installerUnpacked, { recursive: true })
}

// Write electron version file for the installer to read
fs.writeFileSync(path.join(installerUnpacked, '.electron-version'), electronVersion)

// Also write a proper install manifest
const manifestPath = path.join(versionDir, 'manifest.json')
if (fs.existsSync(manifestPath)) {
  fs.cpSync(manifestPath, path.join(installerUnpacked, 'install-manifest.json'))
}

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true })

console.log(`Building installer for v${version} (Electron ${electronVersion})...`)
console.log(`ASAR: ${(fs.statSync(asarPath).size / 1024 / 1024).toFixed(1)} MB`)

const makensis = process.platform === 'win32'
  ? 'C:\\Program Files (x86)\\NSIS\\Bin\\makensis.exe'
  : 'makensis'

try {
  execSync(`"${makensis}" "${nsiPath}"`, { stdio: 'inherit' })

  const outPath = path.join(distDir, 'Scalpel-Installer.exe')
  const size = fs.statSync(outPath).size
  console.log(`\nInstaller built: dist/Scalpel-Installer.exe (${(size / 1024 / 1024).toFixed(1)} MB)`)
} catch (err) {
  console.error('\nFailed to compile NSIS installer.')
  console.error('Make sure NSIS is installed: winget install NSIS.NSIS')
  console.error('Ensure NSIS is installed with NSISdl plugin (included by default)')
  process.exit(1)
}

// Clean up
fs.unlinkSync(path.join(installerDir, 'icon.ico'))
fs.unlinkSync(path.join(installerDir, 'app.asar'))
fs.rmSync(installerUnpacked, { recursive: true })
