const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const version = require('../package.json').version
const electronVersion = require('../node_modules/electron/package.json').version
const projectRoot = path.join(__dirname, '..')
const distDir = path.join(projectRoot, 'dist')
const linuxDir = path.join(distDir, `scalpel-${version}-linux`)

console.log(`\nPackaging Scalpel v${version} for Linux (Wine/Proton)\n`)

// Step 1: Build the app
console.log('Building...')
execSync('npm run build', { stdio: 'inherit', cwd: projectRoot })

// Step 2: Download Electron for win32-x64 (same as what bootstrapper uses)
const electronZip = path.join(distDir, `electron-v${electronVersion}-win32-x64.zip`)
if (!fs.existsSync(electronZip)) {
  const url = `https://github.com/electron/electron/releases/download/v${electronVersion}/electron-v${electronVersion}-win32-x64.zip`
  console.log(`Downloading Electron v${electronVersion}...`)
  execSync(`curl -L -o "${electronZip}" "${url}"`, { stdio: 'inherit' })
}

// Step 3: Create staging directory
if (fs.existsSync(linuxDir)) fs.rmSync(linuxDir, { recursive: true })
fs.mkdirSync(linuxDir, { recursive: true })

const appDir = path.join(linuxDir, 'app')
fs.mkdirSync(appDir, { recursive: true })

// Step 4: Extract Electron into app/
console.log('Extracting Electron...')
execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${electronZip}' -DestinationPath '${appDir}' -Force"`, { stdio: 'inherit' })

// Rename electron.exe to Scalpel.exe
fs.renameSync(path.join(appDir, 'electron.exe'), path.join(appDir, 'Scalpel.exe'))

// Step 5: Pack ASAR and copy into app/resources/
console.log('Packing ASAR...')
execSync('node scripts/pack-asar.js', { stdio: 'inherit', cwd: projectRoot })

const versionDir = path.join(distDir, `v${version}`)
const resourcesDir = path.join(appDir, 'resources')
fs.copyFileSync(path.join(versionDir, 'app.asar'), path.join(resourcesDir, 'app.asar'))

// Extract unpacked modules
const unpackedZip = path.join(versionDir, 'app.asar.unpacked.zip')
if (fs.existsSync(unpackedZip)) {
  const unpackedDest = path.join(resourcesDir, 'app.asar.unpacked')
  fs.mkdirSync(unpackedDest, { recursive: true })
  execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${unpackedZip}' -DestinationPath '${unpackedDest}' -Force"`, { stdio: 'inherit' })
}

// Copy icon
const iconSrc = path.join(projectRoot, 'resources', 'icon.ico')
if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, path.join(resourcesDir, 'icon.ico'))
}

// Step 6: Write launcher script
const launcherScript = `#!/bin/bash
# Scalpel v${version} - Linux Launcher (runs through Proton/Wine)
# Place this folder anywhere and run ./scalpel.sh

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/app"
EXE="$APP_DIR/Scalpel.exe"

# PoE Steam App ID
POE_APPID="238960"

# Common Proton/Wine paths
STEAM_ROOT="\${STEAM_ROOT:-$HOME/.steam/steam}"
COMPAT_DIR="$STEAM_ROOT/steamapps/compatdata/$POE_APPID"

# Find Proton version
find_proton() {
  local proton_dir
  # Check for GE-Proton first (common on Arch)
  for d in "$STEAM_ROOT/compatibilitytools.d"/GE-Proton*; do
    if [ -d "$d" ] && [ -f "$d/proton" ]; then
      echo "$d/proton"
      return
    fi
  done
  # Check Steam's bundled Proton versions (newest first)
  for d in "$STEAM_ROOT/steamapps/common"/Proton\ -\ Experimental "$STEAM_ROOT/steamapps/common"/Proton\ [0-9]*; do
    if [ -d "$d" ] && [ -f "$d/proton" ]; then
      echo "$d/proton"
      return
    fi
  done
}

# Check if PoE prefix exists
if [ ! -d "$COMPAT_DIR" ]; then
  echo "Error: PoE Proton prefix not found at $COMPAT_DIR"
  echo "Make sure Path of Exile has been run through Steam at least once."
  echo ""
  echo "If your Steam library is in a different location, set STEAM_ROOT:"
  echo "  STEAM_ROOT=/path/to/steam ./scalpel.sh"
  exit 1
fi

# Try to find Proton
PROTON="$(find_proton)"

if [ -n "$PROTON" ]; then
  echo "Using Proton: $PROTON"
  echo "Using PoE prefix: $COMPAT_DIR"
  echo "Launching Scalpel..."
  STEAM_COMPAT_CLIENT_INSTALL_PATH="$STEAM_ROOT" \\
  STEAM_COMPAT_DATA_PATH="$COMPAT_DIR" \\
  "$PROTON" run "$EXE" "\$@"
else
  # Fall back to system Wine
  if command -v wine &>/dev/null; then
    echo "Proton not found, falling back to system Wine"
    echo "Using PoE prefix: $COMPAT_DIR"
    WINEPREFIX="$COMPAT_DIR/pfx" wine "$EXE" "\$@"
  else
    echo "Error: Neither Proton nor Wine found."
    echo "Install Proton through Steam or install Wine."
    exit 1
  fi
fi
`

fs.writeFileSync(path.join(linuxDir, 'scalpel.sh'), launcherScript, { mode: 0o755 })

// Step 7: Create zip
console.log('Creating archive...')
const zipName = `Scalpel-${version}-linux.zip`
const zipPath = path.join(distDir, zipName)
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${linuxDir}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'inherit' })

// Cleanup staging
fs.rmSync(linuxDir, { recursive: true })

const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1)
console.log(`\nDone: dist/${zipName} (${sizeMB} MB)`)
console.log('Send this to your tester. They extract it and run: bash scalpel.sh')
