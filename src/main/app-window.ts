import { BrowserWindow, ipcMain, app, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

let appWindow: BrowserWindow | null = null
let quitting = false

app.on('before-quit', () => {
  quitting = true
})

export function createAppWindow(): BrowserWindow {
  const devIcon = join(__dirname, '../../resources/icon.ico')
  const prodIcon = join(process.resourcesPath, 'icon.ico')
  const iconPath = existsSync(prodIcon) ? prodIcon : devIcon
  const icon = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined

  appWindow = new BrowserWindow({
    width: 520,
    height: 550,
    resizable: false,
    minimizable: true,
    maximizable: false,
    show: false,
    frame: true,
    autoHideMenuBar: true,
    title: 'Scalpel',
    icon,
    backgroundColor: '#171821',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    appWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/app.html`)
  } else {
    appWindow.loadFile(join(__dirname, '../renderer/app.html'))
  }

  // Hide instead of close so it can be re-shown from tray (unless quitting)
  appWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      appWindow?.hide()
    }
  })

  return appWindow
}

export function showAppWindow(): void {
  if (!appWindow) return
  appWindow.show()
  appWindow.focus()
}

export function hideAppWindow(): void {
  appWindow?.hide()
}

export function getAppWindow(): BrowserWindow | null {
  return appWindow
}

// Called when onboarding finishes — hide the app window
ipcMain.handle('finish-onboarding', () => {
  // Window stays available via tray
})

ipcMain.on('app-window-mode', (_event, mode: 'onboarding' | 'settings') => {
  if (!appWindow) return
  if (mode === 'onboarding') {
    appWindow.setResizable(true)
    appWindow.setSize(520, 550)
    appWindow.setResizable(false)
  } else {
    appWindow.setResizable(true)
    appWindow.setMinimumSize(420, 350)
    appWindow.setSize(520, 600)
  }
})
