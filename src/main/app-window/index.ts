import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import type Store from 'electron-store'
import type { AppSettings } from '../../shared/types'
import { persistAppWindowPosition, restoreAppWindowPosition } from './position'

let appWindow: BrowserWindow | null = null
let quitting = false
let store: Store<AppSettings> | null = null

function getStore(): Store<AppSettings> {
  if (!store) throw new Error('Store not initialized. Call createAppWindow first.')
  return store
}

app.on('before-quit', () => {
  quitting = true
})

export function createAppWindow(_store: Store<AppSettings>): BrowserWindow {
  store = _store

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

  if (process.env.ELECTRON_RENDERER_URL) {
    appWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/app.html`)
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

  // Persist window position on user move so next launch restores it.
  appWindow.on('moved', () => {
    if (!appWindow || appWindow.isDestroyed()) return
    persistAppWindowPosition(appWindow, getStore())
  })

  return appWindow
}

export function showAppWindow(): void {
  if (!appWindow) return

  if (store) {
    restoreAppWindowPosition(appWindow, store)
  }

  // If the window was minimized, restore() brings it back; otherwise it's a no-op.
  if (appWindow.isMinimized()) appWindow.restore()
  appWindow.show()
  appWindow.focus()
}

export function hideAppWindow(): void {
  appWindow?.hide()
}

export function getAppWindow(): BrowserWindow | null {
  return appWindow
}

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
  // Mode change can resize the window, which could push the bottom edge off the
  // work area if the saved y was near the lower boundary.
  if (store) {
    restoreAppWindowPosition(appWindow, store)
  }
})
