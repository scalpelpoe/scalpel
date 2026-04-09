const path = require('path')
const fs = require('fs')

exports.default = async function afterPack(context) {
  // Remove app-update.yml (we use our own update system, not electron-updater)
  const ymlPath = path.join(context.appOutDir, 'resources', 'app-update.yml')
  if (fs.existsSync(ymlPath)) {
    fs.unlinkSync(ymlPath)
    console.log('[afterPack] Removed app-update.yml')
  }
}
