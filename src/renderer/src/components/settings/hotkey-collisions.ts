import type { RuntimeSettings } from '../../../../shared/types'
import {
  chatCommandEffectiveScope,
  appMacroEffectiveScope,
  scopeAppliesTo,
  type MacroScope,
} from '../../../../shared/macro-scope'

export type HotkeySlot =
  | { kind: 'filter' }
  | { kind: 'pricecheck' }
  | { kind: 'chat'; index: number }
  | { kind: 'appmacro'; index: number }
  | { kind: 'cheatsheet-global' }
  | { kind: 'cheatsheet-category'; index: number }

const slotLabel: Record<string, string> = {
  filter: 'filter',
  pricecheck: 'price check',
  chat: 'macro',
  appmacro: 'app macro',
  'cheatsheet-global': 'Cheat sheet overlay',
}

function slotsEqual(a: HotkeySlot, b: HotkeySlot): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'chat' && b.kind === 'chat') return a.index === b.index
  if (a.kind === 'appmacro' && b.kind === 'appmacro') return a.index === b.index
  if (a.kind === 'cheatsheet-category' && b.kind === 'cheatsheet-category') return a.index === b.index
  return true
}

interface SlotEntry {
  slot: HotkeySlot
  value: string
  label?: string
  scope: MacroScope
}

function buildSlots(settings: RuntimeSettings): SlotEntry[] {
  const cheatSheets = settings.activeProfile?.cheatSheets
  return [
    { slot: { kind: 'filter' }, value: settings.hotkey ?? '', scope: 'both' },
    { slot: { kind: 'pricecheck' }, value: settings.priceCheckHotkey ?? '', scope: 'both' },
    ...(settings.chatCommands ?? []).map<SlotEntry>((c, i) => ({
      slot: { kind: 'chat', index: i },
      value: c.hotkey ?? '',
      scope: chatCommandEffectiveScope(c),
    })),
    ...(settings.appMacros ?? []).map<SlotEntry>((m, i) => ({
      slot: { kind: 'appmacro', index: i },
      value: m.hotkey ?? '',
      scope: appMacroEffectiveScope(m),
    })),
    ...(cheatSheets
      ? [
          {
            slot: { kind: 'cheatsheet-global' as const },
            value: cheatSheets.globalHotkey ?? '',
            scope: 'both' as MacroScope,
          },
        ]
      : []),
    ...(cheatSheets?.categories ?? []).map<SlotEntry>((cat: { hotkey?: string; name: string }, i: number) => ({
      slot: { kind: 'cheatsheet-category', index: i },
      value: cat.hotkey ?? '',
      label: `Cheat sheet: ${cat.name}`,
      scope: 'both',
    })),
  ]
}

/**
 * Find the first slot that already uses the given hotkey, ignoring the slot being edited.
 * Returns null if no collision, otherwise returns the label for a user-facing error message.
 * Only entries applicable to the current game count as collisions; bindings scoped to the
 * other game are invisible here so the user can reuse the key.
 */
export function findHotkeyCollision(
  settings: RuntimeSettings,
  hotkey: string,
  excluding: HotkeySlot,
  currentGame: 1 | 2,
): string | null {
  if (!hotkey) return null

  for (const { slot, value, label, scope } of buildSlots(settings)) {
    if (slotsEqual(slot, excluding)) continue
    if (value !== hotkey) continue
    if (!scopeAppliesTo(scope, currentGame)) continue
    return label ?? slotLabel[slot.kind]
  }
  return null
}

/**
 * If another entry on the same hotkey is scoped to the OTHER game only, return the
 * current-game-only scope so the new binding can be narrowed and avoid a runtime
 * collision in the other game. Returns undefined when no narrowing is required (no
 * cross-game conflict, or the conflicting entry's scope is 'both' which is a same-game
 * collision already caught by findHotkeyCollision).
 */
export function narrowScopeForCrossGameConflict(
  settings: RuntimeSettings,
  hotkey: string,
  excluding: HotkeySlot,
  currentGame: 1 | 2,
): MacroScope | undefined {
  if (!hotkey) return undefined
  const otherGameOnly: MacroScope = currentGame === 1 ? 'poe2' : 'poe1'
  const currentGameOnly: MacroScope = currentGame === 1 ? 'poe1' : 'poe2'

  for (const { slot, value, scope } of buildSlots(settings)) {
    if (slotsEqual(slot, excluding)) continue
    if (value !== hotkey) continue
    if (scope === otherGameOnly) return currentGameOnly
  }
  return undefined
}
