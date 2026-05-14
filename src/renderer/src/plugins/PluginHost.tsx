import { useCallback, useEffect, useRef, useState } from 'react'
import type { PoeItem, Zone } from '../../../shared/types'
import type { PluginActivate, PluginManifest } from '../../../plugin-sdk/src/types'
import { createPluginContext } from './context'

export interface RegisteredTab {
  pluginId: string
  label: string
  icon: string
  render: (container: HTMLElement) => (() => void) | void
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

// Allow tests to swap in a fake importer. The default uses native dynamic import.
//
// Note: at runtime entryUrl is a `file://` URL pointing under userData. In
// packaged builds this works because the renderer also loads from `file://`.
// In dev (where the renderer loads from http://localhost) this may be blocked
// as a cross-origin module import depending on Chromium's policy; plugin
// loading is only fully exercised in packaged smoke tests.
function importPluginModule(entryUrl: string): Promise<unknown> {
  const w = window as unknown as { __pluginImport?: (u: string) => Promise<unknown> }
  if (w.__pluginImport) return w.__pluginImport(entryUrl)
  return import(/* @vite-ignore */ entryUrl)
}

export function PluginHost(props: PluginHostProps): JSX.Element | null {
  const [tabs, setTabs] = useState<RegisteredTab[]>([])
  const loadedRef = useRef(false)
  const pluginHotkeyHandlersRef = useRef<Map<string, () => void>>(new Map())
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
        subscribeCurrentItem: (h) => onSubscribeCurrentItemRef.current(h),
        subscribeCurrentZone: (h) => onSubscribeCurrentZoneRef.current(h),
        subscribeLeagueChange: (h) => onSubscribeLeagueChangeRef.current(h),
        openExternal: (url) => onOpenExternalRef.current(url),
        storage: {
          get: (key) => window.api.pluginStorageGet(m.id, key),
          set: (key, value) => window.api.pluginStorageSet(m.id, key, value),
          delete: (key) => window.api.pluginStorageDelete(m.id, key),
          keys: () => window.api.pluginStorageKeys(m.id),
        },
        registerTab: (pluginId, opts) => {
          setTabs((prev) => {
            if (prev.find((t) => t.pluginId === pluginId)) return prev
            return [...prev, { pluginId, ...opts }]
          })
        },
        registerHotkey: (pluginId, opts, handler) => {
          pluginHotkeyHandlersRef.current.set(pluginId, handler)
          void window.api.pluginRegisterHotkey(pluginId, opts.label)
        },
        openTab: (pluginId) => onOpenPluginTabRef.current(pluginId),
        copyAndEvaluateItem: () => onCopyAndEvaluateItemRef.current(),
      })
      // PluginActivate may be async; await the result so any rejection lands in catch.
      await mod.default(ctx)
    } catch (err) {
      onPluginErrorRef.current?.(m.id, err instanceof Error ? err : new Error(String(err)))
    }
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

  // Hot-uninstall: remove an uninstalled plugin's tab and hotkey handler.
  useEffect(() => {
    return window.api.onPluginUninstalled((pluginId) => {
      setTabs((prev) => prev.filter((t) => t.pluginId !== pluginId))
      pluginHotkeyHandlersRef.current.delete(pluginId)
      void window.api.pluginUnregisterHotkey(pluginId)
      onPluginUnloadedRef.current?.(pluginId)
    })
  }, [])

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
