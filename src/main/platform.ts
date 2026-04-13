import { nativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

/** Platform-specific icon filename for windows, tray, and other native UI. */
function getIconFile(): string {
  switch (process.platform) {
    case 'darwin':
      return 'icon.icns'
    case 'linux':
      return 'icon.png'
    default:
      return 'icon.ico'
  }
}

/**
 * Resolve the app icon as a NativeImage.
 * Checks the packaged resources path first, falls back to the dev project root.
 */
export function getAppIcon(): Electron.NativeImage | undefined {
  const iconFile = getIconFile()
  const prodPath = join(process.resourcesPath, iconFile)
  const devPath = join(__dirname, `../../resources/${iconFile}`)
  const iconPath = existsSync(prodPath) ? prodPath : devPath
  return existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined
}
