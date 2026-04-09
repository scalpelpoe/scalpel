const asar = require('@electron/asar')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const projectRoot = path.join(__dirname, '..')
const outDir = path.join(projectRoot, 'out')
const distDir = path.join(projectRoot, 'dist')
const tempAppDir = path.join(distDir, '.asar-staging')
const version = require('../package.json').version

// Native modules -- included in ASAR but .node binaries are unpacked
const NATIVE_MODULES = ['electron-overlay-window', 'uiohook-napi']

// Packages to fully exclude from the asar
const EXCLUDE = new Set([
  'electron', '@electron/get', '@types/node',  // electron runtime (already present)
])

const nodeModulesSrc = path.join(projectRoot, 'node_modules')

if (!fs.existsSync(outDir)) {
  console.error('Error: out/ directory not found. Run `npm run build` first.')
  process.exit(1)
}

// Use npm to resolve the full production dependency tree (including nested deps)
const { execSync } = require('child_process')
const npmOutput = execSync('npm ls --prod --all --parseable', {
  cwd: projectRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']
})
const prodPaths = npmOutput.trim().split('\n')
  .filter(p => p.includes('node_modules'))
  .map(p => path.relative(projectRoot, p).replace(/\\/g, '/'))

// Build a set of production packages to copy
// Paths look like "node_modules/foo" or "node_modules/conf/node_modules/ajv"
const prodPackages = new Set()
for (const p of prodPaths) {
  // Get the package name relative to its parent node_modules
  const parts = p.split('/')
  const nmIdx = parts.lastIndexOf('node_modules')
  if (nmIdx === -1) continue
  const pkgName = parts[nmIdx + 1].startsWith('@')
    ? parts[nmIdx + 1] + '/' + parts[nmIdx + 2]
    : parts[nmIdx + 1]
  if (EXCLUDE.has(pkgName)) continue
  prodPackages.add(p)
}

console.log(`Production packages: ${prodPackages.size}`)

// Clean and create staging dir
if (fs.existsSync(tempAppDir)) fs.rmSync(tempAppDir, { recursive: true })
fs.mkdirSync(tempAppDir, { recursive: true })

// Copy out/ (compiled main, preload, renderer)
fs.cpSync(outDir, path.join(tempAppDir, 'out'), { recursive: true })

// Copy package.json (Electron needs it to find the entry point)
// Strip repository/homepage to avoid leaking GitHub info
const pkgData = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
delete pkgData.repository
delete pkgData.build
delete pkgData.devDependencies
fs.writeFileSync(path.join(tempAppDir, 'package.json'), JSON.stringify(pkgData, null, 2))

// Copy only production node_modules (preserving nested structure)
const nodeModulesDest = path.join(tempAppDir, 'node_modules')
for (const relPath of prodPackages) {
  const src = path.join(projectRoot, relPath)
  const dest = path.join(tempAppDir, relPath)
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.cpSync(src, dest, { recursive: true, dereference: true })
  }
}

// Also copy native modules (they'll be in the ASAR with .node files unpacked)
for (const mod of NATIVE_MODULES) {
  const src = path.join(nodeModulesSrc, mod)
  const dest = path.join(nodeModulesDest, mod)
  if (fs.existsSync(src) && !fs.existsSync(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.cpSync(src, dest, { recursive: true, dereference: true })
  }
}

// Prune unnecessary files from copied node_modules
function pruneDir(dir) {
  const prunePatterns = ['test', 'tests', '__tests__', 'example', 'examples', '.github', '.vscode']
  const pruneExts = ['.md', '.ts', '.map']

  if (!fs.existsSync(dir)) return

  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      if (prunePatterns.includes(entry)) {
        fs.rmSync(fullPath, { recursive: true })
      } else {
        pruneDir(fullPath)
      }
    } else if (pruneExts.some(ext => entry.endsWith(ext))) {
      const relative = path.relative(nodeModulesDest, fullPath)
      const depth = relative.split(path.sep).length
      if (depth <= 2) fs.unlinkSync(fullPath)
    }
  }
}
pruneDir(nodeModulesDest)

// Create output directory
const versionDir = path.join(distDir, `v${version}`)
if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true })

// Pack the asar (unpack .node native binaries so they can be loaded at runtime)
const asarPath = path.join(versionDir, 'app.asar')
asar.createPackageWithOptions(tempAppDir, asarPath, {
  unpack: '*.node'
}).then(() => {
  // Zip the unpacked directory for separate upload
  const unpackedDir = asarPath + '.unpacked'
  if (fs.existsSync(unpackedDir)) {
    const { execSync } = require('child_process')
    const zipPath = path.join(versionDir, 'app.asar.unpacked.zip')
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${unpackedDir}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'inherit' })
    console.log(`Zipped unpacked modules: ${(fs.statSync(zipPath).size / 1024 / 1024).toFixed(1)} MB`)
  }

  // Compute sha512
  const data = fs.readFileSync(asarPath)
  const sha512 = crypto.createHash('sha512').update(data).digest('base64')
  const size = data.length

  // Compute unpacked zip hash if it exists
  const unpackedZipPath = path.join(versionDir, 'app.asar.unpacked.zip')
  let unpackedSha512 = ''
  let unpackedSize = 0
  if (fs.existsSync(unpackedZipPath)) {
    const unpackedData = fs.readFileSync(unpackedZipPath)
    unpackedSha512 = crypto.createHash('sha512').update(unpackedData).digest('base64')
    unpackedSize = unpackedData.length
  }

  // Write manifest
  const electronVersion = require('../node_modules/electron/package.json').version
  const manifest = {
    version,
    electronVersion,
    asarUrl: `v${version}/app.asar`,
    asarSha512: sha512,
    asarSize: size,
    unpackedUrl: unpackedSize > 0 ? `v${version}/app.asar.unpacked.zip` : undefined,
    unpackedSha512: unpackedSha512 || undefined,
    unpackedSize: unpackedSize || undefined,
    nativeModules: {
      'electron-overlay-window': require('../node_modules/electron-overlay-window/package.json').version,
      'uiohook-napi': require('../node_modules/uiohook-napi/package.json').version
    }
  }

  const manifestPath = path.join(versionDir, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  // Clean up staging
  fs.rmSync(tempAppDir, { recursive: true })

  console.log(`Packed app.asar (${(size / 1024 / 1024).toFixed(1)} MB)`)
  console.log(`SHA512: ${sha512}`)
  console.log(`Manifest: ${manifestPath}`)
  console.log(`\nArtifacts in dist/v${version}/`)
})
