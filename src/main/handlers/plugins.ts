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
import { commitRegistryInstall, prepareRegistryInstall } from '../plugins/install-from-registry'
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
import { deleteValue, getValue, listKeys, removeStorageNow, setValue } from '../plugins/storage'
import { readInstalledIds } from '../plugins/installed-list'
import type { InstallResult } from '../plugins/install-types'
import { type UninstallResult, uninstallPlugin } from '../plugins/uninstall'
import { getUnpackedSourceDir } from '../plugins/unpacked-list'
import { type UnpackedFlowDeps, installUnpackedAndNotify, reloadUnpackedPlugin } from '../plugins/unpacked-flow'

export type InstalledPluginIpc = InstalledPluginEntry

export interface UnpackedPluginIpc extends InstalledPluginIpc {
  /** Absent for plugins side-loaded before Scalpel started tracking source
   *  directories - those cannot be reloaded until loaded unpacked again. */
  sourceDir?: string
}

/** `mutating` holds the ids whose files are mid-mutation right now. */
function resolveInstalledEntries(mutating: ReadonlySet<string> = new Set()): {
  installed: InstalledPluginIpc[]
  loadable: InstalledPluginIpc[]
} {
  const entries: PluginLoadEntry[] = getInstalledPlugins().map((plugin) => ({
    manifest: plugin.manifest,
    entryUrl: pluginEntryUrl(plugin.manifest.id),
  }))
  const resolved = resolvePluginLoadability(entries)
  if (mutating.size === 0) return resolved
  // A plugin whose files are being swapped stays out of the loadable graph
  // until the swap settles. Resolving without it also marks its dependents
  // unavailable instead of loading them against a half-written provider.
  return {
    installed: resolved.installed,
    loadable: resolvePluginLoadability(entries.filter((entry) => !mutating.has(entry.manifest.id))).loadable,
  }
}

function runPostUninstallCleanup(pluginId: string, operation: () => void): void {
  try {
    operation()
  } catch (error) {
    console.error(`[plugins] post-uninstall cleanup failed for ${pluginId}:`, error)
  }
}

/** Mutation handlers are awaited by the renderer without a catch, so a rejected
 *  invoke shows the user nothing at all. Turn every throw into the same
 *  `{ ok: false, error }` shape the callers already render. */
