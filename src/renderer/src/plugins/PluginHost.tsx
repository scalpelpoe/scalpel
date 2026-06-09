import { useCallback, useEffect, useRef, useState } from 'react'
import type { PoeItem, Zone } from '../../../shared/types'
import type { PluginActivate, PluginManifest } from '../../../plugin-sdk/src/types'
import { createPluginContext } from './context'
import { importPluginModule } from './import-plugin-module'

export interface RegisteredTab {
  pluginId: string
  label: string
  icon: string
  render: (container: HTMLElement) => (() => void) | void
  /** Present when the plugin also registered an overlay window; drives the
   *  "pop out" button in the tab content pane. */
  overlay?: { title: string; icon?: string }
}

export interface PluginHostProps {
  ready: boolean
  poeVersion: 1 | 2
  league: string
  currentItem: PoeItem | null
  currentZone: Zone | null
  onSubscribeCurrentItem: (h: (i: PoeItem) => void) => () => void
  onSubscribeCurrentZone: (h: (z: Zone) => void) => () => void
  onSubscribeLeagueChange: (h: (l: string) => void) => () => void
  onOpenExternal: (url: string) => void
  onTabsChange: (tabs: RegisteredTab[]) => void
  onOpenPluginTab: (pluginId: string) => void
  onCopyAndEvaluateItem: () => Promise<PoeItem | null>
  onPluginError?: (id: string, error: Error) => void
  onPluginUnloaded?: (pluginId: string) => void
}

