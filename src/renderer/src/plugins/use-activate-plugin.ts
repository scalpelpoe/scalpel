import { useEffect, useState } from 'react'
import type { PluginActivate, RegisterOverlayOptions, ScalpelPluginContext } from '../../../plugin-sdk/src/types'
import type { PoeItem, Zone } from '@shared/types'
import { importPluginModule } from './import-plugin-module'

export interface ActivatedPlugin {
  captured: { opts: RegisterOverlayOptions; render: (container: HTMLElement) => (() => void) | void } | null
  error: string | null
}

export function useActivatePlugin(pluginId: string): ActivatedPlugin {
  const [captured, setCaptured] = useState<ActivatedPlugin['captured']>(null)
  const [error, setError] = useState<string | null>(null)

  // Import + activate the plugin module once, in THIS window's process.
  useEffect(() => {
    let cancelled = false
    let latestItem: PoeItem | null = null
    let latestZone: Zone | null = null
    const unsubItem = window.api.onOverlayData((d) => {
      latestItem = d.item
    })
    const unsubZone = window.api.onZoneChanged((z) => {
      latestZone = z
    })
    void (async () => {
      const entry = await window.api.getInstalledPlugin(pluginId)
      if (cancelled || !entry) return
      const state = await window.api.getOverlayState().catch(() => null)
      const poeVersion: 1 | 2 = (state?.poeVersion as 1 | 2) ?? 1
      const settings = await window.api.getSettings().catch(() => null)
      let league = settings?.activeProfile?.league ?? ''
      const mod = (await importPluginModule(entry.entryUrl)) as { default?: PluginActivate }
      if (cancelled || typeof mod.default !== 'function') return
      const capHolder: { value: ActivatedPlugin['captured'] } = { value: null }
      const ctx: ScalpelPluginContext = {
        pluginId,
        pluginVersion: entry.manifest.version,
        getPoeVersion: () => poeVersion,
        getLeague: () => league,
        getCurrentItem: () => latestItem,
        getCurrentZone: () => latestZone,
        onCurrentItem: (h) => window.api.onOverlayData((d) => h(d.item)),
        onCurrentZone: (h) =>
          window.api.onZoneChanged((z) => {
            if (z !== null) h(z)
          }),
        onLeagueChange: (h) =>
          window.api.onLeagueUpdated((l) => {
            league = l
            h(l)
          }),
        onLogLine: (h) => window.api.onLogLine(h),
        getRecentLogLines: (count) => window.api.getRecentLogLines(count),
        // Inert here: the tab + action hotkey are owned by the main overlay,
        // which already ran activate. Only the overlay render is used.
        registerTab: () => {},
        registerHotkey: () => {},
        registerOverlay: (opts, render) => {
          capHolder.value = { opts, render }
        },
        openOverlay: () => {
          void window.api.pluginOpenOverlay(pluginId)
        },
        closeOverlay: () => {
          void window.api.pluginCloseOverlay(pluginId)
        },
        openTab: () => {},
        copyAndEvaluateItem: () => window.api.pluginTriggerMainHotkey(),
        captureGameWindow: (region) => window.api.pluginCaptureGameWindow(region),
        fetch: window.fetch.bind(window),
        storage: {
          get: <T = unknown>(key: string): Promise<T | null> =>
            window.api.pluginStorageGet(pluginId, key) as Promise<T | null>,
          set: <T = unknown>(key: string, value: T): Promise<void> => window.api.pluginStorageSet(pluginId, key, value),
          delete: (key: string): Promise<void> => window.api.pluginStorageDelete(pluginId, key),
          keys: (): Promise<string[]> => window.api.pluginStorageKeys(pluginId),
        },
        gameConfig: {
          read: () => window.api.gameConfigRead(),
          write: (content: string) => window.api.gameConfigWrite(content),
          onChange: (handler: () => void) => window.api.onGameConfigChange(handler),
        },
        prices: {
          getPrices: (opts) => window.api.pricesGet(opts),
          refresh: () => window.api.pricesRefresh(),
          onChange: (handler) => window.api.onPricesChange(handler),
        },
        openExternal: (url) => window.api.openExternal(url),
        log: (...args: unknown[]) => {
          if (window.__SCALPEL_DEBUG_LOG) {
            // biome-ignore lint/suspicious/noConsole: gated behind debug logging
            console.log(`[plugin:${pluginId}]`, ...args)
          }
        },
      }
      // Note: subscriptions a plugin opens via ctx (onLogLine/onCurrentItem/...)
      // are the plugin's to manage per the SDK contract. This window is
      // persistent (hidden, not destroyed, on close), so they correctly survive
      // show/hide. We do not collect them here.
      try {
        await mod.default(ctx)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
        return
      }
      const cap = capHolder.value
      if (cancelled || !cap) return
      setCaptured(cap)
    })()
    return () => {
      cancelled = true
      unsubItem()
      unsubZone()
    }
  }, [pluginId])

  return { captured, error }
}
