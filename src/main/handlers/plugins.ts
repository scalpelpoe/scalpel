import { ipcMain, dialog, BrowserWindow } from 'electron'
import { pathToFileURL } from 'url'
import { getInstalledPlugins } from '../plugins/manager'
import { getValue, setValue, deleteValue, listKeys } from '../plugins/storage'
import { refreshAppMacros } from '../app-macros'
import { setPluginHotkey, getRegisteredPluginHotkeys } from '../plugins/hotkey-registry'
import { PLUGIN_ID_PATTERN } from '../plugins/manifest-validator'
import { installUnpacked } from '../plugins/install-unpacked'
import { fetchRegistry } from '../plugins/registry'
import { installFromRegistry } from '../plugins/install-from-registry'
import { uninstallPlugin } from '../plugins/uninstall'
import type { PluginManifest } from '../../plugin-sdk/src/types'
import type { AppSettings } from '../../shared/types'
import type Store from 'electron-store'

export interface InstalledPluginIpc {
  manifest: PluginManifest
  entryUrl: string
}

export function register(store: Store<AppSettings>): void {
  ipcMain.handle('plugins:list-installed', (): InstalledPluginIpc[] => {
    return getInstalledPlugins().map((p) => ({
      manifest: p.manifest,
      entryUrl: pathToFileURL(p.entryPath).toString(),
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
    return installUnpacked(result.filePaths[0])
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
    return installFromRegistry(entry as import('../../shared/plugin-registry-types').RegistryEntry)
  })

  ipcMain.handle('plugins:uninstall', async (_evt, pluginId: string) => {
    return uninstallPlugin(pluginId)
  })
}
