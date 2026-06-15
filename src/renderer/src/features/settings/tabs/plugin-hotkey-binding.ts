import type { AppSettings, RuntimeSettings } from '@shared/types'
import type { HotkeySlot } from '@renderer/components/primitives/hotkey-collisions'

interface PluginHotkeyBindingDeps {
  /** The appMacros action this row binds, e.g. 'plugin:demo' or 'plugin-overlay:demo'. */
  action: string
  settings: RuntimeSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  /** Same conflict checker SettingsPanel passes to the Macros tab. */
  tryHotkey: (hotkey: string, slot: HotkeySlot) => boolean
}

/** Resolve the current hotkey bound to a plugin action and a setter that runs
 *  the conflict check and persists into appMacros. Materializes the entry on
 *  first bind, clears the hotkey to '' on unbind, and never deletes the row.
 *  Pure - safe to call on every render. */
export function pluginHotkeyBinding({ action, settings, update, tryHotkey }: PluginHotkeyBindingDeps): {
  hotkey: string
  setHotkey: (next: string) => void
} {
  const macros = settings.appMacros ?? []
  const index = macros.findIndex((m) => m.action === action)
  const hotkey = index >= 0 ? (macros[index].hotkey ?? '') : ''

  const setHotkey = (next: string): void => {
    // For a not-yet-materialized entry, validate at the prospective index (one
    // past the end). findHotkeyCollision builds slots from the existing
    // appMacros, so that index never matches an existing slot and the new key
    // is checked against everything - exactly what we want.
    const slotIndex = index >= 0 ? index : macros.length
    // Call tryHotkey unconditionally to match MacrosTab. For an empty string
    // (unbind) the conflict checker short-circuits and returns true, so this is
    // a safe no-op there while staying aligned if the checker ever gains
    // pre-change side effects.
    if (!tryHotkey(next, { kind: 'appmacro', index: slotIndex })) return
    if (index >= 0) {
      update(
        'appMacros',
        macros.map((m, i) => (i === index ? { ...m, hotkey: next } : m)),
      )
    } else if (next) {
      update('appMacros', [...macros, { action, hotkey: next }])
    }
    // index < 0 && !next: nothing to clear; no-op.
  }

  return { hotkey, setHotkey }
}
