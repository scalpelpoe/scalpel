import { setAppMacros } from './hotkeys'
import { getRegisteredPluginHotkeys } from './plugins/hotkey-registry'
import type { AppSettings } from '../shared/types'

/** Merge plugin-registered hotkey stubs into a user-defined macro list.
 *  Plugin hotkeys appear with action "plugin:<id>" and an empty hotkey by
 *  default; setAppMacros skips empty-hotkey entries when registering global
 *  shortcuts but the row still surfaces in the settings UI so the user can
 *  bind a key. */
export function withPluginHotkeys(macros: AppSettings['appMacros']): AppSettings['appMacros'] {
  const out = [...macros]
  const present = new Set(macros.map((m) => m.action))
  for (const [pluginId] of getRegisteredPluginHotkeys()) {
    const action = `plugin:${pluginId}`
    if (!present.has(action)) out.push({ action, hotkey: '' })
  }
  return out
}

// Caller wires this at startup so refreshAppMacros knows where to read the
// current user-configured macros from. Avoids constructing a second Store.
let _macroSource: () => AppSettings['appMacros'] = () => []

export function initAppMacrosRefresh(macroSource: () => AppSettings['appMacros']): void {
  _macroSource = macroSource
}

/** Re-read the current appMacros from settings and re-apply with plugin
 *  stubs included. Call this whenever a plugin registers a hotkey. */
export function refreshAppMacros(): void {
  setAppMacros(withPluginHotkeys(_macroSource() ?? []))
}
