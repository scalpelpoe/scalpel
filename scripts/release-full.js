const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const channelFlag = args.find(a => a.startsWith('--channel='))
const channel = channelFlag ? channelFlag.split('=')[1] : 'stable'

const version = require('../package.json').version
const electronVersion = require('../node_modules/electron/package.json').version

console.log(`\nFull release v${version} (Electron ${electronVersion}) to ${channel} channel\n`)

// Step 1: Run the standard release (build, pack asar, upload)
execSync(`node scripts/release.js --channel=${channel}`, {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..')
})

// Step 2: Verify Electron release zip is accessible
const electronZipUrl = `https://github.com/electron/electron/releases/download/v${electronVersion}/electron-v${electronVersion}-win32-x64.zip`
console.log(`\nVerifying Electron zip exists at: ${electronZipUrl}`)

try {
  const result = execSync(`curl -sI -o /dev/null -w "%{http_code}" "${electronZipUrl}"`, { encoding: 'utf8' })
  if (result.trim() !== '200' && result.trim() !== '302') {
    console.error(`Error: Electron zip not found (HTTP ${result.trim()})`)
    console.error('Make sure the Electron version in package.json has a published release.')
    process.exit(1)
  }
  console.log('  Electron zip verified')
} catch (err) {
  console.error('Error verifying Electron zip:', err.message)
  process.exit(1)
}

// Step 3: Upload icon.ico to R2 for bootstrapper/upgrader use
const iconPath = path.resolve(__dirname, '..', 'resources', 'icon.ico')
if (fs.existsSync(iconPath)) {
  console.log('\nUploading icon.ico to R2...')
  execSync(
    `npx wrangler r2 object put "filterscalpel-releases/icon.ico" --file="${iconPath}" --remote`,
    { stdio: 'inherit' }
  )
}

console.log(`\nFull release v${version} complete`)
console.log(`Users will auto-download Electron v${electronVersion} from GitHub on next update.`)
