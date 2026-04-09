const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const channelFlag = args.find(a => a.startsWith('--channel='))
const channel = channelFlag ? channelFlag.split('=')[1] : 'stable'

const version = require('../package.json').version
const distDir = path.join(__dirname, '..', 'dist')
const versionDir = path.join(distDir, `v${version}`)

console.log(`\nReleasing v${version} to ${channel} channel\n`)

// Step 1: Build
console.log('Building...')
execSync('npm run build', { stdio: 'inherit', cwd: path.join(__dirname, '..') })

// Step 2: Pack ASAR
console.log('\nPacking ASAR...')
execSync('node scripts/pack-asar.js', { stdio: 'inherit', cwd: path.join(__dirname, '..') })

// Step 3: Upload to R2
const asarPath = path.join(versionDir, 'app.asar')
const manifestPath = path.join(versionDir, 'manifest.json')

if (!fs.existsSync(asarPath) || !fs.existsSync(manifestPath)) {
  console.error('Error: Missing artifacts in', versionDir)
  process.exit(1)
}

console.log(`\nUploading to R2 (${channel} channel)...`)

// Upload ASAR to versioned path
const asarKey = `filterscalpel-releases/${channel}/v${version}/app.asar`
console.log(`  app.asar -> ${asarKey}`)
execSync(
  `npx wrangler r2 object put "${asarKey}" --file="${asarPath}" --remote`,
  { stdio: 'inherit' }
)

// Upload unpacked zip if it exists
const unpackedPath = path.join(versionDir, 'app.asar.unpacked.zip')
if (fs.existsSync(unpackedPath)) {
  const unpackedKey = `filterscalpel-releases/${channel}/v${version}/app.asar.unpacked.zip`
  console.log(`  app.asar.unpacked.zip -> ${unpackedKey}`)
  execSync(
    `npx wrangler r2 object put "${unpackedKey}" --file="${unpackedPath}" --remote`,
    { stdio: 'inherit' }
  )
}

// Upload manifest to channel root
const manifestKey = `filterscalpel-releases/${channel}/manifest.json`
console.log(`  manifest.json -> ${manifestKey}`)
execSync(
  `npx wrangler r2 object put "${manifestKey}" --file="${manifestPath}" --remote`,
  { stdio: 'inherit' }
)

console.log(`\nRelease v${version} published to ${channel} channel`)
