import type { ScalpelPluginContext } from '../../../plugin-sdk/src/types'
import type { PluginContextFactoryDeps } from './types'

// Mirrors SCALPEL_DEBUG_LOG into the renderer via a contextBridge global the
// preload sets at boot. Plugins call ctx.log() and the call is dropped when
// the env var isn't set, so debug spam doesn't reach production users.
const DEBUG = (): boolean => {
  return Boolean((globalThis as unknown as { __SCALPEL_DEBUG_LOG?: boolean }).__SCALPEL_DEBUG_LOG)
}

export function createPluginContext(deps: PluginContextFactoryDeps): ScalpelPluginContext {
  let tabRegistered = false
  let hotkeyRegistered = false

  return {
    pluginId: deps.pluginId,
    pluginVersion: deps.pluginVersion,
    getPoeVersion: deps.getPoeVersion,
    getLeague: deps.getLeague,
    getCurrentItem: deps.getCurrentItem,
    getCurrentZone: deps.getCurrentZone,
    onCurrentItem: (h) => deps.subscribeCurrentItem(h),
    onCurrentZone: (h) => deps.subscribeCurrentZone(h),
    onLeagueChange: (h) => deps.subscribeLeagueChange(h),
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
    fetch: window.fetch.bind(window),
    storage: {
      get: <T = unknown>(key: string): Promise<T | null> => deps.storage.get(key) as Promise<T | null>,
      set: <T = unknown>(key: string, value: T): Promise<void> => deps.storage.set(key, value),
      delete: (key: string): Promise<void> => deps.storage.delete(key),
      keys: (): Promise<string[]> => deps.storage.keys(),
    },
    openExternal: deps.openExternal,
    openTab: () => deps.openTab(deps.pluginId),
    copyAndEvaluateItem: () => deps.copyAndEvaluateItem(),
    log: (...args: unknown[]) => {
      if (DEBUG()) {
        // biome-ignore lint/suspicious/noConsole: gated behind DEBUG() debug logging
        console.log(`[plugin:${deps.pluginId}]`, ...args)
      }
    },
  }
}