export function PluginHost(props: PluginHostProps): JSX.Element | null {
  const [tabs, setTabs] = useState<RegisteredTab[]>([])
  const loadedRef = useRef(false)
  const pluginHotkeyHandlersRef = useRef<Map<string, () => void>>(new Map())
  const pendingOverlayRef = useRef<Map<string, { title: string; icon?: string }>>(new Map())
  // Per-plugin unsubscribe fns the host collected by wrapping ctx subscriptions,
  // plus the optional teardown fn the plugin returned from activate(). Both are
  // drained by unloadPlugin so a reload (or uninstall) leaves nothing running.
  const pluginDisposersRef = useRef<Map<string, Array<() => void>>>(new Map())
  const pluginTeardownRef = useRef<Map<string, () => void>>(new Map())
  // Latest-value refs let our captured-once subscribe callbacks return current values.
  const poeVersionRef = useRef(props.poeVersion)
  const leagueRef = useRef(props.league)
  const currentItemRef = useRef(props.currentItem)
  const currentZoneRef = useRef(props.currentZone)
  poeVersionRef.current = props.poeVersion
  leagueRef.current = props.league
  currentItemRef.current = props.currentItem
  currentZoneRef.current = props.currentZone

  // Keep stable refs to callbacks so event-handler effects don't close over stale props.
  const onPluginErrorRef = useRef(props.onPluginError)
  const onPluginUnloadedRef = useRef(props.onPluginUnloaded)
  onPluginErrorRef.current = props.onPluginError
  onPluginUnloadedRef.current = props.onPluginUnloaded

  const onSubscribeCurrentItemRef = useRef(props.onSubscribeCurrentItem)
  const onSubscribeCurrentZoneRef = useRef(props.onSubscribeCurrentZone)
  const onSubscribeLeagueChangeRef = useRef(props.onSubscribeLeagueChange)
  const onOpenExternalRef = useRef(props.onOpenExternal)
  const onOpenPluginTabRef = useRef(props.onOpenPluginTab)
  const onCopyAndEvaluateItemRef = useRef(props.onCopyAndEvaluateItem)
  onSubscribeCurrentItemRef.current = props.onSubscribeCurrentItem
  onSubscribeCurrentZoneRef.current = props.onSubscribeCurrentZone
  onSubscribeLeagueChangeRef.current = props.onSubscribeLeagueChange
  onOpenExternalRef.current = props.onOpenExternal
  onOpenPluginTabRef.current = props.onOpenPluginTab
  onCopyAndEvaluateItemRef.current = props.onCopyAndEvaluateItem

  // Push every tab list change up to the parent
  useEffect(() => {
    props.onTabsChange(tabs)
  }, [tabs, props.onTabsChange])

  // Extracted per-plugin load logic used by both the initial-load loop and the
  // hot-install event handler. Wrapped in useCallback([]) so identity is stable
  // across renders; all prop callbacks are read through refs.
  const loadPlugin = useCallback(async (entry: { manifest: PluginManifest; entryUrl: string }): Promise<void> => {
    const m = entry.manifest
    if (m.poeVersions && !m.poeVersions.includes(poeVersionRef.current)) return
    const disposers: Array<() => void> = []
    try {
      const mod = (await importPluginModule(entry.entryUrl)) as { default: PluginActivate }
      if (typeof mod.default !== 'function') {
        throw new Error('plugin module has no default export function')
      }
      const ctx = createPluginContext({
        pluginId: m.id,
        pluginVersion: m.version,
        getPoeVersion: () => poeVersionRef.current,
        getLeague: () => leagueRef.current,
        getCurrentItem: () => currentItemRef.current,
        getCurrentZone: () => currentZoneRef.current,
        subscribeCurrentItem: (h) => {
          const u = onSubscribeCurrentItemRef.current(h)
          disposers.push(u)
          return u
        },
        subscribeCurrentZone: (h) => {
          const u = onSubscribeCurrentZoneRef.current(h)
          disposers.push(u)
          return u
        },
        subscribeLeagueChange: (h) => {
          const u = onSubscribeLeagueChangeRef.current(h)
          disposers.push(u)
          return u
        },
        onLogLine: (h) => {
          const u = window.api.onLogLine(h)
          disposers.push(u)
          return u
        },
        getRecentLogLines: (count) => window.api.getRecentLogLines(count),
        openExternal: (url) => onOpenExternalRef.current(url),
        storage: {
          get: (key) => window.api.pluginStorageGet(m.id, key),
          set: (key, value) => window.api.pluginStorageSet(m.id, key, value),
          delete: (key) => window.api.pluginStorageDelete(m.id, key),
          keys: () => window.api.pluginStorageKeys(m.id),
        },
        gameConfig: {
          read: () => window.api.gameConfigRead(),
          write: (content) => window.api.gameConfigWrite(content),
          onChange: (handler) => {
            const u = window.api.onGameConfigChange(handler)
            disposers.push(u)
            return u
          },
        },
        prices: {
          getPrices: (opts) => window.api.pricesGet(opts),
          refresh: () => window.api.pricesRefresh(),
          onChange: (handler) => {
            const u = window.api.onPricesChange(handler)
            disposers.push(u)
            return u
          },
        },
        registerTab: (pluginId, opts) => {
          setTabs((prev) => {
            if (prev.find((t) => t.pluginId === pluginId)) return prev
            return [...prev, { pluginId, ...opts, overlay: pendingOverlayRef.current.get(pluginId) }]
          })
          // Mirror registerHotkey: report to main so any window (incl. the
          // standalone app settings) can list this tab for the Show/Hide UI.
          void window.api.pluginRegisterTab(pluginId, opts.label, opts.icon)
        },
        registerHotkey: (pluginId, opts, handler) => {
          pluginHotkeyHandlersRef.current.set(pluginId, handler)
          void window.api.pluginRegisterHotkey(pluginId, opts.label)
        },
        openTab: (pluginId) => onOpenPluginTabRef.current(pluginId),
        copyAndEvaluateItem: () => onCopyAndEvaluateItemRef.current(),
        registerOverlay: (pluginId, opts) => {
          pendingOverlayRef.current.set(pluginId, { title: opts.title, icon: opts.icon })
          setTabs((prev) =>
            prev.map((t) => (t.pluginId === pluginId ? { ...t, overlay: { title: opts.title, icon: opts.icon } } : t)),
          )
          void window.api.pluginRegisterOverlay(pluginId, {
            title: opts.title,
            hotkeyLabel: opts.hotkeyLabel,
            defaultSize: opts.defaultSize,
          })
        },
        openOverlay: (pluginId) => void window.api.pluginOpenOverlay(pluginId),
        closeOverlay: (pluginId) => void window.api.pluginCloseOverlay(pluginId),
      })
      pluginDisposersRef.current.set(m.id, disposers)
      // PluginActivate may be async and may return a teardown fn (host runtime
      // honors it regardless of the SDK's published type; see the SDK task).
      const teardown = await mod.default(ctx)
      if (typeof teardown === 'function') {
        pluginTeardownRef.current.set(m.id, teardown as () => void)
      }
    } catch (err) {
      // activate() may have subscribed before throwing; dispose what it set up
      // so a failed load does not leak subscriptions.
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          // ignore: one bad unsubscribe must not block the rest
        }
      }
      pluginDisposersRef.current.delete(m.id)
      pluginTeardownRef.current.delete(m.id)
      onPluginErrorRef.current?.(m.id, err instanceof Error ? err : new Error(String(err)))
    }
  }, [])

  // Fully tear a plugin down: run its teardown fn, drop all tracked
  // subscriptions, remove its tab/hotkey/overlay state, and tell main to
  // unregister. Used by both hot-uninstall and update-reload.
  const unloadPlugin = useCallback((pluginId: string): void => {
    const teardown = pluginTeardownRef.current.get(pluginId)
    if (teardown) {
      try {
        teardown()
      } catch (err) {
        onPluginErrorRef.current?.(pluginId, err instanceof Error ? err : new Error(String(err)))
      }
      pluginTeardownRef.current.delete(pluginId)
    }
    const disposers = pluginDisposersRef.current.get(pluginId)
    if (disposers) {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch {
          // A misbehaving unsubscribe must not block the rest of teardown.
        }
      }
      pluginDisposersRef.current.delete(pluginId)
    }
    setTabs((prev) => prev.filter((t) => t.pluginId !== pluginId))
    pluginHotkeyHandlersRef.current.delete(pluginId)
    pendingOverlayRef.current.delete(pluginId)
    void window.api.pluginUnregisterHotkey(pluginId)
    void window.api.pluginUnregisterTab(pluginId)
  }, [])

  useEffect(() => {
    if (!props.ready || loadedRef.current) return
    loadedRef.current = true
    let cancelled = false

    void (async () => {
      const installed = await window.api.listInstalledPlugins()
      if (cancelled) return
      for (const entry of installed) {
        if (cancelled) return
        await loadPlugin(entry)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [props.ready])

  // Hot-install: load a newly installed plugin without restart.
  useEffect(() => {
    return window.api.onPluginInstalled(async (entry) => {
      await loadPlugin(entry)
    })
  }, [])

  // Hot-update: unload the running instance, then reload the new code. The
  // cache-busted entryUrl (?v=<newVersion>) makes importPluginModule fetch fresh.
  useEffect(() => {
    return window.api.onPluginUpdated(async (entry) => {
      unloadPlugin(entry.manifest.id)
      await loadPlugin(entry)
    })
  }, [unloadPlugin])

  // Hot-uninstall: fully unload the plugin (this also disposes subscriptions the
  // old inline handler leaked).
  useEffect(() => {
    return window.api.onPluginUninstalled((pluginId) => {
      unloadPlugin(pluginId)
      onPluginUnloadedRef.current?.(pluginId)
    })
  }, [unloadPlugin])

  useEffect(() => {
    return window.api.onPluginMacro((action: string) => {
      const PREFIX = 'plugin:'
      if (!action.startsWith(PREFIX)) return
      const pluginId = action.slice(PREFIX.length)
      const handler = pluginHotkeyHandlersRef.current.get(pluginId)
      if (!handler) return
      try {
        handler()
      } catch (err) {
        onPluginErrorRef.current?.(pluginId, err instanceof Error ? err : new Error(String(err)))
      }
    })
  }, [])

  return null
}
