/**
 * Central IPC handler registration.
 *
 * All ipcMain.handle / ipcMain.on registrations live here so the bootstrap
 * module (index.ts) can wire them in one call. Each handler module owns its
 * domain logic; this file is the glue that connects them to Electron.
 */

import { ipcMain } from 'electron'
import type Store from 'electron-store'
import type { AppSettings } from '../../shared/types'
import type { BrowserWindow } from 'electron'
import { registerDiagnostics } from '../diagnostics'
import * as tradeHandlers from '../handlers/trade'
import * as settingsHandlers from '../handlers/settings'
import * as learningHandlers from '../handlers/learning'
import * as filesHandlers from '../handlers/files'
import * as editingHandlers from '../handlers/editing'
import * as versionsHandlers from '../handlers/versions'
import * as onlineSyncHandlers from '../handlers/online-sync'
import * as pricesHandlers from '../handlers/prices'
import { register as registerCheatSheets } from '../handlers/cheat-sheets'
import { register as registerWhiteboard } from '../handlers/whiteboard'
import { register as registerClipboard } from '../handlers/clipboard'
import { register as registerManifest } from '../handlers/manifest'
import { register as registerPlugins } from '../handlers/plugins'
import { registerClientLogHandlers } from '../handlers/client-log'
import { registerGameConfigHandlers } from '../handlers/game-config'
import { registerPluginPriceHandlers } from '../handlers/plugin-prices'

export interface IpcRegistrationDeps {
  store: Store<AppSettings>
  isElevated: () => boolean
  getAppWindow: () => BrowserWindow | null
  showAppWindow: () => void
  hideOverlay: () => void
}

export function registerAllIpc(deps: IpcRegistrationDeps): void {
  const { store, isElevated, getAppWindow, showAppWindow, hideOverlay } = deps

  // ── Domain handler modules ────────────────────────────────────────────────

  tradeHandlers.register(store)
  settingsHandlers.register(store)
  filesHandlers.register(store)
  editingHandlers.register(store)
  versionsHandlers.register(store)
  onlineSyncHandlers.register(store)
  pricesHandlers.register(store)
  registerCheatSheets()
  registerWhiteboard()
  registerClipboard()
  registerManifest()
  registerPlugins(store, isElevated)
  learningHandlers.register()
  registerClientLogHandlers()
  registerGameConfigHandlers()
  registerPluginPriceHandlers(store)
  registerDiagnostics({ store, getAppWindow, showAppWindow })

  // ── Simple inline handlers ────────────────────────────────────────────────

  ipcMain.on('close-overlay', () => hideOverlay())

  ipcMain.on('open-devtools', (event) => {
    const app = getAppWindow()
    if (app && !app.isDestroyed()) {
      app.webContents.openDevTools({ mode: 'detach' })
    } else {
      event.sender.openDevTools({ mode: 'detach' })
    }
  })
}
