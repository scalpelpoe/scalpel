import { existsSync } from 'node:fs'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type Store from 'electron-store'
import type { InstalledPluginEntry, PluginLoadEntry } from '@shared/plugin-dependencies'
import type { AppSettings } from '@shared/types'
import { refreshAppMacros } from '../app-macros'
import { runMainHotkeyFlow } from '../evaluation'
import { getOverlayWindow, showOverlay } from '../overlay'
import {
  disposePluginOverlay,
  hidePluginOverlay,
  isPluginOverlayVisible,
  reloadPluginOverlay,
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
import { versionedPluginEntryUrl } from '../plugins/entry-url'
import { validateDependencyMutation } from '../plugins/dependency-mutation'
import { installFromRegistry } from '../plugins/install-from-registry'
import { installUnpacked } from '../plugins/install-unpacked'
import { resolvePluginLoadability } from '../plugins/loadability'
import { getInstalledPlugins, getUnpackedPlugins } from '../plugins/manager'
import { PLUGIN_ID_PATTERN } from '../plugins/manifest-validator'
import { NativeCallError, pluginNativeBackends } from '../plugins/native-backend'
import { validateRegistryMutationPrecondition, validateUninstallPrecondition } from '../plugins/mutation-preconditions'
import { clearPluginOverlayAnchor, getPluginOverlayAnchor, setPluginOverlayAnchor } from '../plugins/overlay-anchors'
import { pluginEntryUrl } from '../plugins/plugin-protocol'
import { fetchRegistry } from '../plugins/registry'
import { resolveRegistrySelection } from '../plugins/registry-selection'
import { deleteValue, getValue, listKeys, setValue } from '../plugins/storage'
import { readInstalledIds } from '../plugins/installed-list'
import { type UninstallResult, uninstallPlugin } from '../plugins/uninstall'
import { getUnpackedSourceDir } from '../plugins/unpacked-list'
import { type UnpackedFlowDeps, installUnpackedAndNotify, reloadUnpackedPlugin } from '../plugins/unpacked-flow'

export type InstalledPluginIpc = InstalledPluginEntry

type PluginDevEntryIpc = PluginLoadEntry

export interface UnpackedPluginIpc extends InstalledPluginIpc {
  /** Absent for plugins side-loaded before Scalpel started tracking source
   *  directories - those cannot be reloaded until loaded unpacked again. */
  sourceDir?: string
}

function resolveInstalledEntries(restartBlocked: ReadonlySet<string> = new Set()): {
  installed: InstalledPluginIpc[]
  loadable: InstalledPluginIpc[]
} {
  const entries: PluginLoadEntry[] = getInstalledPlugins().map((plugin) => ({
    manifest: plugin.manifest,
    entryUrl: pluginEntryUrl(plugin.manifest.id),
  }))
  const resolved = resolvePluginLoadability(entries)
  if (restartBlocked.size === 0) return resolved
  // A plugin mutated this session stays out of the loadable graph until
  // restart. Resolving without it also marks its dependents unavailable
  // instead of loading them against a provider that is not running.
  return {
    installed: resolved.installed,
    loadable: resolvePluginLoadability(entries.filter((entry) => !restartBlocked.has(entry.manifest.id))).loadable,
  }
}

export function register(store: Store<AppSettings>, isElevated: () => boolean = () => false): void {
  const registryConfig = (): {
    url: string | undefined
    allowNativeBackend: boolean
  } => {
    const processOverride = process.env.SCALPEL_PLUGIN_REGISTRY_URL
    const userRegistry = store.get('pluginRegistryUrl') as AppSettings['pluginRegistryUrl']
    return {
      url: processOverride ?? userRegistry ?? undefined,
      allowNativeBackend: Boolean(processOverride) || !userRegistry,
    }
  }

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

  // Broadcast to ALL windows (not just the overlay), the same way
  // notifyTabsChanged does, so the standalone app-window Plugins tab refreshes
  // its update badge + installed list too. Only the overlay has a PluginHost,
  // so only it hot-swaps; other windows just refresh their plugin UI.
  const broadcastDevPlugin = (
    channel: 'plugin-dev-installed' | 'plugin-dev-updated',
    payload: PluginDevEntryIpc,
  ): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, payload)
    }
  }

  const notifyRestartRequired = (): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('plugins:restart-required')
    }
  }

  const unpackedFlowDeps: UnpackedFlowDeps = {
    installedIds: () => getInstalledPlugins().map((p) => p.manifest.id),
    install: installUnpacked,
    manifestOf: (id) => getInstalledPlugins().find((p) => p.manifest.id === id)?.manifest,
    entryUrl: versionedPluginEntryUrl,
    broadcast: broadcastDevPlugin,
    reloadOverlay: reloadPluginOverlay,
    sourceDirOf: getUnpackedSourceDir,
    dirExists: existsSync,
  }

  ipcMain.handle('plugins:list-installed', (): InstalledPluginIpc[] => {
    return resolveInstalledEntries().installed
  })

  ipcMain.handle('plugins:list-loadable', (): InstalledPluginIpc[] => {
    return resolveInstalledEntries(pluginNativeBackends.restartBlockedPluginIds()).loadable
  })

  ipcMain.handle('plugins:list-unpacked', (): UnpackedPluginIpc[] => {
    const unpackedIds = new Set(getUnpackedPlugins().map((plugin) => plugin.manifest.id))
    return resolveInstalledEntries()
      .installed.filter((plugin) => unpackedIds.has(plugin.manifest.id))
      .map((plugin) => {
        const sourceDir = getUnpackedSourceDir(plugin.manifest.id)
        return {
          ...plugin,
          ...(sourceDir ? { sourceDir } : {}),
        }
      })
  })

  ipcMain.handle('plugins:restart-required', (): boolean => pluginNativeBackends.isRestartRequired())

  ipcMain.handle('plugins:get-installed', (_evt, pluginId: string): InstalledPluginIpc | null => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    return resolveInstalledEntries().installed.find((plugin) => plugin.manifest.id === pluginId) ?? null
  })

  ipcMain.handle('plugins:get-loadable', (_evt, pluginId: string): InstalledPluginIpc | null => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    return (
      resolveInstalledEntries(pluginNativeBackends.restartBlockedPluginIds()).loadable.find(
        (plugin) => plugin.manifest.id === pluginId,
      ) ?? null
    )
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
  ipcMain.handle('plugins:native-call', async (_evt, pluginId: string, method: string, payload: Uint8Array) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    try {
      return {
        ok: true as const,
        payload: await pluginNativeBackends.call(pluginId, method, payload),
      }
    } catch (error) {
      if (error instanceof NativeCallError) {
        return {
          ok: false as const,
          error: { message: error.message, code: error.code },
        }
      }
      throw error
    }
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
          title: 'Select plugin project or package directory',
          properties: ['openDirectory'],
        })
      : await dialog.showOpenDialog({
          title: 'Select plugin project or package directory',
          properties: ['openDirectory'],
        })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false as const, error: 'cancelled' }
    }
    return pluginNativeBackends.withAllStopped(() => installUnpackedAndNotify(result.filePaths[0], unpackedFlowDeps))
  })

  // Re-copy a side-loaded plugin from the directory it came from and hot-swap
  // it. Rebuild the plugin, hit Reload, run the new code - no app restart.
  ipcMain.handle('plugins:reload-unpacked', async (_evt, pluginId: string) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    return pluginNativeBackends.withPluginStopped(pluginId, () => reloadUnpackedPlugin(pluginId, unpackedFlowDeps))
  })

  ipcMain.handle('plugins:fetch-registry', async () => {
    // Dev-only override (local test harness) takes precedence over the
    // self-host setting; never set SCALPEL_PLUGIN_REGISTRY_URL in production.
    return fetchRegistry(registryConfig().url)
  })

  // Registry mutations replace files on disk but deliberately leave the running
  // renderer graph intact. The new graph is activated by a full app restart.
  const installOrUpdate = async (
    entry: unknown,
    mode: 'install' | 'update',
  ): Promise<{ ok: true; id: string; restartRequired: true } | { ok: false; error: string }> => {
    // Only the id crosses the trust boundary. Main resolves repository
    // coordinates and hashes from its configured registry.
    const config = registryConfig()
    const selection = await resolveRegistrySelection(entry, config.url)
    if (!selection.ok) return selection
    const result = await pluginNativeBackends.withPluginStoppedUntilRestart(
      selection.entry.id,
      () => {
        const installed = getInstalledPlugins()
        const preconditionError = validateRegistryMutationPrecondition(
          mode,
          selection.entry.id,
          new Set(installed.map((plugin) => plugin.manifest.id)),
          new Set(getUnpackedPlugins().map((plugin) => plugin.manifest.id)),
        )
        if (preconditionError) return { ok: false as const, error: preconditionError }
        const manifests = installed.map((plugin) => plugin.manifest)
        return installFromRegistry(selection.entry, {
          allowNativeBackend: config.allowNativeBackend,
          validateMutation: (manifest) => validateDependencyMutation(manifests, selection.entry.id, manifest),
        })
      },
      (mutation) => mutation.ok,
    )
    if (result.ok) {
      notifyRestartRequired()
      return { ...result, restartRequired: true }
    }
    return result
  }

  ipcMain.handle('plugins:install-from-registry', async (_evt, entry: unknown) => {
    // installOrUpdate treats this only as an id selector and re-resolves the
    // trusted entry in main.
    return installOrUpdate(entry, 'install')
  })

  ipcMain.handle('plugins:update-from-registry', async (_evt, entry: unknown) => {
    return installOrUpdate(entry, 'update')
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
        defaultPosition?: { fracX: number; fracY: number }
        snapPositions?: { fracX: number; fracY: number }[]
        mode?: 'window' | 'annotation'
      },
    ) => {
      if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
      if (opts.mode === 'annotation') {
        registerPluginAnnotationOverlay(pluginId)
      } else {
        registerPluginOverlay(pluginId, {
          title: opts.title,
          defaultSize: opts.defaultSize,
          defaultPosition: opts.defaultPosition,
          snapPositions: Array.isArray(opts.snapPositions) ? opts.snapPositions : undefined,
          storedAnchor: () => getPluginOverlayAnchor(store, pluginId),
          onAnchorChanged: (anchor) => setPluginOverlayAnchor(store, pluginId, anchor),
        })
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
  ipcMain.handle('plugins:overlay-visible', (_evt, pluginId: string): boolean => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    return isPluginOverlayVisible(pluginId)
  })

  // Side-loaded plugins are hot-unloaded immediately rather than deferred to
  // restart, so both uninstall entry points route them through this path.
  const uninstallUnpacked = (pluginId: string): Promise<UninstallResult> =>
    pluginNativeBackends.withPluginStopped(pluginId, () => {
      const dependencyError = validateDependencyMutation(
        getInstalledPlugins().map((plugin) => plugin.manifest),
        pluginId,
        null,
      )
      if (dependencyError) {
        return {
          ok: false as const,
          error: `plugin dependency check failed: ${dependencyError}`,
        }
      }
      const uninstallResult = uninstallPlugin(pluginId)
      if (uninstallResult.ok) {
        for (const win of BrowserWindow.getAllWindows()) win.webContents.send('plugin-dev-uninstalled', pluginId)
        disposePluginOverlay(pluginId)
        clearPluginOverlayAnchor(store, pluginId)
        removePluginHotkey(pluginId)
        removePluginOverlayHotkey(pluginId)
        removePluginTab(pluginId)
        notifyTabsChanged()
        refreshAppMacros()
        notifyHotkeysChanged()
      }
      return uninstallResult
    })

  const isUnpacked = (pluginId: string): boolean =>
    getUnpackedPlugins().some((plugin) => plugin.manifest.id === pluginId)

  ipcMain.handle('plugins:uninstall', async (_evt, pluginId: string) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) return { ok: false as const, error: 'invalid plugin id' }
    if (isUnpacked(pluginId)) return uninstallUnpacked(pluginId)
    const result = await pluginNativeBackends.withPluginStoppedUntilRestart(
      pluginId,
      () => {
        const installed = getInstalledPlugins()
        // installed.json is the source of truth here: a plugin whose manifest
        // went missing or no longer validates must still be removable.
        const preconditionError = validateUninstallPrecondition(pluginId, new Set(readInstalledIds()))
        if (preconditionError) return { ok: false as const, error: preconditionError }
        const dependencyError = validateDependencyMutation(
          installed.map((plugin) => plugin.manifest),
          pluginId,
          null,
        )
        if (dependencyError) {
          return {
            ok: false as const,
            error: `plugin dependency check failed: ${dependencyError}`,
          }
        }
        return uninstallPlugin(pluginId)
      },
      (mutation) => mutation.ok,
    )
    if (result.ok) {
      notifyRestartRequired()
      return { ...result, restartRequired: true as const }
    }
    return result
  })

  ipcMain.handle('plugins:uninstall-unpacked', async (_evt, pluginId: string) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) return { ok: false as const, error: 'invalid plugin id' }
    if (!isUnpacked(pluginId)) {
      return {
        ok: false as const,
        error: `plugin "${pluginId}" is not installed unpacked`,
      }
    }
    return uninstallUnpacked(pluginId)
  })

  ipcMain.handle('plugins:unregister-hotkey', (_evt, pluginId: string) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    removePluginHotkey(pluginId)
    refreshAppMacros()
    notifyHotkeysChanged()
  })

  ipcMain.handle(
    'plugins:trigger-main-hotkey',
    async (
      _evt,
      opts?: { showOverlay?: boolean; dispatch?: boolean },
    ): Promise<import('@shared/types').PoeItem | null> => {
      return runMainHotkeyFlow(store, isElevated, opts)
    },
  )

  // Show the overlay BrowserWindow. Called from ctx.openTab() so plugins that
  // bind a hotkey can open the overlay even when no item is being inspected
  // (the standard main-hotkey flow only shows the window after a successful
  // clipboard capture).
  ipcMain.handle('plugins:show-overlay', () => {
    showOverlay()
  })
}
