import { BrowserWindow, dialog, ipcMain } from 'electron'
import type Store from 'electron-store'
import type { PluginManifest } from '../../plugin-sdk/src/types'
import type { AppSettings } from '../../shared/types'
import { refreshAppMacros } from '../app-macros'
import { runMainHotkeyFlow } from '../evaluation'
import { getOverlayWindow, showOverlay } from '../overlay'
import { getRegisteredPluginHotkeys, removePluginHotkey, setPluginHotkey } from '../plugins/hotkey-registry'
import { installFromRegistry } from '../plugins/install-from-registry'
import { installUnpacked } from '../plugins/install-unpacked'
import { getInstalledPlugins } from '../plugins/manager'
import { PLUGIN_ID_PATTERN } from '../plugins/manifest-validator'
import { pluginEntryUrl } from '../plugins/plugin-protocol'
import { fetchRegistry } from '../plugins/registry'
import { deleteValue, getValue, listKeys, setValue } from '../plugins/storage'
import { uninstallPlugin } from '../plugins/uninstall'

export interface InstalledPluginIpc {
  manifest: PluginManifest
  entryUrl: string
}

export function register(store: Store<AppSettings>, isElevated: () => boolean = () => false): void {
  ipcMain.handle('plugins:list-installed', (): InstalledPluginIpc[] => {
    return getInstalledPlugins().map((p) => ({
      manifest: p.manifest,
      entryUrl: pluginEntryUrl(p.manifest.id),
    }))
  })

  ipcMain.handle('plugins:storage-get', (_evt, pluginId: string, key: string) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    return getValue(pluginId, key)
  })

  ipcMain.handle('plugins:storage-set', (_evt, pluginId: string, key: string, value: unknown) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    setValue(pluginId, key, value)
  })

  ipcMain.handle('plugins:storage-delete', (_evt, pluginId: string, key: string) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    deleteValue(pluginId, key)
  })

  ipcMain.handle('plugins:storage-keys', (_evt, pluginId: string) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    return listKeys(pluginId)
  })

  ipcMain.handle('plugins:register-hotkey', (_evt, pluginId: string, label: string) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    setPluginHotkey(pluginId, label)
    refreshAppMacros()
  })

  ipcMain.handle('plugins:list-registered-hotkeys', () => {
    return Array.from(getRegisteredPluginHotkeys(), ([id, { label }]) => ({ id, label }))
  })

  ipcMain.handle('plugins:install-unpacked', async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender)
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Select plugin directory (containing manifest.json and plugin.js)',
          properties: ['openDirectory'],
        })
      : await dialog.showOpenDialog({
          title: 'Select plugin directory (containing manifest.json and plugin.js)',
          properties: ['openDirectory'],
        })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false as const, error: 'cancelled' }
    }
    const installResult = installUnpacked(result.filePaths[0])
    if (installResult.ok) {
      const installed = getInstalledPlugins().find((p) => p.manifest.id === installResult.id)
      if (installed) {
        getOverlayWindow()?.webContents.send('plugin-installed', {
          manifest: installed.manifest,
          entryUrl: `${pluginEntryUrl(installed.manifest.id)}?v=${installed.manifest.version}`,
        })
      }
    }
    return installResult
  })

  ipcMain.handle('plugins:fetch-registry', async () => {
    const overrideUrl = (store.get('pluginRegistryUrl') as AppSettings['pluginRegistryUrl']) ?? undefined
    return fetchRegistry(overrideUrl)
  })

  ipcMain.handle('plugins:install-from-registry', async (_evt, entry: unknown) => {
    // Defensive shape check; the renderer should only pass entries it got
    // back from `plugins:fetch-registry`, but trusting the IPC boundary is
    // the same posture we take everywhere else.
    if (!entry || typeof entry !== 'object') {
      return { ok: false as const, error: 'invalid registry entry' }
    }
    const registryResult = await installFromRegistry(
      entry as import('../../shared/plugin-registry-types').RegistryEntry,
    )
    if (registryResult.ok) {
      const installed = getInstalledPlugins().find((p) => p.manifest.id === registryResult.id)
      if (installed) {
        getOverlayWindow()?.webContents.send('plugin-installed', {
          manifest: installed.manifest,
          entryUrl: `${pluginEntryUrl(installed.manifest.id)}?v=${installed.manifest.version}`,
        })
      }
    }
    return registryResult
  })

  ipcMain.handle('plugins:uninstall', async (_evt, pluginId: string) => {
    const uninstallResult = uninstallPlugin(pluginId)
    if (uninstallResult.ok) {
      getOverlayWindow()?.webContents.send('plugin-uninstalled', pluginId)
    }
    return uninstallResult
  })

  ipcMain.handle('plugins:unregister-hotkey', (_evt, pluginId: string) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    removePluginHotkey(pluginId)
    refreshAppMacros()
  })

  ipcMain.handle('plugins:trigger-main-hotkey', async (): Promise<import('../../shared/types').PoeItem | null> => {
    return runMainHotkeyFlow(store, isElevated)
  })

  // Show the overlay BrowserWindow. Called from ctx.openTab() so plugins that
  // bind a hotkey can open the overlay even when no item is being inspected
  // (the standard main-hotkey flow only shows the window after a successful
  // clipboard capture).
  ipcMain.handle('plugins:show-overlay', () => {
    showOverlay()
  })
}
