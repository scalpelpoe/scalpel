import { useCallback, useEffect, useRef, useState } from 'react'
import type { PoeItem, Zone } from '@shared/types'
import type { PluginActivate, PluginManifest } from '../../../plugin-sdk/src/types'
import { createPluginContext } from './context'
import type { RegisteredPriceCheckAction } from './types'
import { resolveLeagueOptions } from '@renderer/shared/league-options'
import { importPluginModule } from './import-plugin-module'

export interface RegisteredTab {
  pluginId: string
  label: string
  icon: string
  render: (container: HTMLElement) => (() => void) | void
  /** Present when the plugin also registered an overlay window; drives the
   *  "pop out" button in the tab content pane. `mode` is only shown for
   *  'window' overlays - 'annotation' overlays are click-through surfaces
   *  with no chrome, so popping one out shows nothing. */
  overlay?: { title: string; icon?: string; mode?: 'window' | 'annotation' }
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
  onPriceCheckActionsChange?: (actions: RegisteredPriceCheckAction[]) => void
  onOpenPluginTab: (pluginId: string) => void
  onCopyAndEvaluateItem: (opts?: { showOverlay?: boolean; dispatch?: boolean }) => Promise<PoeItem | null>
  onPluginError?: (id: string, error: Error) => void
  onPluginUnloaded?: (pluginId: string) => void
}

