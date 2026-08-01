import type { ScalpelPluginContext } from '../../../plugin-sdk/src/types'
import type { PluginContextFactoryDeps } from './types'

const DEBUG = (): boolean => Boolean(window.__SCALPEL_DEBUG_LOG)

export function createPluginContext(deps: PluginContextFactoryDeps): ScalpelPluginContext {
  let tabRegistered = false
  let hotkeyRegistered = false
  let overlayRegistered = false

  return {
    pluginId: deps.pluginId,
    pluginVersion: deps.pluginVersion,
    getPoeVersion: deps.getPoeVersion,
    getLeague: deps.getLeague,
    getLeagues: (version) => deps.getLeagues(version ?? deps.getPoeVersion()),
    getCurrentItem: deps.getCurrentItem,
    getCurrentZone: deps.getCurrentZone,
    onCurrentItem: (h) => deps.subscribeCurrentItem(h),
    onCurrentZone: (h) => deps.subscribeCurrentZone(h),
    onLeagueChange: (h) => deps.subscribeLeagueChange(h),
    onLogLine: (h) => deps.onLogLine(h),
    getRecentLogLines: (count) => deps.getRecentLogLines(count),
    registerTab: (opts) => {
      if (tabRegistered) {
        throw new Error(`[plugin:${deps.pluginId}] registerTab already called`)
      }
      tabRegistered = true
      deps.registerTab(deps.pluginId, opts)
    },
    registerHotkey: (opts, handler) => {
      if (hotkeyRegistered) {
        throw new Error(`[plugin:${deps.pluginId}] registerHotkey already called`)
      }
      hotkeyRegistered = true
      deps.registerHotkey(deps.pluginId, opts, handler)
    },
    registerOverlay: (opts, render) => {
      if (overlayRegistered) {
        throw new Error(`[plugin:${deps.pluginId}] registerOverlay already called`)
      }
      overlayRegistered = true
      // render runs in the SEPARATE overlay window's process (that window
      // re-imports this plugin module). On the main-overlay side we only
      // forward the metadata so the window + hotkey can be wired in main.
      void render
      deps.registerOverlay(deps.pluginId, {
        title: opts.title,
        icon: opts.icon,
        hotkeyLabel: opts.hotkeyLabel,
        defaultSize: opts.defaultSize,
        mode: opts.mode,
      })
    },
    openOverlay: () => deps.openOverlay(deps.pluginId),
    closeOverlay: () => deps.closeOverlay(deps.pluginId),
    // Interactive regions are owned by the annotation-overlay window process
    // (see use-activate-plugin); the main-overlay context never renders the
    // annotation surface, so this is inert here.
    setInteractiveRegion: () => {},
    fetch: window.fetch.bind(window),
    storage: {
      get: <T = unknown>(key: string): Promise<T | null> => deps.storage.get(key) as Promise<T | null>,
      set: <T = unknown>(key: string, value: T): Promise<void> => deps.storage.set(key, value),
      delete: (key: string): Promise<void> => deps.storage.delete(key),
      keys: (): Promise<string[]> => deps.storage.keys(),
    },
    gameConfig: deps.gameConfig,
    prices: deps.prices,
    openExternal: deps.openExternal,
    openTab: () => deps.openTab(deps.pluginId),
    copyAndEvaluateItem: (opts) => deps.copyAndEvaluateItem(opts),
    captureGameWindow: (region) => deps.captureGameWindow(region),
    getCursorPosition: () => deps.getCursorPosition(),
    log: (...args: unknown[]) => {
      if (DEBUG()) {
        // biome-ignore lint/suspicious/noConsole: gated behind DEBUG() debug logging
        console.log(`[plugin:${deps.pluginId}]`, ...args)
      }
    },
  }
}
