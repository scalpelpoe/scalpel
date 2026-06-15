import { BrowserWindow, dialog, ipcMain } from 'electron'
import type Store from 'electron-store'
import type { PluginManifest } from '../../plugin-sdk/src/types'
import type { AppSettings } from '@shared/types'
import { refreshAppMacros } from '../app-macros'
import { runMainHotkeyFlow } from '../evaluation'
import { getOverlayWindow, showOverlay } from '../overlay'
import {
  disposePluginOverlay,
  hidePluginOverlay,
  registerPluginAnnotationOverlay,
  registerPluginOverlay,
  showPluginOverlay,
} from '../plugin-overlay'
import {
  getRegisteredOverlayHotkeys,
  getRegisteredPluginHotkeys,
  removePluginHotkey,
  removePluginOverlayHotkey,
  setPluginHotkey,
  setPluginOverlayHotkey,
} from '../plugins/hotkey-registry'
import { getRegisteredPluginTabs, removePluginTab, setPluginTab } from '../plugins/tab-registry'
import { installFromRegistry } from '../plugins/install-from-registry'
import { installUnpacked } from '../plugins/install-unpacked'
import { getInstalledPlugins, getUnpackedPlugins } from '../plugins/manager'
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
  const notifyHotkeysChanged = (): void => {
    getOverlayWindow()?.webContents.send('plugin-hotkeys-changed')
  }

  // Broadcast to ALL windows (not just the overlay) so the standalone app-window
  // settings refresh their plugin-tab toggles live on hot-install/uninstall.
  const notifyTabsChanged = (): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('plugin-tabs-changed')
    }
  }

  ipcMain.handle('plugins:list-installed', (): InstalledPluginIpc[] => {
    return getInstalledPlugins().map((p) => ({
      manifest: p.manifest,
      entryUrl: pluginEntryUrl(p.manifest.id),
    }))
  })

  ipcMain.handle('plugins:list-unpacked', (): InstalledPluginIpc[] => {
    return getUnpackedPlugins().map((p) => ({
      manifest: p.manifest,
      entryUrl: pluginEntryUrl(p.manifest.id),
    }))
  })

  ipcMain.handle('plugins:get-installed', (_evt, pluginId: string): InstalledPluginIpc | null => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    const found = getInstalledPlugins().find((p) => p.manifest.id === pluginId)
    if (!found) return null
    return { manifest: found.manifest, entryUrl: pluginEntryUrl(found.manifest.id) }
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
    notifyHotkeysChanged()
  })

  ipcMain.handle('plugins:list-registered-hotkeys', () => {
    const actions = Array.from(getRegisteredPluginHotkeys(), ([id, { label }]) => ({
      action: `plugin:${id}`,
      pluginId: id,
      label,
    }))
    const overlayRows = Array.from(getRegisteredOverlayHotkeys(), ([id, { label }]) => ({
      action: `plugin-overlay:${id}`,
      pluginId: id,
      label,
    }))
    return [...actions, ...overlayRows]
  })

  ipcMain.handle('plugins:register-tab', (_evt, pluginId: string, label: string, icon: string) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    setPluginTab(pluginId, label, icon)
    notifyTabsChanged()
  })

  ipcMain.handle('plugins:unregister-tab', (_evt, pluginId: string) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    removePluginTab(pluginId)
    notifyTabsChanged()
  })

  ipcMain.handle('plugins:list-registered-tabs', () => {
    return Array.from(getRegisteredPluginTabs(), ([pluginId, { label, icon }]) => ({ pluginId, label, icon }))
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
    // Dev-only override (local test harness) takes precedence over the
    // self-host setting; never set SCALPEL_PLUGIN_REGISTRY_URL in production.
    const overrideUrl =
      process.env.SCALPEL_PLUGIN_REGISTRY_URL ??
      (store.get('pluginRegistryUrl') as AppSettings['pluginRegistryUrl']) ??
      undefined
    return fetchRegistry(overrideUrl)
  })

  // Install and update share the same download/validate/write path; they differ
  // only in the event the renderer reacts to (fresh-load vs unload-then-reload).
  const installOrUpdate = async (
    entry: unknown,
    channel: 'plugin-installed' | 'plugin-updated',
  ): Promise<import('../plugins/install-types').InstallResult> => {
    if (!entry || typeof entry !== 'object') {
      return { ok: false as const, error: 'invalid registry entry' }
    }
    const result = await installFromRegistry(entry as import('@shared/plugin-registry-types').RegistryEntry)
    if (result.ok) {
      const installed = getInstalledPlugins().find((p) => p.manifest.id === result.id)
      if (installed) {
        getOverlayWindow()?.webContents.send(channel, {
          manifest: installed.manifest,
          entryUrl: `${pluginEntryUrl(installed.manifest.id)}?v=${installed.manifest.version}`,
        })
      }
    }
    return result
  }

  ipcMain.handle('plugins:install-from-registry', async (_evt, entry: unknown) => {
    // Defensive shape check; the renderer should only pass entries it got
    // back from `plugins:fetch-registry`, but trusting the IPC boundary is
    // the same posture we take everywhere else.
    return installOrUpdate(entry, 'plugin-installed')
  })

  ipcMain.handle('plugins:update-from-registry', async (_evt, entry: unknown) => {
    // Distinct from `plugin-installed`: the renderer must take the
    // unload-then-reload path, not the fresh-load path (which no-ops when a
    // tab for this id already exists). Cache-bust the entry URL with the new
    // version so importPluginModule fetches the new code.
    return installOrUpdate(entry, 'plugin-updated')
  })

  ipcMain.handle(
    'plugins:register-overlay',
    (
      _evt,
      pluginId: string,
      opts: {
        title: string
        hotkeyLabel?: string
        defaultSize?: { width: number; height: number }
        mode?: 'window' | 'annotation'
      },
    ) => {
      if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
      if (opts.mode === 'annotation') {
        registerPluginAnnotationOverlay(pluginId)
      } else {
        registerPluginOverlay(pluginId, { title: opts.title, defaultSize: opts.defaultSize })
      }
      if (opts.hotkeyLabel) {
        setPluginOverlayHotkey(pluginId, opts.hotkeyLabel)
        refreshAppMacros()
        notifyHotkeysChanged()
      }
    },
  )
  ipcMain.handle('plugins:open-overlay', (_evt, pluginId: string) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    showPluginOverlay(pluginId)
  })
  ipcMain.handle('plugins:close-overlay', (_evt, pluginId: string) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    hidePluginOverlay(pluginId)
  })

  ipcMain.handle('plugins:uninstall', async (_evt, pluginId: string) => {
    const uninstallResult = uninstallPlugin(pluginId)
    if (uninstallResult.ok) {
      getOverlayWindow()?.webContents.send('plugin-uninstalled', pluginId)
      disposePluginOverlay(pluginId)
      removePluginHotkey(pluginId)
      removePluginOverlayHotkey(pluginId)
      removePluginTab(pluginId)
      notifyTabsChanged()
      refreshAppMacros()
      notifyHotkeysChanged()
    }
    return uninstallResult
  })

  ipcMain.handle('plugins:unregister-hotkey', (_evt, pluginId: string) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    removePluginHotkey(pluginId)
    refreshAppMacros()
    notifyHotkeysChanged()
  })

  ipcMain.handle('plugins:trigger-main-hotkey', async (): Promise<import('@shared/types').PoeItem | null> => {
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