export function PluginHost(props: PluginHostProps): JSX.Element | null {
  const [tabs, setTabs] = useState<RegisteredTab[]>([])
  const [priceCheckActions, setPriceCheckActions] = useState<RegisteredPriceCheckAction[]>([])
  const loadedRef = useRef(false)
  const pluginHotkeyHandlersRef = useRef<Map<string, () => void>>(new Map())
  const pendingOverlayRef = useRef<Map<string, { title: string; icon?: string; mode?: 'window' | 'annotation' }>>(
    new Map(),
  )
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

  useEffect(() => {
    props.onPriceCheckActionsChange?.(priceCheckActions)
  }, [priceCheckActions, props.onPriceCheckActionsChange])

  // Extracted per-plugin load logic used by both the initial-load loop and the
  // hot-install event handler. Wrapped in useCallback([]) so identity is stable
  // across renders; all prop callbacks are read through refs.
  const loadPlugin = useCallback(async (entry: { manifest: PluginManifest; entryUrl: string }): Promise<void> => {
    const m = entry.manifest
    if (m.poeVersions && !m.poeVersions.includes(poeVersionRef.current)) return
    const disposers: Array<() => void> = []
    // The disposer list also identifies this activation across async import/activate and hot reload.
    pluginDisposersRef.current.set(m.id, disposers)
    const subscribeWhileLoaded = (subscribe: () => () => void): (() => void) => {
      if (pluginDisposersRef.current.get(m.id) !== disposers) return () => {}
      const unsubscribe = subscribe()
      disposers.push(unsubscribe)
      return unsubscribe
    }
    let priceCheckAction: RegisteredPriceCheckAction | undefined
    let activating = true
    try {
      const mod = (await importPluginModule(entry.entryUrl)) as { default: PluginActivate }
      if (pluginDisposersRef.current.get(m.id) !== disposers) return
      if (typeof mod.default !== 'function') {
        throw new Error('plugin module has no default export function')
      }
      const ctx = createPluginContext({
        pluginId: m.id,
        pluginVersion: m.version,
        getPoeVersion: () => poeVersionRef.current,
        getLeague: () => leagueRef.current,
        // `version` arrives already defaulted to the current game by context.ts,
        // so it is always concrete here (unlike use-activate-plugin's inline ctx).
        getLeagues: async (version) => resolveLeagueOptions(await window.api.getSettings().catch(() => null), version),
        getCurrentItem: () => currentItemRef.current,
        getCurrentZone: () => currentZoneRef.current,
        subscribeCurrentItem: (h) => subscribeWhileLoaded(() => onSubscribeCurrentItemRef.current(h)),
        subscribeCurrentZone: (h) => subscribeWhileLoaded(() => onSubscribeCurrentZoneRef.current(h)),
        subscribeLeagueChange: (h) => subscribeWhileLoaded(() => onSubscribeLeagueChangeRef.current(h)),
        onLogLine: (h) => subscribeWhileLoaded(() => window.api.onLogLine(h)),
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
          onChange: (handler) => subscribeWhileLoaded(() => window.api.onGameConfigChange(handler)),
        },
        prices: {
          getSkillPrice: (name, level) => window.api.pricesGetSkill(name, level),
          getPrices: (opts) => window.api.pricesGet(opts),
          refresh: () => window.api.pricesRefresh(),
          onChange: (handler) => subscribeWhileLoaded(() => window.api.onPricesChange(handler)),
        },
        registerPriceCheckAction: ({ label, title, run, isVisible }) => {
          if (!activating) throw new Error(`[plugin:${m.id}] registerPriceCheckAction must be called during activation`)
          if (priceCheckAction) throw new Error(`[plugin:${m.id}] registerPriceCheckAction already called`)
          if (
            !label?.trim() ||
            !title?.trim() ||
            typeof run !== 'function' ||
            (isVisible !== undefined && typeof isVisible !== 'function')
          ) {
            throw new Error(`[plugin:${m.id}] Invalid price-check action`)
          }
          priceCheckAction = { pluginId: m.id, label, title, run, isVisible }
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
        copyAndEvaluateItem: (opts) => onCopyAndEvaluateItemRef.current(opts),
        registerOverlay: (pluginId, opts) => {
          pendingOverlayRef.current.set(pluginId, { title: opts.title, icon: opts.icon, mode: opts.mode })
          setTabs((prev) =>
            prev.map((t) =>
              t.pluginId === pluginId ? { ...t, overlay: { title: opts.title, icon: opts.icon, mode: opts.mode } } : t,
            ),
          )
          void window.api.pluginRegisterOverlay(pluginId, {
            title: opts.title,
            hotkeyLabel: opts.hotkeyLabel,
            defaultSize: opts.defaultSize,
            defaultPosition: opts.defaultPosition,
            snapPositions: opts.snapPositions,
            mode: opts.mode,
            dismissOnEscape: opts.dismissOnEscape,
            dismissOnGameClick: opts.dismissOnGameClick,
          })
        },
        openOverlay: (pluginId) => void window.api.pluginOpenOverlay(pluginId),
        closeOverlay: (pluginId) => void window.api.pluginCloseOverlay(pluginId),
        isOverlayVisible: (pluginId) => window.api.pluginOverlayVisible(pluginId),
        captureGameWindow: (region) => window.api.pluginCaptureGameWindow(region),
        getCursorPosition: () => window.api.pluginGetCursorPosition(),
        media: {
          getSession: () => window.api.pluginMediaGetSession(),
          onChange: (handler) => subscribeWhileLoaded(() => window.api.onMediaChange(handler)),
          playPause: () => window.api.pluginMediaCommand('play-pause'),
          next: () => window.api.pluginMediaCommand('next'),
          previous: () => window.api.pluginMediaCommand('previous'),
        },
      })
      // PluginActivate may be async and may return a teardown fn (host runtime
      // honors it regardless of the SDK's published type; see the SDK task).
      const teardown = await mod.default(ctx)
      if (pluginDisposersRef.current.get(m.id) !== disposers) {
        if (typeof teardown === 'function') teardown()
        return
      }
      if (priceCheckAction) {
        const action = priceCheckAction
        setPriceCheckActions((prev) => [...prev.filter((a) => a.pluginId !== m.id), action])
      }
      if (typeof teardown === 'function') {
        pluginTeardownRef.current.set(m.id, teardown as () => void)
      }
    } catch (err) {
      // activate() may have subscribed before throwing; dispose what it set up
      // so a failed load does not leak subscriptions.
      for (const dispose of disposers.splice(0)) {
        try {
          dispose()
        } catch {
          // ignore: one bad unsubscribe must not block the rest
        }
      }
      if (pluginDisposersRef.current.get(m.id) !== disposers) return
      pluginDisposersRef.current.delete(m.id)
      pluginTeardownRef.current.delete(m.id)
      onPluginErrorRef.current?.(m.id, err instanceof Error ? err : new Error(String(err)))
    } finally {
      activating = false
    }
  }, [])

  // Fully tear a plugin down: run its teardown fn, drop all tracked
  // subscriptions, remove its tab/hotkey/overlay state, and tell main to
  // unregister. Used by both hot-uninstall and update-reload.
  const unloadPlugin = useCallback((pluginId: string): void => {
    const disposers = pluginDisposersRef.current.get(pluginId)
    pluginDisposersRef.current.delete(pluginId)
    const teardown = pluginTeardownRef.current.get(pluginId)
    if (teardown) {
      try {
        teardown()
      } catch (err) {
        onPluginErrorRef.current?.(pluginId, err instanceof Error ? err : new Error(String(err)))
      }
      pluginTeardownRef.current.delete(pluginId)
    }
    if (disposers) {
      for (const dispose of disposers.splice(0)) {
        try {
          dispose()
        } catch {
          // A misbehaving unsubscribe must not block the rest of teardown.
        }
      }
    }
    setTabs((prev) => prev.filter((t) => t.pluginId !== pluginId))
    setPriceCheckActions((prev) => prev.filter((a) => a.pluginId !== pluginId))
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