export async function mutationResult<T extends { ok: boolean }>(
  pluginId: string,
  run: () => Promise<T> | T,
): Promise<T | { ok: false; error: string }> {
  try {
    return await run()
  } catch (error) {
    console.error(`[plugins] mutation failed for ${pluginId}:`, error)
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
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
  const broadcastPlugin = (channel: 'plugin-installed' | 'plugin-updated', payload: PluginLoadEntry): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, payload)
    }
  }

  const unpackedFlowDeps: UnpackedFlowDeps = {
    installedIds: () => getInstalledPlugins().map((p) => p.manifest.id),
    install: installUnpacked,
    manifestOf: (id) => getInstalledPlugins().find((p) => p.manifest.id === id)?.manifest,
    entryUrl: versionedPluginEntryUrl,
    broadcast: broadcastPlugin,
    reloadOverlay: reloadPluginOverlay,
    sourceDirOf: getUnpackedSourceDir,
    dirExists: existsSync,
  }

  // The unpacked flow notifies from inside the lifecycle lock. Queue those
  // notifications and flush them once the lock is released, so a renderer that
  // reacts by listing loadable plugins never sees this plugin still blocked.
  const runUnpackedFlow = async (
    withLock: (operation: () => InstallResult) => Promise<InstallResult>,
    flow: (deps: UnpackedFlowDeps) => InstallResult,
  ): Promise<InstallResult> => {
    const notifications: Array<() => void> = []
    const result = await withLock(() =>
      flow({
        ...unpackedFlowDeps,
        broadcast: (channel, payload) => notifications.push(() => broadcastPlugin(channel, payload)),
        reloadOverlay: (id) => notifications.push(() => reloadPluginOverlay(id)),
      }),
    )
    for (const notify of notifications) notify()
    return result
  }

  ipcMain.handle('plugins:list-installed', (): InstalledPluginIpc[] => {
    return resolveInstalledEntries().installed
  })

  ipcMain.handle('plugins:list-loadable', (): InstalledPluginIpc[] => {
    return resolveInstalledEntries(pluginNativeBackends.loadBlockedPluginIds()).loadable
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

  ipcMain.handle('plugins:get-installed', (_evt, pluginId: string): InstalledPluginIpc | null => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    return resolveInstalledEntries().installed.find((plugin) => plugin.manifest.id === pluginId) ?? null
  })

  ipcMain.handle('plugins:get-loadable', (_evt, pluginId: string): InstalledPluginIpc | null => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    return (
      resolveInstalledEntries(pluginNativeBackends.loadBlockedPluginIds()).loadable.find(
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
      // Never reject: a rejected invoke reaches the plugin as Electron's generic
      // "Error invoking remote method" instead of the documented result shape.
      console.error(`[plugins] native call ${pluginId}.${method} failed:`, error)
      return {
        ok: false as const,
        error: { message: error instanceof Error ? error.message : String(error), code: 'INTERNAL' },
      }
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
    return mutationResult(result.filePaths[0] ?? 'unpacked', () =>
      runUnpackedFlow(
        (operation) => pluginNativeBackends.withAllStopped(operation),
        (deps) => installUnpackedAndNotify(result.filePaths[0], deps),
      ),
    )
  })

  // Re-copy a side-loaded plugin from the directory it came from and hot-swap
  // it. Rebuild the plugin, hit Reload, run the new code - no app restart.
  ipcMain.handle('plugins:reload-unpacked', async (_evt, pluginId: string) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
    return mutationResult(pluginId, () =>
      runUnpackedFlow(
        (operation) => pluginNativeBackends.withPluginStopped(pluginId, operation),
        (deps) => reloadUnpackedPlugin(pluginId, deps),
      ),
    )
  })

  ipcMain.handle('plugins:fetch-registry', async () => {
    // Dev-only override (local test harness) takes precedence over the
    // self-host setting; never set SCALPEL_PLUGIN_REGISTRY_URL in production.
    return fetchRegistry(registryConfig().url)
  })

  // Registry mutations hot-apply: the package is swapped with this plugin's
  // native worker stopped, then every window is told to load (install) or
  // unload-then-reload (update) it. The renderer reconciles the dependency graph
  // and the next native call respawns the worker from the new files.
  const installOrUpdate = async (
    entry: unknown,
    mode: 'install' | 'update',
  ): Promise<{ ok: true; id: string } | { ok: false; error: string }> => {
    // Only the id crosses the trust boundary. Main resolves repository
    // coordinates and hashes from its configured registry.
    const config = registryConfig()
    const selection = await resolveRegistrySelection(entry, config.url)
    if (!selection.ok) return selection
    const pluginId = selection.entry.id
    const precondition = (installedIds: Set<string>): string | null =>
      validateRegistryMutationPrecondition(
        mode,
        pluginId,
        installedIds,
        new Set(getUnpackedPlugins().map((plugin) => plugin.manifest.id)),
      )
    // Checked before the download so an "already installed" install spends no
    // requests; re-checked under the lock because state can move meanwhile.
    const earlyError = precondition(new Set(getInstalledPlugins().map((plugin) => plugin.manifest.id)))
    if (earlyError) return { ok: false, error: earlyError }
    // The download stays OUTSIDE the lifecycle lock: holding it would stop the
    // live native worker, block this plugin from loading and queue every other
    // plugin's lifecycle op behind five sequential network round trips.
    const prepared = await prepareRegistryInstall(selection.entry, { allowNativeBackend: config.allowNativeBackend })
    if (!prepared.ok) return prepared
    const result = await pluginNativeBackends.withPluginStopped(pluginId, () => {
      const installed = getInstalledPlugins()
      const preconditionError = precondition(new Set(installed.map((plugin) => plugin.manifest.id)))
      if (preconditionError) return { ok: false as const, error: preconditionError }
      const manifests = installed.map((plugin) => plugin.manifest)
      return commitRegistryInstall(prepared.prepared, (manifest) =>
        validateDependencyMutation(manifests, pluginId, manifest),
      )
    })
    if (!result.ok) return result
    // Notify only after the lock is released, so a renderer that reacts by
    // listing loadable plugins sees this one as loadable rather than blocked.
    const installed = getInstalledPlugins().find((plugin) => plugin.manifest.id === result.id)
    if (installed) {
      // Distinct events: an update must take the unload-then-reload path, not
      // the fresh-load path (which no-ops when the plugin is already loaded).
      // The versioned entry URL cache-busts the module import.
      broadcastPlugin(mode === 'install' ? 'plugin-installed' : 'plugin-updated', {
        manifest: installed.manifest,
        entryUrl: versionedPluginEntryUrl(installed.manifest.id, installed.manifest.version),
      })
      // The popped-out window does not listen for plugin-updated; reload it so
      // it re-imports the new code instead of running stale.
      if (mode === 'update') reloadPluginOverlay(installed.manifest.id)
    }
    return result
  }

  // The registry entry is untrusted, so only its id is usable for logging here.
  const requestedIdOf = (entry: unknown): string => {
    const id = entry && typeof entry === 'object' ? (entry as { id?: unknown }).id : null
    return typeof id === 'string' ? id : 'registry plugin'
  }

  ipcMain.handle('plugins:install-from-registry', async (_evt, entry: unknown) => {
    // installOrUpdate treats this only as an id selector and re-resolves the
    // trusted entry in main.
    return mutationResult(requestedIdOf(entry), () => installOrUpdate(entry, 'install'))
  })

  ipcMain.handle('plugins:update-from-registry', async (_evt, entry: unknown) => {
    return mutationResult(requestedIdOf(entry), () => installOrUpdate(entry, 'update'))
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
        dismissOnEscape?: boolean
        dismissOnGameClick?: boolean
      },
    ) => {
      if (!PLUGIN_ID_PATTERN.test(pluginId)) throw new Error('invalid plugin id')
      if (opts.mode === 'annotation') {
        registerPluginAnnotationOverlay(pluginId, opts.dismissOnEscape === true, opts.dismissOnGameClick === true)
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

  // Registry and side-loaded plugins uninstall the same way: remove the package
  // with the native worker stopped, then hot-unload it from every window.
  const uninstall = async (pluginId: string, route: 'registry' | 'unpacked'): Promise<UninstallResult> => {
    const result = await pluginNativeBackends.withPluginStopped(pluginId, (): UninstallResult => {
      if (route === 'registry') {
        // installed.json is the source of truth here: a plugin whose manifest
        // went missing or no longer validates must still be removable.
        const preconditionError = validateUninstallPrecondition(pluginId, new Set(readInstalledIds()))
        if (preconditionError) return { ok: false, error: preconditionError }
      }
      const dependencyError = validateDependencyMutation(
        getInstalledPlugins().map((plugin) => plugin.manifest),
        pluginId,
        null,
      )
      if (dependencyError) {
        return {
          ok: false,
          error: `plugin dependency check failed: ${dependencyError}`,
        }
      }
      const removal = uninstallPlugin(pluginId)
      if (removal.ok) {
        // Storage is removed under the lock with the package. Removed after the
        // lock, it could wipe (and mark removed) the storage of a same-id
        // install queued right behind this uninstall.
        try {
          removeStorageNow(pluginId)
        } catch (error) {
          // The package and metadata are already committed. Keep the successful
          // result; the pending deletion retries storage cleanup on next launch.
          console.error(`[plugins] failed to remove storage for ${pluginId}:`, error)
        }
      }
      return removal
    })
    if (!result.ok) return result
    // Notify and clean up once the lock is released, so a renderer reacting to
    // plugin-uninstalled sees a settled graph. The package is already gone, so
    // each step is isolated and none undoes success.
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send('plugin-uninstalled', pluginId)
      } catch (error) {
        console.error(`[plugins] failed to notify a window that ${pluginId} was uninstalled:`, error)
      }
    }
    // The package is gone, so the pop-out cannot be reloaded: close it and
    // forget its geometry instead of leaving a stale anchor in the store.
    runPostUninstallCleanup(pluginId, () => disposePluginOverlay(pluginId))
    runPostUninstallCleanup(pluginId, () => clearPluginOverlayAnchor(store, pluginId))
    runPostUninstallCleanup(pluginId, () => removePluginHotkey(pluginId))
    runPostUninstallCleanup(pluginId, () => removePluginOverlayHotkey(pluginId))
    runPostUninstallCleanup(pluginId, () => removePluginTab(pluginId))
    runPostUninstallCleanup(pluginId, notifyTabsChanged)
    runPostUninstallCleanup(pluginId, refreshAppMacros)
    runPostUninstallCleanup(pluginId, notifyHotkeysChanged)
    return result
  }

  const isUnpacked = (pluginId: string): boolean =>
    getUnpackedPlugins().some((plugin) => plugin.manifest.id === pluginId)

  ipcMain.handle('plugins:uninstall', async (_evt, pluginId: string) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) return { ok: false as const, error: 'invalid plugin id' }
    return mutationResult(pluginId, () => uninstall(pluginId, isUnpacked(pluginId) ? 'unpacked' : 'registry'))
  })

  ipcMain.handle('plugins:uninstall-unpacked', async (_evt, pluginId: string) => {
    if (!PLUGIN_ID_PATTERN.test(pluginId)) return { ok: false as const, error: 'invalid plugin id' }
    if (!isUnpacked(pluginId)) {
      return {
        ok: false as const,
        error: `plugin "${pluginId}" is not installed unpacked`,
      }
    }
    return mutationResult(pluginId, () => uninstall(pluginId, 'unpacked'))
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
