import { app } from 'electron'

// The executable inside an AppImage lives on a temporary FUSE mount. Restart
// the outer AppImage so the new process gets its own mount and ICU/resources.
export function relaunchApp(args = process.argv.slice(1)): void {
  const appImage = process.platform === 'linux' && app.isPackaged && process.env.APPIMAGE
  app.relaunch(appImage ? { execPath: appImage, args } : { args })
}
