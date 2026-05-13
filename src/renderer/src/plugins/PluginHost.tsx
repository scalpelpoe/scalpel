import { useEffect, useRef, useState } from 'react'
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
  onPluginError?: (id: string, error: Error) => void
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

  // Push every tab list change up to the parent
  useEffect(() => {
    props.onTabsChange(tabs)
  }, [tabs, props.onTabsChange])

  useEffect(() => {
    if (!props.ready || loadedRef.current) return
    loadedRef.current = true
    let cancelled = false

    void (async () => {
      const installed = await window.api.listInstalledPlugins()
      if (cancelled) return
      for (const entry of installed) {
        const m = entry.manifest as PluginManifest
        if (m.poeVersions && !m.poeVersions.includes(props.poeVersion)) continue
        try {
          const mod = (await importPluginModule(entry.entryUrl)) as { default: PluginActivate }
          if (cancelled) return
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
            subscribeCurrentItem: props.onSubscribeCurrentItem,
            subscribeCurrentZone: props.onSubscribeCurrentZone,
            subscribeLeagueChange: props.onSubscribeLeagueChange,
            openExternal: props.onOpenExternal,
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
          })
          // PluginActivate may be async; await the result so any rejection lands in catch.
          await mod.default(ctx)
        } catch (err) {
          props.onPluginError?.(m.id, err instanceof Error ? err : new Error(String(err)))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [props.ready])

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
        props.onPluginError?.(pluginId, err instanceof Error ? err : new Error(String(err)))
      }
    })
  }, [props.onPluginError])

  return null
}
